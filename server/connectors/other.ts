// Calendly, CREA DDF® (Realtor.ca), abonnement .ics, webhook entrant et import de fichier.
import { randomBytes } from 'node:crypto'
import { AuthError, call, ProviderError } from '../http.js'
import { ackInbox, clip, defined, parseIcs, peekInbox, splitName, toWall } from './util.js'
import type { Connector } from './types.js'
import type { ExtRecord } from '../sync/merge.js'

const bearer = (t: string) => ({ authorization: `Bearer ${t}` })

// ======================= Calendly =======================
export const calendly: Connector = {
  key: 'calendly',
  oauth: { authorizeUrl: 'https://auth.calendly.com/oauth/authorize', tokenUrl: 'https://auth.calendly.com/oauth/token', scopes: () => [], clientId: () => process.env.CALENDLY_CLIENT_ID, clientSecret: () => process.env.CALENDLY_CLIENT_SECRET, pkce: true },
  async afterAuth(s) {
    const me = await call<{ resource: { uri: string; email: string; name: string; current_organization: string } }>('https://api.calendly.com/users/me', { provider: 'calendly', headers: bearer(s.accessToken!) })
    return { account: me.resource.email, label: `Calendly — ${me.resource.name}`, secret: { ...s, extra: { ...s.extra, userUri: me.resource.uri, orgUri: me.resource.current_organization } } }
  },
  async sync(ctx) {
    const sec = await ctx.secret()
    const user = String(sec.extra?.userUri ?? '')
    const since = ctx.cursor('updated') ?? ''
    const started = new Date().toISOString()
    let page = ctx.cursor('page')
    do {
      const q = new URLSearchParams({ user, count: '100', sort: 'start_time:asc', min_start_time: new Date(Date.now() - 14 * 86400000).toISOString(), max_start_time: new Date(Date.now() + 180 * 86400000).toISOString() })
      if (page) q.set('page_token', page)
      const r = await call<{ collection: { uri: string; name: string; status: string; start_time: string; end_time: string; updated_at: string; location?: { location?: string; join_url?: string } }[]; pagination: { next_page_token?: string } }>(`https://api.calendly.com/scheduled_events?${q}`, { provider: 'calendly', deadline: ctx.deadline, headers: bearer(await ctx.token()) })
      for (const ev of r.collection) {
        const uuid = ev.uri.split('/').pop()!
        let invitee: { name: string; email: string; first_name?: string; last_name?: string; uri: string } | undefined
        if (!since || ev.updated_at > since) {
          if (ctx.timeLeft() < 2500) return { more: true }
          const inv = await call<{ collection: { name: string; email: string; first_name?: string; last_name?: string; uri: string }[] }>(`https://api.calendly.com/scheduled_events/${uuid}/invitees?count=10`, { provider: 'calendly', deadline: ctx.deadline, headers: bearer(await ctx.token()) })
          invitee = inv.collection[0]
          if (invitee && ev.status === 'active') {
            const n = invitee.first_name ? { firstName: invitee.first_name, lastName: invitee.last_name } : splitName(invitee.name)
            ctx.emit({ kind: 'contact', x: `inv:${invitee.email.toLowerCase()}`, lead: true, data: defined({ ...n, email: invitee.email.toLowerCase(), source: 'Calendly' }) })
            ctx.emit({ kind: 'activity', x: `act:${uuid}`, match: { contactEmail: invitee.email }, data: { kind: 'rencontre', date: ev.updated_at.slice(0, 10), summary: `Rendez-vous Calendly pris : ${ev.name} (${toWall(ev.start_time, ctx.tz).replace('T', ' ')})`, memberId: ctx.conn.ownerId } })
          }
        }
        ctx.emit({ kind: 'event', x: uuid, deleted: ev.status === 'canceled', url: ev.location?.join_url,
          data: defined({ title: clip(`${ev.name}${invitee ? ` — ${invitee.name}` : ''}`, 200), start: toWall(ev.start_time, ctx.tz), end: toWall(ev.end_time, ctx.tz), location: clip(ev.location?.location ?? ev.location?.join_url, 300) }),
          match: { contactEmail: invitee?.email } })
      }
      page = r.pagination.next_page_token
      ctx.setCursor('page', page)
    } while (page && ctx.timeLeft() > 3000)
    if (page) return { more: true }
    ctx.setCursor('updated', started)
    return {}
  },
  async registerHooks(ctx, publicUrl) {
    const sec = await ctx.secret()
    const signingKey = randomBytes(24).toString('base64url')
    try {
      const r = await call<{ resource: { uri: string } }>('https://api.calendly.com/webhook_subscriptions', { provider: 'calendly', method: 'POST', headers: bearer(await ctx.token()), json: {
        url: `${publicUrl}/api/connect/webhook/calendly/${ctx.agencyId}/${ctx.conn.id}`, events: ['invitee.created', 'invitee.canceled'], organization: sec.extra?.orgUri, user: sec.extra?.userUri, scope: 'user', signing_key: signingKey,
      } })
      await ctx.saveSecret({ ...sec, extra: { ...sec.extra, signingKey } })
      return [{ id: r.resource.uri, kind: 'invitee', expiresAt: '' }]
    } catch (e) {
      // forfait gratuit : webhooks non disponibles → la vérification périodique prend le relais
      if (e instanceof ProviderError && (e.status === 403 || e.status === 400)) return []
      throw e
    }
  },
  actions: {
    cancel: {
      async preview(a) { return `Annuler le rendez-vous Calendly ${a.params.eventId}. L’invité recevra un avis d’annulation de Calendly${a.params.reason ? ` (motif : ${a.params.reason})` : ''}.` },
      async run(a) {
        await call(`https://api.calendly.com/scheduled_events/${a.params.eventId}/cancellation`, { provider: 'calendly', method: 'POST', headers: bearer(await a.token()), json: { reason: String(a.params.reason ?? 'Annulé depuis ImmoPilot') } })
        return { summary: 'Rendez-vous annulé dans Calendly.' }
      },
    },
  },
}

// ======================= CREA DDF® =======================
async function ddfToken(clientId?: string, clientSecret?: string) {
  if (!clientId || !clientSecret) throw new AuthError('Identifiants DDF manquants.')
  const t = await call<{ access_token: string }>('https://identity.crea.ca/connect/token', { provider: 'crea', method: 'POST', form: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'DDFApi_Read' } }).catch(e => {
    if (e instanceof ProviderError && e.status === 400) throw new AuthError('Identifiants DDF refusés par CREA.')
    throw e
  })
  return t.access_token
}
const DDF_STATUS: Record<string, string> = { Active: 'active', Pending: 'pa_acceptee', Closed: 'vendu', Sold: 'vendu', Expired: 'expire', Withdrawn: 'retire', Canceled: 'retire' }
export const crea: Connector = {
  key: 'crea',
  async verifyCredentials(s) { await ddfToken(s.clientId, s.clientSecret); return { account: `DDF ${s.clientId?.slice(0, 6)}…`, label: 'CREA DDF®' } },
  async sync(ctx) {
    const s = await ctx.secret()
    const token = await ddfToken(s.clientId, s.clientSecret)
    const since = ctx.cursor('modified') ?? '2000-01-01T00:00:00Z'
    let last = since
    for (let i = 0; i < 20; i++) {
      if (ctx.timeLeft() < 3500) { ctx.setCursor('modified', last); return { more: true } }
      const q = new URLSearchParams({ $filter: `ModificationTimestamp gt ${last}`, $orderby: 'ModificationTimestamp', $top: '100' })
      const r = await call<{ value: Record<string, any>[] }>(`https://ddfapi.realtor.ca/odata/v1/Property?${q}`, { provider: 'crea', deadline: ctx.deadline, headers: bearer(token) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const p of r.value) {
        const area = p.LivingArea ? `${p.LivingArea}${p.LivingAreaUnits ? ' ' + String(p.LivingAreaUnits).replace('Square Feet', 'pi²').replace('square feet', 'pi²').replace('Square Meters', 'm²') : ''}` : undefined
        ctx.emit({ kind: 'listing', x: String(p.ListingKey), url: p.ListingURL, at: p.ModificationTimestamp, match: { centris: p.ListingId, address: p.UnparsedAddress },
          data: defined({ address: p.UnparsedAddress?.split(',')[0], city: p.City, centris: p.ListingId ? String(p.ListingId) : undefined, price: p.ListPrice, bedrooms: p.BedroomsTotal, bathrooms: p.BathroomsTotalInteger, livingArea: area, status: DDF_STATUS[p.StandardStatus], externalUrl: p.ListingURL, photoUrl: p.Media?.[0]?.MediaURL }) })
        if (p.ModificationTimestamp > last) last = p.ModificationTimestamp
      }
      if (r.value.length < 100) break
    }
    ctx.setCursor('modified', last)
    return {}
  },
}

// ======================= Abonnement .ics =======================
async function fetchIcs(url: string) {
  const u = url.replace(/^webcal:/i, 'https:')
  if (!/^https:\/\//i.test(u)) throw new AuthError('Adresse d’agenda invalide (https ou webcal requis).')
  const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { accept: 'text/calendar' } })
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new AuthError(`Adresse d’agenda refusée ou régénérée (HTTP ${r.status}).`)
  if (!r.ok) throw new ProviderError(r.status, `Agenda indisponible (HTTP ${r.status})`)
  const text = await r.text()
  if (!text.includes('BEGIN:VCALENDAR')) throw new AuthError('Cette adresse ne renvoie pas un agenda .ics.')
  return text
}
export const ics: Connector = {
  key: 'ics',
  async verifyCredentials(s) { await fetchIcs(s.url ?? ''); return { account: new URL((s.url ?? '').replace(/^webcal:/i, 'https:')).hostname, label: 'Agenda .ics' } },
  async sync(ctx) {
    const events = parseIcs(await fetchIcs((await ctx.secret()).url ?? ''), ctx.tz)
    const from = toWall(new Date(Date.now() - 30 * 86400000).toISOString(), ctx.tz), to = toWall(new Date(Date.now() + 180 * 86400000).toISOString(), ctx.tz)
    const inWindow = events.filter(e => e.start >= from && e.start <= to)
    const seen = new Set(inWindow.map(e => e.uid))
    for (const e of inWindow) ctx.emit({ kind: 'event', x: e.uid, deleted: e.status === 'CANCELLED', url: e.url || undefined, data: defined({ title: clip(e.summary, 200), start: e.start, end: e.end, location: clip(e.location, 300), notes: clip(e.description, 1000) }) })
    // disparus du flux depuis la dernière lecture = supprimés à la source
    const previous: string[] = JSON.parse(ctx.cursor('uids') ?? '[]')
    for (const uid of previous) if (!seen.has(uid)) ctx.emit({ kind: 'event', x: uid, deleted: true, data: {} })
    ctx.setCursor('uids', JSON.stringify([...seen].slice(0, 3000)))
    return {}
  },
}

// ======================= Webhook entrant & import de fichier =======================
// Les données reçues sont d'abord déposées dans une boîte de réception, puis traitées par le moteur
// (même rapprochement, mêmes règles, même journal) : un envoi répété ne crée pas de doublon.
function inboxConnector(key: 'webhook' | 'csv'): Connector {
  return {
    key,
    async sync(ctx) {
      const items = await peekInbox(ctx.agencyId, ctx.conn.id, 40)
      for (const it of items) ctx.emit(it.records)
      const more = items.length === 40
      return { more, after: () => ackInbox(ctx.agencyId, ctx.conn.id, items.map(i => i.id)) }
    },
  }
}
export const webhook = inboxConnector('webhook')
export const csv = inboxConnector('csv')

/** Convertit une charge utile de webhook (Zapier, Make, Apify, eZsign…) en enregistrements. Aucun champ n'est déduit. */
export function webhookRecords(body: unknown, receivedAt: string): ExtRecord[] {
  const items = Array.isArray(body) ? body : (body as { items?: unknown[] })?.items ?? [body]
  const out: ExtRecord[] = []
  for (const raw of items.slice(0, 200)) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const d = (it.data && typeof it.data === 'object' ? it.data : it) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const type = String(it.type ?? it.kind ?? (d.email || d.phone || d.telephone ? 'lead' : d.EventName || d.eventName ? 'event_log' : 'unknown')).toLowerCase()
    const id = String(it.id ?? d.id ?? d.external_id ?? '')
    const s = (k: string) => (d[k] === undefined || d[k] === null ? undefined : String(d[k]).trim())
    const name = s('name') ?? s('full_name') ?? s('nom_complet')
    const person = defined({ firstName: s('firstName') ?? s('first_name') ?? s('prenom') ?? (name ? splitName(name).firstName : undefined), lastName: s('lastName') ?? s('last_name') ?? s('nom') ?? (name ? splitName(name).lastName : undefined), email: (s('email') ?? s('courriel'))?.toLowerCase(), phone: s('phone') ?? s('telephone'), city: s('city') ?? s('ville'), address: s('address') ?? s('adresse'), source: s('source') ?? 'Webhook', notes: s('message') ?? s('notes') })
    const x = id || [person.email, person.phone, person.firstName, person.lastName].filter(Boolean).join('|')
    if ((type === 'lead' || type === 'contact' || type === 'prospect') && x) out.push({ kind: 'contact', x: `c:${x}`, lead: type !== 'contact', data: person })
    else if ((type === 'event' || type === 'rendez-vous') && id && s('start')) out.push({ kind: 'event', x: `e:${id}`, deleted: /cancel|annul/i.test(s('status') ?? ''), data: defined({ title: s('title') ?? s('titre'), start: s('start')!.slice(0, 16), end: (s('end') ?? s('start'))!.slice(0, 16), location: s('location') ?? s('lieu') }), match: { contactEmail: s('contactEmail') } })
    else if ((type === 'task' || type === 'tache') && id && s('title')) out.push({ kind: 'task', x: `t:${id}`, data: defined({ title: s('title'), due: s('due')?.slice(0, 10), notes: s('notes') }) })
    else if ((type === 'listing' || type === 'inscription') && (s('centris') || s('address'))) out.push({ kind: 'listing', x: `l:${id || s('centris') || s('address')}`, match: { centris: s('centris'), address: s('address') }, data: defined({ address: s('address'), city: s('city'), centris: s('centris'), price: d.price !== undefined ? Number(d.price) : undefined, status: s('status') }) })
    else {
      // événement externe non structuré (ex. « DocumentCompleted » eZsign) : journalisé tel quel, avec sa date
      const label = s('EventName') ?? s('eventName') ?? s('event') ?? type
      out.push({ kind: 'metric', x: `evt:${id || label}:${receivedAt}`, data: { label: `Événement reçu — ${clip(label, 80)}`, value: 1, unit: 'événement', at: receivedAt, ownerId: '' } })
    }
  }
  return out
}

/** Lignes CSV (déjà analysées dans le navigateur) → enregistrements, selon le type choisi. */
export function csvRecords(rows: Record<string, string>[], kind: 'contacts' | 'listings', source: string): ExtRecord[] {
  const pick = (r: Record<string, string>, ...keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))) { const v = String(r[k] ?? '').trim(); if (v) return v }
    return undefined
  }
  return rows.slice(0, 5000).flatMap((r): ExtRecord[] => {
    if (kind === 'contacts') {
      const full = pick(r, 'nom complet', 'name', 'full name')
      const data = defined({ firstName: pick(r, 'prenom', 'first name', 'firstname') ?? (full ? splitName(full).firstName : undefined), lastName: pick(r, 'nom', 'last name', 'lastname', 'nom de famille') ?? (full ? splitName(full).lastName : undefined), email: pick(r, 'courriel', 'email', 'e-mail', 'adresse courriel')?.toLowerCase(), phone: pick(r, 'telephone', 'phone', 'cellulaire', 'mobile', 'tel'), address: pick(r, 'adresse', 'address'), city: pick(r, 'ville', 'city'), source })
      const x = pick(r, 'id', 'identifiant') ?? [data.email, data.phone, data.firstName, data.lastName].filter(Boolean).join('|')
      return x ? [{ kind: 'contact' as const, x: `${source}:${x}`, data }] : []
    }
    const price = pick(r, 'prix', 'price', 'prix demande')
    const data = defined({ address: pick(r, 'adresse', 'address'), city: pick(r, 'ville', 'city'), centris: pick(r, 'centris', 'no centris', 'mls', 'no mls'), price: price ? Number(price.replace(/[^\d.]/g, '')) : undefined, livingArea: pick(r, 'superficie', 'superficie habitable', 'living area') })
    const x = data.centris ?? data.address
    return x ? [{ kind: 'listing' as const, x: `${source}:${x}`, match: { centris: data.centris, address: data.address }, data }] : []
  })
}
