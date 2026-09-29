// Connexions aux outils externes : état, OAuth, identifiants, déconnexion, webhooks, actions confirmées,
// politiques d'intégration, journal d'activité et test d'affichage intégré.
// Routes : /api/connect/<route> (réécrit en /api/connect?route=<route> par vercel.json).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { agencyDb, currentUser, json, loadAgencies, loadUsers, sameOrigin, type User } from '../server/platform.js'
import { readJson, StorageUnavailable, mutate } from '../server/storage.js'
import { CONNECTORS, INTEGRATIONS, type ConnectorKey } from '../src/lib/integrations/catalog.js'
import type { AgencyPolicy, Connection } from '../src/lib/integrations/types.js'
import { access, isAdmin, loadOffer, loadPolicy, offeredTo, OFFER, savePolicy, type PlatformOffer } from '../server/policy.js'
import { actionableBy, blankConnection, deleteConnection, getConnection, listConnections, patchConnection, reconcileGoogle, refreshableBy, saveConnection, visibleTo } from '../server/connections.js'
import { CONNECTOR_IMPL, platformReady } from '../server/connectors/index.js'
import { authorizeUrl, clearOauthCookie, exchangeCode, newVerifier, oauthCookie, readOauthCookie, readState, signState } from '../server/connectors/oauth.js'
import { csvRecords, webhookRecords } from '../server/connectors/other.js'
import { pushInbox } from '../server/connectors/util.js'
import { deleteSecret, getSecret, putSecret, type ConnectionSecret } from '../server/vault.js'
import { audit, readAudit, verifyChain } from '../server/audit.js'
import { pump, requestRun } from '../server/sync/engine.js'
import { freshToken } from '../server/connectors/oauth.js'
import { revokeGoogle, accessToken as googleToken } from '../server/google.js'

const route = (req: Request) => {
  const u = new URL(req.url)
  const r = u.searchParams.get('route') ?? u.pathname.replace(/^\/api\/connect\/?/, '')
  return r.split('/').filter(Boolean)
}
const publicUrl = (req: Request) => process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
const back = (msg: string, ok = false) => new Response(null, { status: 302, headers: { location: `/app#/platforms/${ok ? 'ok:' : 'erreur:'}${encodeURIComponent(msg)}`, 'set-cookie': clearOauthCookie() } })
const isKey = (k: string): k is ConnectorKey => k in CONNECTORS

export async function GET(req: Request) {
  try {
    const [r0, r1, r2, r3] = route(req)
    if (r0 === 'webhook') return webhookGet(req, r1, r2, r3)
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const q = new URL(req.url).searchParams
    if (r0 === 'start') return start(req, u, r1, q)
    if (r0 === 'callback') return callback(req, u, r1, q)
    if (r0 === 'embedcheck') return embedCheck(u, q.get('key') || '')
    if (r0 === 'audit') {
      if (!isAdmin(u)) return json({ error: 'Réservé à l’administrateur.' }, 403)
      const list = await readAudit(u.agencyId, q.get('month') || undefined)
      return json({ entries: list.slice(-500).reverse(), integrity: verifyChain(list) === -1 ? 'intact' : 'altéré', total: list.length })
    }
    return json(await overview(u))
  } catch (e) { return fail(e) }
}

/** État complet pour l'écran Plateformes : accès, configuration plateforme, connexions visibles, politique (admin). */
async function overview(u: User) {
  const [policy, offer, users] = await Promise.all([loadPolicy(u.agencyId), loadOffer(), loadUsers()])
  const created = await reconcileGoogle(u.agencyId, users)
  if (created.length) await requestRun(u.agencyId, { trigger: 'auto', requestedBy: 'système', connections: created })
  const offered = offeredTo(offer, u.agencyId)
  const conns = visibleTo(u, await listConnections(u.agencyId))
  const names = Object.fromEntries(users.filter(x => x.agencyId === u.agencyId).map(x => [x.id, x.name]))
  const connectors = (Object.keys(CONNECTORS) as ConnectorKey[]).map(k => ({
    key: k, access: access(u, k, policy, offered), ready: platformReady(k), modes: policy.providers[k]?.accountModes ?? [], everyMin: policy.providers[k]?.everyMin ?? 0,
    services: CONNECTORS[k].services.filter(s => policy.providers[k]?.services[s.key]).map(s => s.key),
  })).filter(c => c.access.see)
  return {
    connectors, admin: isAdmin(u), me: u.id,
    connections: conns.map(c => ({ ...c, ownerName: names[c.ownerId] ?? '', mine: c.ownerId === u.id })),
    policy: isAdmin(u) ? policy : null,
    offered: [...offered],
    ai: { configured: !!process.env.OPENAI_API_KEY, enabled: policy.ai.enabled && policy.ai.roles.includes(u.role === 'superadmin' ? 'admin' : u.role) },
    maps: process.env.GOOGLE_MAPS_EMBED_KEY ? { key: process.env.GOOGLE_MAPS_EMBED_KEY } : null,
    cron: !!process.env.CRON_SECRET,
  }
}

// ---------- OAuth ----------
async function start(req: Request, u: User, provider: string, q: URLSearchParams) {
  if (!isKey(provider)) return back('Application inconnue.')
  if (provider === 'google') return new Response(null, { status: 302, headers: { location: '/api/google?action=start' } })
  const impl = CONNECTOR_IMPL[provider]
  if (!impl.oauth) return back('Cette application se connecte par identifiants, pas par OAuth.')
  if (!platformReady(provider).ok) return back(`${CONNECTORS[provider].name} n’est pas encore configuré sur la plateforme (identifiants d’application manquants).`)
  const policy = await loadPolicy(u.agencyId)
  const acc = access(u, provider, policy, offeredTo(await loadOffer(), u.agencyId))
  if (!acc.use) return back(acc.reason)
  const mode = q.get('mode') === 'agency' ? 'agency' : 'user'
  if (!policy.providers[provider]!.accountModes.includes(mode)) return back(mode === 'agency' ? 'Les comptes partagés ne sont pas permis pour cette application.' : 'Les comptes individuels ne sont pas permis pour cette application.')
  if (mode === 'agency' && !isAdmin(u)) return back('Seul un administrateur peut relier un compte partagé par l’agence.')
  const services = CONNECTORS[provider].services.filter(s => policy.providers[provider]!.services[s.key]).map(s => s.key)
  const nonce = randomBytes(16).toString('base64url'), verifier = newVerifier()
  const state = signState({ u: u.id, a: u.agencyId, p: provider, m: mode, n: nonce, s: services, r: q.get('reconnect') || undefined })
  return new Response(null, { status: 302, headers: { location: authorizeUrl(impl.oauth, provider, publicUrl(req), state, services, verifier), 'set-cookie': oauthCookie(nonce, verifier) } })
}

async function callback(req: Request, u: User, provider: string, q: URLSearchParams) {
  if (q.get('error')) return back(`Autorisation refusée dans ${CONNECTORS[provider as ConnectorKey]?.name ?? 'le service'}.`)
  const st = readState(q.get('state') || '')
  const ck = readOauthCookie(req)
  if (!st || !ck || st.n !== ck.n || st.u !== u.id || st.a !== u.agencyId || st.p !== provider || !isKey(provider)) return back('Session de connexion expirée : recommencez.')
  const impl = CONNECTOR_IMPL[provider]
  try {
    const tok = await exchangeCode(impl.oauth!, provider, publicUrl(req), q.get('code') || '', ck.v)
    let secret: ConnectionSecret = { accessToken: tok.accessToken, refreshToken: tok.refreshToken, expiresAt: tok.expiresAt, tokenType: tok.tokenType, extra: tok.extra }
    const info = impl.afterAuth ? await impl.afterAuth(secret) : { account: '' }
    if (info.secret) secret = info.secret
    // reconnexion : même fiche (historique et provenance conservés); sinon nouvelle fiche
    const existing = (await listConnections(u.agencyId)).find(c => (st.r && c.id === st.r) || (c.provider === provider && c.mode === st.m && c.ownerId === u.id && c.account === info.account))
    const conn: Connection = existing
      ? { ...existing, status: 'connecte', statusDetail: '', lastError: '', failures: 0, nextAllowedAt: '', services: st.s, account: info.account || existing.account, hooks: [], settings: { ...existing.settings, hooksTried: false } }
      : blankConnection({ provider, mode: st.m, ownerId: u.id, label: info.label || CONNECTORS[provider].name, account: info.account, services: st.s })
    if (provider === 'meta') conn.settings.pageIds = ((secret.extra?.pages as { id: string }[]) ?? []).map(p => p.id).join(',')
    await putSecret(u.agencyId, conn.id, secret)
    await saveConnection(u.agencyId, conn)
    await audit(u.agencyId, [{ kind: 'connexion', actor: u.id, actorName: u.name, provider, connectionId: conn.id, summary: `${existing ? 'Reconnexion' : 'Connexion'} de ${conn.label} (${conn.account || 'compte'}) — services : ${st.s.join(', ') || 'base'}` }])
    await requestRun(u.agencyId, { trigger: 'manuel', requestedBy: u.id, connections: [conn] })
    return back(`${conn.label} est connecté. Première synchronisation lancée.`, true)
  } catch (e) {
    return back((e as Error).message || 'Connexion impossible.')
  }
}

// ---------- Webhooks (déclenchent une lecture auprès du fournisseur; la charge utile n'est jamais crue sur parole) ----------
async function webhookGet(req: Request, provider?: string, _agencyId?: string, _connId?: string) {
  const q = new URL(req.url).searchParams
  if (provider === 'meta') {
    const ok = q.get('hub.mode') === 'subscribe' && !!process.env.META_WEBHOOK_VERIFY_TOKEN && q.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN
    return new Response(ok ? q.get('hub.challenge') ?? '' : 'refusé', { status: ok ? 200 : 403 })
  }
  return new Response('ok') // validation d'URL (Mailchimp)
}

async function trigger(req: Request, agencyId: string, conns: Connection[], note: string) {
  if (!conns.length) return
  await requestRun(agencyId, { trigger: 'webhook', requestedBy: 'webhook', connections: conns })
  await audit(agencyId, [{ kind: 'webhook', actor: 'webhook', provider: conns[0].provider, connectionId: conns[0].id, summary: note }])
  await pump(agencyId, 8000, publicUrl(req)).catch(e => console.error(e))
}

async function webhookPost(req: Request, provider = '', agencyId = '', connId = ''): Promise<Response> {
  const raw = await req.text()
  const q = new URL(req.url).searchParams
  if (provider === 'microsoft' && q.get('validationToken')) return new Response(q.get('validationToken')!, { headers: { 'content-type': 'text/plain' } })
  if (provider === 'meta') {
    const sig = req.headers.get('x-hub-signature-256') || ''
    const exp = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET || '').update(raw).digest('hex')
    if (!process.env.META_APP_SECRET || sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return new Response('signature', { status: 401 })
    const pageIds = new Set<string>((JSON.parse(raw || '{}').entry ?? []).map((e: { id: string }) => String(e.id)))
    for (const a of await loadAgencies()) {
      const conns = (await listConnections(a.id)).filter(c => c.provider === 'meta' && String(c.settings.pageIds ?? '').split(',').some(p => pageIds.has(p)))
      await trigger(req, a.id, conns, 'Nouvelle demande Lead Ads signalée par Meta')
    }
    return new Response('ok')
  }
  if (!/^[\w-]+$/.test(agencyId) || !/^[\w-]+$/.test(connId)) return new Response('introuvable', { status: 404 })
  const conn = await getConnection(agencyId, connId)
  if (!conn || conn.provider !== provider) return new Response('introuvable', { status: 404 })
  const sec = (await getSecret(agencyId, connId)) ?? {}
  const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  if (provider === 'webhook') {
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || q.get('token') || ''
    const h = createHash('sha256').update(tok).digest('hex')
    if (!tok || !eq(h, String(conn.settings.tokenHash ?? ''))) return json({ error: 'Jeton invalide.' }, 401)
    let body: unknown
    try { body = JSON.parse(raw) } catch { return json({ error: 'JSON invalide.' }, 400) }
    const at = new Date().toISOString()
    const records = webhookRecords(body, at)
    if (!records.length) return json({ ok: true, recus: 0 })
    await pushInbox(agencyId, connId, { id: createHash('sha1').update(raw).digest('hex'), at, records })
    await trigger(req, agencyId, [conn], `Webhook entrant : ${records.length} élément(s) reçu(s)`)
    return json({ ok: true, recus: records.length })
  }
  if (provider === 'google') {
    const tok = req.headers.get('x-goog-channel-token') || ''
    if (!eq(tok, String(sec.extra?.channelToken ?? '#'))) return new Response('jeton', { status: 401 })
    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('ok')
  } else if (provider === 'microsoft') {
    const values = (JSON.parse(raw || '{}').value ?? []) as { clientState?: string }[]
    if (!values.length || values.some(v => !eq(String(v.clientState ?? ''), String(sec.extra?.clientState ?? '#')))) return new Response('clientState', { status: 401 })
  } else if (provider === 'calendly') {
    const h = Object.fromEntries((req.headers.get('calendly-webhook-signature') || '').split(',').map(x => x.split('=') as [string, string]))
    const exp = createHmac('sha256', String(sec.extra?.signingKey ?? '')).update(`${h.t}.${raw}`).digest('hex')
    if (!h.t || !h.v1 || !eq(h.v1, exp) || Math.abs(Date.now() / 1000 - Number(h.t)) > 600) return new Response('signature', { status: 401 })
  } else if (provider !== 'mailchimp') return new Response('introuvable', { status: 404 })
  await trigger(req, agencyId, [conn], `Changement signalé par ${CONNECTORS[conn.provider].name}`)
  return new Response(provider === 'microsoft' ? null : 'ok', { status: provider === 'microsoft' ? 202 : 200 })
}

// ---------- POST ----------
export async function POST(req: Request) {
  try {
    const [r0, r1, r2, r3] = route(req)
    if (r0 === 'webhook') return webhookPost(req, r1, r2, r3)
    if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const b = await req.json().catch(() => ({})) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const agencyId = u.agencyId
    const [policy, offer] = await Promise.all([loadPolicy(agencyId), loadOffer()])
    const offered = offeredTo(offer, agencyId)
    const conn = b.id ? await getConnection(agencyId, String(b.id)) : null

    switch (b.action) {
      case 'connectKey': { // identifiants (CREA DDF) ou adresse privée (.ics) — vérifiés puis chiffrés
        const provider = String(b.provider) as ConnectorKey
        if (!isKey(provider) || !CONNECTOR_IMPL[provider].verifyCredentials) return json({ error: 'Connexion par identifiants non prise en charge.' }, 400)
        const acc = access(u, provider, policy, offered)
        if (!acc.use) return json({ error: acc.reason }, 403)
        const mode = b.mode === 'agency' ? 'agency' : 'user'
        if (!policy.providers[provider]!.accountModes.includes(mode) || (mode === 'agency' && !isAdmin(u))) return json({ error: 'Type de compte non permis.' }, 403)
        const secret: ConnectionSecret = provider === 'ics' ? { url: String(b.url || '').trim() } : { clientId: String(b.clientId || '').trim(), clientSecret: String(b.clientSecret || '').trim() }
        const info = await CONNECTOR_IMPL[provider].verifyCredentials!(secret).catch(e => { throw Object.assign(new Error((e as Error).message), { status: 400 }) })
        const c = conn && conn.provider === provider && actionableBy(u, conn)
          ? { ...conn, status: 'connecte' as const, statusDetail: '', lastError: '', failures: 0, nextAllowedAt: '' }
          : blankConnection({ provider, mode, ownerId: u.id, label: String(b.label || '').slice(0, 80) || info.label || CONNECTORS[provider].name, account: info.account, services: CONNECTORS[provider].services.map(s => s.key) })
        await putSecret(agencyId, c.id, secret)
        await saveConnection(agencyId, c)
        await audit(agencyId, [{ kind: 'connexion', actor: u.id, actorName: u.name, provider, connectionId: c.id, summary: `Connexion de ${c.label} (${info.account})` }])
        await requestRun(agencyId, { trigger: 'manuel', requestedBy: u.id, connections: [c] })
        return json({ ok: true, connection: c })
      }
      case 'createWebhook': { // adresse entrante secrète de l'agence
        if (!isAdmin(u)) return json({ error: 'Réservé à l’administrateur.' }, 403)
        if (!access(u, 'webhook', policy, offered).use) return json({ error: 'Webhook entrant désactivé.' }, 403)
        const token = randomBytes(32).toString('base64url')
        const c = conn?.provider === 'webhook' ? conn : blankConnection({ provider: 'webhook', mode: 'agency', ownerId: u.id, label: String(b.label || 'Webhook entrant').slice(0, 80), account: 'Adresse entrante', services: ['inbound'] })
        c.settings = { ...c.settings, tokenHash: createHash('sha256').update(token).digest('hex') }
        await saveConnection(agencyId, { ...c, status: 'connecte' })
        await audit(agencyId, [{ kind: 'connexion', actor: u.id, actorName: u.name, provider: 'webhook', connectionId: c.id, summary: `Adresse de webhook ${conn ? 'régénérée' : 'créée'} : ${c.label}` }])
        // le jeton n'est affiché qu'une fois; seul son empreinte est conservée
        return json({ ok: true, url: `${publicUrl(req)}/api/connect/webhook/webhook/${agencyId}/${c.id}`, token, connection: c })
      }
      case 'import': { // import CSV : rapproché par le moteur (réimporter le même fichier ne crée pas de doublon)
        if (!access(u, 'csv', policy, offered).use) return json({ error: 'Import désactivé pour votre rôle.' }, 403)
        const rows = Array.isArray(b.rows) ? (b.rows as Record<string, string>[]).slice(0, 5000) : []
        const kind = b.kind === 'listings' ? 'listings' : 'contacts'
        const source = String(b.source || 'Import').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 40) || 'Import'
        const records = csvRecords(rows, kind, source)
        if (!records.length) return json({ error: 'Aucune ligne reconnue (colonnes attendues : prénom, nom, courriel, téléphone… ou adresse, centris, prix).' }, 400)
        const all = await listConnections(agencyId)
        const id = `cx_csv_${u.id}`
        const c = all.find(x => x.id === id) ?? blankConnection({ id, provider: 'csv', mode: 'user', ownerId: u.id, label: `Imports de ${u.name}`, account: 'Fichiers', services: ['import'] })
        await saveConnection(agencyId, { ...c, status: 'connecte' })
        const hash = createHash('sha1').update(JSON.stringify(rows)).digest('hex')
        const at = new Date().toISOString()
        // lots de 500 lignes pour respecter le délai des fonctions
        for (let i = 0; i < records.length; i += 500) await pushInbox(agencyId, c.id, { id: `${hash}-${i}`, at, records: records.slice(i, i + 500), note: source })
        await audit(agencyId, [{ kind: 'import', actor: u.id, actorName: u.name, provider: 'csv', connectionId: c.id, summary: `Import « ${source} » : ${records.length} ligne(s) reconnue(s) sur ${rows.length}` }])
        await requestRun(agencyId, { trigger: 'import', requestedBy: u.id, connections: [c] })
        const st = await pump(agencyId, 15000, publicUrl(req))
        return json({ ok: true, lignes: records.length, run: st.run ?? st.lastRun })
      }
      case 'disconnect': { // déconnexion volontaire : jetons révoqués et détruits, données importées conservées
        if (!conn) return json({ error: 'Connexion introuvable.' }, 404)
        if (!actionableBy(u, conn) && !isAdmin(u)) return json({ error: 'Vous ne pouvez déconnecter que vos propres comptes.' }, 403)
        if (conn.provider === 'google') await revokeGoogle(conn.ownerId)
        else {
          const sec = await getSecret(agencyId, conn.id)
          if (sec && CONNECTOR_IMPL[conn.provider].revoke) await CONNECTOR_IMPL[conn.provider].revoke!(sec).catch(() => undefined)
          await deleteSecret(agencyId, conn.id)
        }
        await patchConnection(agencyId, conn.id, c => ({ ...c, status: 'deconnecte', statusDetail: `Déconnecté par ${u.name}`, hooks: [] }))
        await audit(agencyId, [{ kind: 'deconnexion', actor: u.id, actorName: u.name, provider: conn.provider, connectionId: conn.id, summary: `Déconnexion de ${conn.label}. Les données déjà importées restent dans ImmoPilot avec leur date.` }])
        return json({ ok: true })
      }
      case 'remove': {
        if (!conn) return json({ error: 'Connexion introuvable.' }, 404)
        if (conn.status !== 'deconnecte') return json({ error: 'Déconnectez d’abord ce compte.' }, 400)
        if (!actionableBy(u, conn) && !isAdmin(u)) return json({ error: 'Accès refusé.' }, 403)
        await deleteConnection(agencyId, conn.id)
        return json({ ok: true })
      }
      case 'prepare': { // actions difficiles à annuler : aperçu + jeton de confirmation à usage court
        if (!conn || !actionableBy(u, conn)) return json({ error: 'Vous ne pouvez agir qu’avec vos comptes (ou les comptes partagés, pour l’administrateur).' }, 403)
        if (!access(u, conn.provider, policy, offered).use) return json({ error: 'Application non autorisée pour votre rôle.' }, 403)
        const act = CONNECTOR_IMPL[conn.provider].actions?.[String(b.act)]
        if (!act) return json({ error: 'Action non disponible.' }, 400)
        const params = (b.params ?? {}) as Record<string, unknown>
        const preview = await act.preview(await actionCtx(agencyId, conn, params, u.id))
        const token = signConfirm({ u: u.id, a: agencyId, c: conn.id, act: String(b.act), h: createHash('sha256').update(JSON.stringify(params)).digest('hex'), e: Date.now() + 5 * 60000 })
        await audit(agencyId, [{ kind: 'action_preparee', actor: u.id, actorName: u.name, provider: conn.provider, connectionId: conn.id, summary: `Action préparée (${b.act}) : ${preview.slice(0, 200)}` }])
        return json({ preview, token, expiresIn: 300 })
      }
      case 'execute': {
        const t = readConfirm(String(b.token || ''))
        if (!t || t.u !== u.id || t.a !== agencyId || !conn || conn.id !== t.c || t.act !== b.act || t.h !== createHash('sha256').update(JSON.stringify(b.params ?? {})).digest('hex')) return json({ error: 'Confirmation expirée ou invalide : recommencez.' }, 400)
        if (!b.confirm) return json({ error: 'Confirmation explicite requise.' }, 400)
        if (!actionableBy(u, conn) || !access(u, conn.provider, policy, offered).use) return json({ error: 'Accès refusé.' }, 403)
        const act = CONNECTOR_IMPL[conn.provider].actions![t.act]
        try {
          const r = await act.run(await actionCtx(agencyId, conn, b.params ?? {}, u.id))
          await audit(agencyId, [{ kind: 'action_executee', actor: u.id, actorName: u.name, provider: conn.provider, connectionId: conn.id, summary: `Action confirmée et exécutée (${t.act}) : ${r.summary}` }])
          return json({ ok: true, ...r })
        } catch (e) {
          await audit(agencyId, [{ kind: 'action_refusee', actor: u.id, actorName: u.name, provider: conn.provider, connectionId: conn.id, summary: `Échec de l’action ${t.act} : ${(e as Error).message}` }])
          throw e
        }
      }
      case 'settings': {
        if (!conn || (!actionableBy(u, conn) && !isAdmin(u))) return json({ error: 'Accès refusé.' }, 403)
        await patchConnection(agencyId, conn.id, c => ({ ...c, label: String(b.label ?? c.label).slice(0, 80) }))
        return json({ ok: true })
      }
      case 'policy': {
        if (!isAdmin(u)) return json({ error: 'Réservé à l’administrateur de l’agence.' }, 403)
        const before = policy
        const next = await savePolicy(agencyId, b.policy as Partial<AgencyPolicy>, u.id)
        await audit(agencyId, [{ kind: 'permission', actor: u.id, actorName: u.name, summary: 'Politique des intégrations modifiée', detail: diff(before, next) }])
        // une application désactivée : les connexions existantes passent en « déconnecté » (secrets détruits)
        for (const c of await listConnections(agencyId)) if (!next.providers[c.provider]?.enabled && c.status !== 'deconnecte') {
          if (c.provider === 'google') await revokeGoogle(c.ownerId).catch(() => undefined); else await deleteSecret(agencyId, c.id)
          await patchConnection(agencyId, c.id, x => ({ ...x, status: 'deconnecte', statusDetail: 'Application désactivée par l’administrateur.' }))
        }
        return json({ ok: true, policy: next })
      }
      case 'askReconnect': { // l'admin signale à un membre qu'il doit se reconnecter
        if (!isAdmin(u) || !conn) return json({ error: 'Accès refusé.' }, 403)
        await patchConnection(agencyId, conn.id, c => ({ ...c, status: 'reconnexion', statusDetail: `Reconnexion demandée par ${u.name}` }))
        return json({ ok: true })
      }
      case 'offer': { // super-admin : applications proposées à une agence
        if (u.role !== 'superadmin') return json({ error: 'Réservé aux administrateurs de la plateforme.' }, 403)
        const list = b.providers === 'all' ? 'all' : (Array.isArray(b.providers) ? b.providers.filter(isKey) : [])
        await mutate<PlatformOffer>(OFFER, () => ({ default: 'all', agencies: {}, aiBudget: {} }), o => ({ ...o, agencies: { ...o.agencies, [String(b.agencyId)]: list } }))
        return json({ ok: true })
      }
      case 'refreshable': return json({ ids: refreshableBy(u, await listConnections(agencyId)).map(c => c.id) })
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

async function actionCtx(agencyId: string, conn: Connection, params: Record<string, unknown>, userId: string) {
  const impl = CONNECTOR_IMPL[conn.provider]
  let sec: ConnectionSecret | null = null
  const secret = async () => (sec ??= (await getSecret(agencyId, conn.id)) ?? {})
  return {
    agencyId, conn, params, userId, secret,
    token: async () => {
      if (conn.provider === 'google') { const t = await googleToken(conn.ownerId); if (!t) throw new Error('Reconnectez Google.'); return t.token }
      return freshToken(impl.oauth!, await secret(), async s => { sec = s; await putSecret(agencyId, conn.id, s) })
    },
  }
}

// jetons de confirmation (HMAC, 5 minutes, liés à l'utilisateur, la connexion, l'action et ses paramètres)
const ckey = () => createHash('sha256').update((process.env.SESSION_SECRET || 'dev-secret-change-me') + ':confirm').digest()
function signConfirm(o: { u: string; a: string; c: string; act: string; h: string; e: number }) {
  const p = Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${p}.${createHmac('sha256', ckey()).update(p).digest('base64url')}`
}
function readConfirm(t: string) {
  const [p, s] = t.split('.')
  if (!p || !s) return null
  const exp = createHmac('sha256', ckey()).update(p).digest('base64url')
  if (exp.length !== s.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(s))) return null
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o as { u: string; a: string; c: string; act: string; h: string } : null } catch { return null }
}

function diff(a: unknown, b: unknown, path = '', out: Record<string, unknown> = {}) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!['updatedAt', 'updatedBy'].includes(k)) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out)
  } else out[path] = { avant: a, apres: b }
  return out
}

// ---------- test d'affichage intégré (en-têtes X-Frame-Options / CSP frame-ancestors) ----------
const EMBED = 'platform/embed-checks.json'
async function embedCheck(u: User, key: string) {
  // uniquement les adresses du catalogue ou des plateformes de l'agence (pas de requête vers une adresse arbitraire)
  let url = INTEGRATIONS.find(i => i.key === key)?.url
  if (!url) {
    const { data } = await readJson<{ platforms?: { id: string; url: string }[] }>(agencyDb(u.agencyId))
    url = data?.platforms?.find(p => p.id === key)?.url
  }
  if (!url || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url) || /^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url)) return json({ error: 'Adresse non vérifiable.' }, 400)
  const cache = (await readJson<Record<string, { at: string; embeddable: boolean; reason: string }>>(EMBED)).data ?? {}
  const hit = cache[url]
  if (hit && Date.now() - Date.parse(hit.at) < 86400000) return json({ url, ...hit, cached: true })
  let result: { embeddable: boolean; reason: string }
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (ImmoPilot embed check)' } })
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase()
    const fa = (r.headers.get('content-security-policy') || '').match(/frame-ancestors([^;]*)/i)?.[1]?.trim().toLowerCase() ?? ''
    if (xfo.includes('deny') || xfo.includes('sameorigin')) result = { embeddable: false, reason: `Le site interdit l’affichage dans un cadre (X-Frame-Options: ${xfo}).` }
    else if (fa && !fa.includes('*') && !fa.split(/\s+/).some(s => /immopilot|https:$/.test(s))) result = { embeddable: false, reason: `Le site limite l’affichage intégré (CSP frame-ancestors ${fa}).` }
    else if (r.status >= 400) result = { embeddable: false, reason: `Le site a refusé la vérification (HTTP ${r.status}); ouverture dans une fenêtre à côté.` }
    else result = { embeddable: true, reason: 'Aucun en-tête n’interdit l’affichage intégré. La connexion au compte peut tout de même être bloquée par les cookies tiers du navigateur.' }
  } catch (e) { result = { embeddable: false, reason: `Vérification impossible (${(e as Error).message}).` } }
  await mutate(EMBED, () => ({} as Record<string, unknown>), c => ({ ...c, [url!]: { ...result, at: new Date().toISOString() } })).catch(() => undefined)
  return json({ url, ...result, cached: false })
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  const status = (e as { status?: number }).status
  if (status && status < 500) return json({ error: (e as Error).message }, status)
  console.error(e)
  return json({ error: (e as Error).message || 'Erreur serveur.' }, 500)
}
