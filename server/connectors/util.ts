// Utilitaires partagés par les connecteurs.
import { mutate } from '../storage.js'
import type { ExtRecord } from '../sync/merge.js'

/** Instant (ISO avec fuseau) → heure murale « AAAA-MM-JJTHH:mm » dans le fuseau de l'agence (format du calendrier ImmoPilot). */
export function toWall(iso: string, tz: string): string {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T00:00`
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const p = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return { firstName: '', lastName: '' }
  return { firstName: p[0], lastName: p.slice(1).join(' ') }
}
export const emailOf = (s: string) => (String(s || '').match(/[^<\s"]+@[^>\s"]+/)?.[0] ?? '').toLowerCase()
export const clip = (s: unknown, n = 1000) => (s === undefined || s === null ? undefined : String(s).slice(0, n))
/** Retire les propriétés non définies (la source ne fournit pas ces champs). */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>
}

// ---------- iCalendar (RFC 5545), sous-ensemble utile ----------
export interface IcsEvent { uid: string; summary: string; start: string; end: string; location: string; description: string; status: string; url: string; allDay: boolean }
export function parseIcs(text: string, tz: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n') // dépliage des lignes
  const out: IcsEvent[] = []
  let cur: Record<string, { v: string; p: Record<string, string> }> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.UID) {
        const s = cur.DTSTART, e = cur.DTEND
        out.push({ uid: cur.UID.v, summary: unescape(cur.SUMMARY?.v ?? ''), start: icsDate(s, tz), end: icsDate(e ?? s, tz), location: unescape(cur.LOCATION?.v ?? ''), description: unescape(cur.DESCRIPTION?.v ?? ''), status: (cur.STATUS?.v ?? '').toUpperCase(), url: cur.URL?.v ?? '', allDay: s?.p.VALUE === 'DATE' || /^\d{8}$/.test(s?.v ?? '') })
      }
      cur = null; continue
    }
    if (!cur) continue
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/)
    if (!m) continue
    const params = Object.fromEntries(m[2].split(';').filter(Boolean).map(x => x.split('=') as [string, string]))
    if (!cur[m[1]]) cur[m[1]] = { v: m[3], p: params }
  }
  return out
}
const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
function icsDate(d: { v: string; p: Record<string, string> } | undefined, tz: string) {
  if (!d) return ''
  const m = d.v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return ''
  if (!m[4]) return `${m[1]}-${m[2]}-${m[3]}T00:00`
  if (m[7]) return toWall(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z`, tz)
  // TZID ou heure « flottante » : heure murale conservée telle quelle
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`
}

// ---------- boîte de réception (webhooks entrants, imports de fichiers) ----------
export interface InboxItem { id: string; at: string; records: ExtRecord[]; note?: string }
const inboxPath = (agencyId: string, connectionId: string) => `agencies/${agencyId}/sync/inbox/${connectionId}.json`
export async function pushInbox(agencyId: string, connectionId: string, item: InboxItem) {
  await mutate<InboxItem[]>(inboxPath(agencyId, connectionId), () => [], l => (l.some(x => x.id === item.id) ? l : [...l, item].slice(-500)))
}
/** Lit et vide la boîte (les éléments ne sont retirés qu'après traitement : voir ackInbox). */
export async function peekInbox(agencyId: string, connectionId: string, max = 50): Promise<InboxItem[]> {
  const { readJson } = await import('../storage.js')
  return ((await readJson<InboxItem[]>(inboxPath(agencyId, connectionId))).data ?? []).slice(0, max)
}
export async function ackInbox(agencyId: string, connectionId: string, ids: string[]) {
  if (!ids.length) return
  await mutate<InboxItem[]>(inboxPath(agencyId, connectionId), () => [], l => l.filter(x => !ids.includes(x.id)))
}
