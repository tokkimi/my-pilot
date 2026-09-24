import { tr } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { CalEvent, EventType } from '../lib/types'
import { newEvent } from '../lib/seed'
import { ContactSelect, EVENT_TYPES, Field, ListingSelect, MemberSelect, Modal, PageHeader, ScopeFilter } from '../lib/ui'
import { download, isoDate, parseDate } from '../lib/utils'

export default function CalendarPage(_: PageProps) {
  const { db, me, mine, mode } = useStore()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [external, setExternal] = useState<CalEvent[]>([])
  const [externalMessage, setExternalMessage] = useState('')
  const [externalDetail, setExternalDetail] = useState<CalEvent | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const agencyParam = new URLSearchParams(location.search).get('agency') || ''
  useEffect(() => {
    if (mode !== 'remote') return
    let active = true
    const refresh = async () => {
      try {
        const params = new URLSearchParams({ from: cursor.toISOString(), to: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString(), ...(agencyParam ? {agency: agencyParam} : {}) })
        const response = await fetch('/api/calendly?' + params)
        const data = await response.json()
        if (!active) return
        if (!response.ok) { setExternal([]); setExternalMessage(data.error || 'Calendly indisponible'); return }
        setExternal((data.events ?? []).map((e: {uri:string;name:string;start_time:string;end_time:string}) => newEvent(me.id, { id: 'calendly:' + e.uri, title: 'Calendly · ' + e.name, start: localTime(e.start_time), end: localTime(e.end_time), notes: 'Rendez-vous Calendly · consultation uniquement' })))
        setExternalMessage(data.connected ? (data.hasMore ? 'Calendly : 50 rendez-vous affichés, d’autres rendez-vous existent.' : 'Calendly actualisé automatiquement chaque minute.') : 'Connectez Calendly dans Connexions pour afficher vos rendez-vous ici.')
      } catch { if(active) { setExternal([]); setExternalMessage('Actualisation Calendly impossible. Réessayez.') } }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    return () => { active = false; window.clearInterval(timer) }
  }, [cursor, mode, agencyParam, me.id, refreshKey])
  const events = [...db.events, ...external].filter(e => mine(e.agentId))
  const first = new Date(cursor)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first); start.setDate(1 - offset)
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const todayIso = isoDate(new Date())
  const move = (n: number) => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + n); return d })

  const exportIcs = () => {
    const f = (s: string) => s.replace(/[-:]/g, '').slice(0, 13) + '00'
    const body = events.map(e => `BEGIN:VEVENT\nUID:${e.id}@immopilot\nDTSTART:${f(e.start)}\nDTEND:${f(e.end || e.start)}\nSUMMARY:${e.title}\nLOCATION:${e.location}\nDESCRIPTION:${e.notes.replace(/\n/g, '\\n')}\nEND:VEVENT`).join('\n')
    download('calendrier-immopilot.ics', `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ImmoPilot//FR\n${body}\nEND:VCALENDAR`, 'text/calendar')
  }

  return (
    <div>
      <PageHeader title={tr("Calendrier")} subtitle="RDV vendeurs/acheteurs, visites, photos, inspections, notaire"
        actions={<>
          <ScopeFilter />
          <button className="btn-outline" onClick={exportIcs}><Download size={16} /> Exporter .ics (Google / iCloud)</button>
          <button className="btn-primary" onClick={() => setEditing(newEvent(me.id))}><Plus size={16} />{" "}{tr("Événement")}</button>
        </>} />
      {mode === 'remote' && <div className="mb-4 flex flex-wrap items-center gap-3 text-sm"><p role="status">{externalMessage}</p><button className="btn-outline" onClick={() => setRefreshKey(n => n + 1)}>Actualiser Calendly</button></div>}
      <div className="card p-3">
        <div className="mb-3 flex items-center gap-2">
          <button className="btn-ghost p-1.5" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
          <button className="btn-ghost p-1.5" onClick={() => move(1)}><ChevronRight size={18} /></button>
          <h2 className="text-lg font-semibold capitalize">{cursor.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })}</h2>
          <button className="btn-outline ml-auto py-1" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}>Aujourd’hui</button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase text-slate-500">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 border-l border-t border-slate-200">
          {days.map(d => {
            const iso = isoDate(d)
            const evs = events.filter(e => e.start.slice(0, 10) === iso).sort((a, b) => a.start.localeCompare(b.start))
            return (
              <div key={iso} onDoubleClick={() => setEditing(newEvent(me.id, { start: `${iso}T10:00`, end: `${iso}T11:00` }))}
                className={`min-h-24 border-b border-r border-slate-200 p-1 ${d.getMonth() !== cursor.getMonth() ? 'bg-slate-50 text-slate-400' : ''}`}>
                <div className={`mb-1 text-right text-xs ${iso === todayIso ? 'font-bold text-brand-600' : ''}`}>{d.getDate()}</div>
                {evs.map(e => (
                  <button key={e.id} onClick={() => e.id.startsWith('calendly:') ? setExternalDetail(e) : setEditing(e)} className="mb-0.5 block w-full truncate rounded px-1 text-left text-[11px] text-white" style={{ background: EVENT_TYPES[e.type].color }}>
                    {parseDate(e.start)?.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} {e.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {Object.values(EVENT_TYPES).map(t => <span key={t.label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />{t.label}</span>)}
          <span className="text-slate-400">· Double-cliquez sur une journée pour ajouter</span>
        </div>
      </div>
      {externalDetail && <Modal title={externalDetail.title} onClose={() => setExternalDetail(null)}><p>{parseDate(externalDetail.start)?.toLocaleString('fr-CA')} — {parseDate(externalDetail.end)?.toLocaleTimeString('fr-CA')}</p><p className="mt-4">Ce rendez-vous vient de Calendly. Il est actualisé automatiquement. La modification et l’annulation depuis ImmoPilot ne sont pas encore disponibles.</p></Modal>}
      {editing && <EventForm ev={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EventForm({ ev, onClose }: { ev: CalEvent; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [e, setE] = useState(ev)
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setE(x => ({ ...x, [k]: v }))
  const exists = db.events.some(x => x.id === e.id)
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${e.start.replace(/[-:]/g, '')}00/${(e.end || e.start).replace(/[-:]/g, '')}00&location=${encodeURIComponent(e.location)}&details=${encodeURIComponent(e.notes)}`
  return (
    <Modal title={exists ? 'Modifier l’événement' : 'Nouvel événement'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('events', e.id); onClose() }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>}
        <a className="btn-ghost" href={gcal} target="_blank" rel="noreferrer">+ Google Agenda</a>
        <button className="btn-ghost" onClick={onClose}>{tr("Annuler")}</button>
        <button className="btn-primary" onClick={() => { if (e.title.trim()) { upsert('events', e); onClose() } }}>{tr("Enregistrer")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" className="sm:col-span-2"><input className="input" autoFocus value={e.title} onChange={x => set('title', x.target.value)} /></Field>
        <Field label={tr("Type")}><select className="input" value={e.type} onChange={x => set('type', x.target.value as EventType)}>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label={tr("Courtier")}><MemberSelect value={e.agentId} onChange={v => set('agentId', v)} /></Field>
        <Field label={tr("Début")}><input className="input" type="datetime-local" value={e.start} onChange={x => set('start', x.target.value)} /></Field>
        <Field label={tr("Fin")}><input className="input" type="datetime-local" value={e.end} onChange={x => set('end', x.target.value)} /></Field>
        <Field label="Lieu" className="sm:col-span-2"><input className="input" value={e.location} onChange={x => set('location', x.target.value)} /></Field>
        <Field label="Contact"><ContactSelect value={e.contactId} onChange={v => set('contactId', v)} /></Field>
        <Field label="Inscription"><ListingSelect value={e.listingId} onChange={v => set('listingId', v)} /></Field>
        <Field label={tr("Notes")} className="sm:col-span-2"><textarea className="input min-h-20" value={e.notes} onChange={x => set('notes', x.target.value)} /></Field>
      </div>
      {e.type === 'rdv_vendeur' && <p className="mt-3 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">💡 RDV vendeur : suivez le SOP (préparation, caméléon, 3 stratégies de prix, technique FBI, close des 3 oui). Menu « SOP & scripts » → mode présentation.</p>}
    </Modal>
  )
}

function localTime(value: string) { const d = new Date(value); return isoDate(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
