// Microsoft 365 / Outlook via Microsoft Graph : requêtes delta (calendrier, contacts, métadonnées de courriels).
import { randomBytes } from 'node:crypto'
import { call, ProviderError } from '../http.js'
import { clip, defined, emailOf } from './util.js'
import type { Connector, SyncCtx } from './types.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES: Record<string, string> = { calendar: 'Calendars.ReadWrite', contacts: 'Contacts.Read', mail: 'Mail.ReadBasic' }
const tenant = () => process.env.MICROSOFT_TENANT || 'common'

const M = (ctx: SyncCtx) => async <T = any>(url: string, init: Parameters<typeof call>[1] = {}) => // eslint-disable-line @typescript-eslint/no-explicit-any
  call<T>(url.startsWith('http') ? url : GRAPH + url, { ...init, provider: 'microsoft', deadline: ctx.deadline, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${await ctx.token()}`, prefer: `outlook.timezone="${ctx.tz}", odata.maxpagesize=100` } })

export const microsoft: Connector = {
  key: 'microsoft',
  oauth: {
    authorizeUrl: `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    scopes: s => ['offline_access', 'openid', 'email', 'User.Read', ...s.map(x => SCOPES[x]).filter(Boolean)],
    clientId: () => process.env.MICROSOFT_CLIENT_ID, clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET, pkce: true, extraAuth: { response_mode: 'query' },
  },
  async afterAuth(s) {
    const me = await call<{ mail?: string; userPrincipalName?: string; displayName?: string }>(`${GRAPH}/me`, { provider: 'microsoft', headers: { authorization: `Bearer ${s.accessToken}` } })
    return { account: me.mail || me.userPrincipalName || '', label: `Microsoft 365 — ${me.displayName ?? ''}`.trim() }
  },
  async sync(ctx) {
    let more = false
    if (ctx.services.has('calendar') && ctx.timeLeft() > 3000) more = (await delta(ctx, 'cal', `/me/calendarView/delta?startDateTime=${new Date(Date.now() - 30 * 86400000).toISOString()}&endDateTime=${new Date(Date.now() + 180 * 86400000).toISOString()}`, ev => ({
      kind: 'event', x: ev.id, deleted: !!ev['@removed'] || ev.isCancelled, url: ev.webLink,
      data: defined({ title: clip(ev.subject, 200), start: ev.start?.dateTime?.slice(0, 16), end: ev.end?.dateTime?.slice(0, 16), location: clip(ev.location?.displayName, 300) }),
      match: { contactEmail: ev.attendees?.[0]?.emailAddress?.address },
    }))) || more
    if (ctx.services.has('contacts') && ctx.timeLeft() > 3000) more = (await delta(ctx, 'ct', '/me/contacts/delta?$select=givenName,surname,emailAddresses,mobilePhone,businessPhones,homeAddress,birthday', c => ({
      kind: 'contact', x: c.id, deleted: !!c['@removed'],
      data: defined({ firstName: c.givenName, lastName: c.surname, email: c.emailAddresses?.[0]?.address?.toLowerCase(), phone: c.mobilePhone || c.businessPhones?.[0], address: c.homeAddress?.street, city: c.homeAddress?.city, birthday: c.birthday?.slice(0, 10), source: 'Outlook' }),
    }))) || more
    if (ctx.services.has('mail')) for (const folder of ['inbox', 'sentitems']) {
      if (ctx.timeLeft() < 3000) return { more: true }
      more = (await delta(ctx, `mail.${folder}`, `/me/mailFolders/${folder}/messages/delta?$select=subject,from,toRecipients,receivedDateTime,webLink`, m => {
        const sent = folder === 'sentitems'
        const other = sent ? m.toRecipients?.[0]?.emailAddress?.address : m.from?.emailAddress?.address
        return { kind: 'activity', x: `outlook:${m.id}`, url: m.webLink, deleted: false, match: { contactEmail: emailOf(other) }, data: { kind: 'courriel', date: String(m.receivedDateTime ?? '').slice(0, 10), summary: `${sent ? 'Courriel envoyé' : 'Courriel reçu'} : ${clip(m.subject || '(sans objet)', 180)}`, memberId: ctx.conn.ownerId } }
      }, true)) || more
    }
    return { more }
  },
  async registerHooks(ctx, publicUrl) {
    if (!ctx.services.has('calendar')) return []
    const clientState = randomBytes(18).toString('base64url')
    const r = await M(ctx)<{ id: string; expirationDateTime: string }>('/subscriptions', { method: 'POST', json: {
      changeType: 'created,updated,deleted', notificationUrl: `${publicUrl}/api/connect/webhook/microsoft/${ctx.agencyId}/${ctx.conn.id}`, resource: '/me/events',
      expirationDateTime: new Date(Date.now() + 2.5 * 86400000).toISOString(), clientState,
    } })
    await ctx.saveSecret({ ...(await ctx.secret()), extra: { ...(await ctx.secret()).extra, clientState } })
    return [{ id: r.id, kind: 'events', expiresAt: r.expirationDateTime }]
  },
}

/** Parcourt une requête delta Graph; le lien delta final est conservé comme curseur. */
async function delta(ctx: SyncCtx, name: string, first: string, map: (x: any) => Parameters<SyncCtx['emit']>[0], skipDeletes = false) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = M(ctx)
  let url = ctx.cursor(`${name}.next`) || ctx.cursor(`${name}.delta`) || first
  for (;;) {
    let r: { value?: any[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
    try { r = await g(url) } catch (e) {
      if (e instanceof ProviderError && e.status === 410) { ctx.setCursor(`${name}.delta`, undefined); ctx.setCursor(`${name}.next`, undefined); url = first; continue }
      throw e
    }
    for (const x of r.value ?? []) { if (skipDeletes && x['@removed']) continue; ctx.emit(map(x)) }
    if (r['@odata.nextLink']) {
      url = r['@odata.nextLink']
      ctx.setCursor(`${name}.next`, url)
      if (ctx.timeLeft() < 4000) return true
      continue
    }
    ctx.setCursor(`${name}.next`, undefined)
    if (r['@odata.deltaLink']) ctx.setCursor(`${name}.delta`, r['@odata.deltaLink'])
    return false
  }
}
