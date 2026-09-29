// Google : reprend l'intégration existante (jetons chiffrés par utilisateur, autorisations de l'admin)
// et l'étend au moteur de synchronisation. Le jeton est fourni par server/google.ts (accessToken).
import { randomBytes } from 'node:crypto'
import { call, ProviderError } from '../http.js'
import { clip, defined, emailOf, toWall } from './util.js'
import type { Connector, SyncCtx } from './types.js'
import type { ExtRecord } from '../sync/merge.js'

const G = (ctx: SyncCtx) => async <T = any>(url: string, init: Parameters<typeof call>[1] = {}) => // eslint-disable-line @typescript-eslint/no-explicit-any
  call<T>(url, { ...init, provider: 'google', deadline: ctx.deadline, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${await ctx.token()}` } })

export const google: Connector = {
  key: 'google',
  async sync(ctx) {
    let more = false
    const s = ctx.services
    if (s.has('calendar') && ctx.timeLeft() > 3000) more = (await calendar(ctx)) || more
    if (s.has('drive') && ctx.timeLeft() > 3000) await drive(ctx)
    if (s.has('contacts') && ctx.timeLeft() > 3000) more = (await contacts(ctx)) || more
    if (s.has('gmail') && ctx.timeLeft() > 3000) more = (await gmail(ctx)) || more
    if (s.has('youtube') && ctx.timeLeft() > 2000) await youtube(ctx)
    if (s.has('gbp') && ctx.timeLeft() > 3000) await gbp(ctx)
    return { more }
  },
  async registerHooks(ctx, publicUrl) {
    if (!ctx.services.has('calendar')) return []
    const token = randomBytes(18).toString('base64url')
    const r = await G(ctx)<{ id: string; resourceId: string; expiration: string }>('https://www.googleapis.com/calendar/v3/calendars/primary/events/watch', {
      method: 'POST', json: { id: `ip-${ctx.conn.id}-${Date.now()}`, type: 'web_hook', address: `${publicUrl}/api/connect/webhook/google/${ctx.agencyId}/${ctx.conn.id}`, token, params: { ttl: String(7 * 86400) } },
    })
    await ctx.saveSecret({ ...(await ctx.secret()), extra: { ...(await ctx.secret()).extra, channelToken: token, resourceId: r.resourceId } })
    return [{ id: r.id, kind: 'calendar', expiresAt: new Date(Number(r.expiration)).toISOString() }]
  },
}

/** Agenda principal : fenêtre −30/+180 jours, incrémental par date de mise à jour (inclut les annulations). */
async function calendar(ctx: SyncCtx) {
  const g = G(ctx)
  const started = new Date().toISOString()
  const since = ctx.cursor('cal.updatedMin')
  let page = ctx.cursor('cal.page')
  do {
    const q = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '250', timeMin: new Date(Date.now() - 30 * 86400000).toISOString(), timeMax: new Date(Date.now() + 180 * 86400000).toISOString() })
    if (since) q.set('updatedMin', since)
    if (page) q.set('pageToken', page)
    let r: { items?: any[]; nextPageToken?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
    try { r = await g(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`) } catch (e) {
      // curseur trop ancien (410) : on repart d'une lecture complète de la fenêtre, sans doublon grâce au rapprochement
      if (e instanceof ProviderError && e.status === 410 && since) { ctx.setCursor('cal.updatedMin', undefined); ctx.setCursor('cal.page', undefined); return true }
      throw e
    }
    ctx.emit((r.items ?? []).map(ev => calendarRecord(ev, ctx)))
    page = r.nextPageToken
    ctx.setCursor('cal.page', page)
    if (page && ctx.timeLeft() < 4000) return true
  } while (page)
  ctx.setCursor('cal.updatedMin', new Date(Date.parse(started) - 60000).toISOString())
  return false
}
function calendarRecord(ev: any, ctx: SyncCtx): ExtRecord { // eslint-disable-line @typescript-eslint/no-explicit-any
  const other = (ev.attendees ?? []).find((a: { self?: boolean; email?: string; resource?: boolean }) => !a.self && !a.resource)?.email
  return {
    kind: 'event', x: ev.id, deleted: ev.status === 'cancelled', url: ev.htmlLink, at: ev.updated,
    data: defined({ title: clip(ev.summary, 200), start: toWall(ev.start?.dateTime ?? ev.start?.date, ctx.tz), end: toWall(ev.end?.dateTime ?? ev.end?.date, ctx.tz), location: clip(ev.location, 300) }),
    match: { immopilotId: ev.extendedProperties?.private?.immopilotId, contactEmail: other },
  }
}

/** Fichiers des dossiers Drive rattachés aux inscriptions et dossiers (portée drive.file : fichiers d'ImmoPilot seulement). */
async function drive(ctx: SyncCtx) {
  const g = G(ctx)
  const targets: { coll: 'listings' | 'deals'; id: string; folder: string }[] = []
  for (const coll of ['listings', 'deals'] as const) for (const e of ctx.doc[coll] ?? []) if (e.driveFolderId && (e.agentId === ctx.conn.ownerId)) targets.push({ coll, id: e.id, folder: e.driveFolderId })
  for (const t of targets.slice(0, 40)) {
    if (ctx.timeLeft() < 3000) break
    try {
      const q = encodeURIComponent(`'${t.folder}' in parents and trashed=false`)
      const r = await g<{ files?: { id: string; name: string; webViewLink: string; modifiedTime: string; mimeType: string }[] }>(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&fields=files(id,name,webViewLink,modifiedTime,mimeType)`)
      const docs = (r.files ?? []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder').map(f => ({ id: f.id, name: f.name, url: f.webViewLink, modifiedAt: f.modifiedTime }))
      ctx.emit({ kind: 'doc', x: `drive:${t.folder}`, target: { coll: t.coll, id: t.id }, data: { docs } })
    } catch (e) { if (!(e instanceof ProviderError && e.status === 404)) throw e }
  }
}

/** Google Contacts (People API) avec jeton de synchronisation. */
async function contacts(ctx: SyncCtx) {
  const g = G(ctx)
  let sync = ctx.cursor('ppl.sync')
  let page = ctx.cursor('ppl.page')
  do {
    const q = new URLSearchParams({ personFields: 'names,emailAddresses,phoneNumbers,addresses,birthdays,metadata', pageSize: '500', requestSyncToken: 'true' })
    if (sync) q.set('syncToken', sync)
    if (page) q.set('pageToken', page)
    let r: { connections?: any[]; nextPageToken?: string; nextSyncToken?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
    try { r = await g(`https://people.googleapis.com/v1/people/me/connections?${q}`) } catch (e) {
      if (e instanceof ProviderError && (e.status === 410 || e.status === 400) && sync) { ctx.setCursor('ppl.sync', undefined); sync = undefined; page = undefined; continue } // jeton expiré → resynchronisation complète
      throw e
    }
    for (const p of r.connections ?? []) {
      const n = p.names?.[0] ?? {}, b = p.birthdays?.[0]?.date
      ctx.emit({
        kind: 'contact', x: p.resourceName, deleted: !!p.metadata?.deleted,
        data: defined({ firstName: n.givenName, lastName: n.familyName, email: p.emailAddresses?.[0]?.value?.toLowerCase(), phone: p.phoneNumbers?.[0]?.value, address: p.addresses?.[0]?.streetAddress, city: p.addresses?.[0]?.city, birthday: b?.year && b?.month ? `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : undefined, source: 'Google Contacts' }),
      })
    }
    page = r.nextPageToken
    ctx.setCursor('ppl.page', page)
    if (r.nextSyncToken) ctx.setCursor('ppl.sync', r.nextSyncToken)
    if (page && ctx.timeLeft() < 4000) return true
  } while (page)
  return false
}

/** Gmail, en-têtes seulement : historise les échanges avec des contacts EXISTANTS (aucun contact créé depuis un courriel). */
async function gmail(ctx: SyncCtx) {
  const g = G(ctx)
  const U = 'https://gmail.googleapis.com/gmail/v1/users/me'
  let ids: string[] = []
  const start = ctx.cursor('gm.history')
  const profile = await g<{ emailAddress: string; historyId: string }>(`${U}/profile`)
  if (!start) {
    const r = await g<{ messages?: { id: string }[] }>(`${U}/messages?maxResults=25`)
    ids = (r.messages ?? []).map(m => m.id)
  } else {
    try {
      const r = await g<{ history?: { messagesAdded?: { message: { id: string } }[] }[] }>(`${U}/history?startHistoryId=${start}&historyTypes=messageAdded&maxResults=200`)
      ids = (r.history ?? []).flatMap(h => (h.messagesAdded ?? []).map(m => m.message.id))
    } catch (e) { if (e instanceof ProviderError && e.status === 404) ids = []; else throw e }
  }
  for (const id of [...new Set(ids)].slice(0, 60)) {
    if (ctx.timeLeft() < 2500) return true
    const m = await g<{ id: string; internalDate: string; payload?: { headers?: { name: string; value: string }[] } }>(`${U}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`)
    const h = Object.fromEntries((m.payload?.headers ?? []).map(x => [x.name.toLowerCase(), x.value]))
    const from = emailOf(h.from), sent = from === profile.emailAddress.toLowerCase()
    const other = sent ? emailOf(h.to) : from
    ctx.emit({ kind: 'activity', x: `gmail:${m.id}`, url: `https://mail.google.com/mail/u/0/#all/${m.id}`, match: { contactEmail: other }, data: { kind: 'courriel', date: new Date(Number(m.internalDate)).toISOString().slice(0, 10), summary: `${sent ? 'Courriel envoyé' : 'Courriel reçu'} : ${clip(h.subject || '(sans objet)', 180)}`, memberId: ctx.conn.ownerId } })
  }
  ctx.setCursor('gm.history', profile.historyId)
  return false
}

async function youtube(ctx: SyncCtx) {
  const r = await G(ctx)<{ items?: { id: string; snippet: { title: string }; statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string } }[] }>('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true')
  const now = new Date().toISOString()
  for (const c of r.items ?? []) {
    const m = (k: string, label: string, v?: string) => v !== undefined && ctx.emit({ kind: 'metric', x: `yt:${c.id}:${k}`, url: `https://www.youtube.com/channel/${c.id}`, data: { label: `${label} — ${c.snippet.title}`, value: Number(v), unit: '', at: now, ownerId: ctx.conn.ownerId } })
    m('subs', 'Abonnés YouTube', c.statistics.subscriberCount); m('views', 'Vues YouTube', c.statistics.viewCount); m('videos', 'Vidéos YouTube', c.statistics.videoCount)
  }
}

async function gbp(ctx: SyncCtx) {
  const g = G(ctx)
  const acc = await g<{ accounts?: { name: string }[] }>('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')
  const now = new Date().toISOString()
  for (const a of (acc.accounts ?? []).slice(0, 3)) {
    const locs = await g<{ locations?: { name: string; title: string }[] }>(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=20`)
    for (const l of (locs.locations ?? []).slice(0, 10)) {
      if (ctx.timeLeft() < 2500) return
      const r = await g<{ averageRating?: number; totalReviewCount?: number }>(`https://mybusiness.googleapis.com/v4/${a.name}/${l.name}/reviews?pageSize=1`)
      if (r.averageRating !== undefined) ctx.emit({ kind: 'metric', x: `gbp:${l.name}:rating`, data: { label: `Note Google — ${l.title}`, value: r.averageRating, unit: '/5', at: now, ownerId: ctx.conn.ownerId } })
      if (r.totalReviewCount !== undefined) ctx.emit({ kind: 'metric', x: `gbp:${l.name}:count`, data: { label: `Avis Google — ${l.title}`, value: r.totalReviewCount, unit: 'avis', at: now, ownerId: ctx.conn.ownerId } })
    }
  }
}
