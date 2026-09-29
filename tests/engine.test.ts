import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AGENCIES, agencyDb, newUser, sessionCookie, USERS, type Agency, type User } from '../server/platform'
import { readJson, writeJson } from '../server/storage'
import { blankConnection, getConnection, saveConnection } from '../server/connections'
import { putSecret, getSecret } from '../server/vault'
import { CONNECTOR_IMPL } from '../server/connectors/index'
import { pump, readReviews, readState, requestRun } from '../server/sync/engine'
import { AuthError } from '../server/http'
import { readAudit, verifyChain } from '../server/audit'
import * as syncApi from '../api/sync'
import * as connectApi from '../api/connect'
import * as dataApi from '../api/data'

const A = 'ag_eng'
let admin: User, agent: User, other: User
const req = (path: string, u: User | null, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(u ? { cookie: sessionCookie(u.id, 0).split(';')[0] } : {}), ...(body !== undefined ? { 'content-type': 'application/json', origin: 'http://localhost' } : {}), ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
})

beforeAll(async () => {
  admin = newUser({ email: 'admin@eng.test', name: 'Admin', role: 'admin', agencyId: A }, 'motdepasse123')
  agent = newUser({ email: 'agent@eng.test', name: 'Agent', role: 'courtier', agencyId: A }, 'motdepasse123')
  other = newUser({ email: 'x@other.test', name: 'Autre', role: 'admin', agencyId: 'ag_other' }, 'motdepasse123')
  const agencies: Agency[] = [{ id: A, name: 'Agence Test', plan: 'agence', seats: 0, status: 'actif', createdAt: '', contactEmail: '', notes: '', trialEnds: '' }, { id: 'ag_other', name: 'Autre agence', plan: 'agence', seats: 0, status: 'actif', createdAt: '', contactEmail: '', notes: '', trialEnds: '' }]
  await writeJson(AGENCIES, agencies, null)
  await writeJson(USERS, [admin, agent, other], null)
  await writeJson(agencyDb(A), { version: 2, agency: { name: 'Agence Test' }, contacts: [], events: [], tasks: [], activities: [], listings: [], deals: [], campaigns: [], metrics: [] }, null)
  await writeJson(agencyDb('ag_other'), { version: 2, agency: { name: 'Autre' }, contacts: [{ id: 'secret-contact', firstName: 'Confidentiel' }] }, null)
})

describe('moteur de synchronisation', () => {
  it('synchronise, reprend un travail découpé et ne duplique rien', async () => {
    const c = blankConnection({ provider: 'ics', mode: 'user', ownerId: agent.id, label: 'Agenda test', services: ['events'] })
    await saveConnection(A, c)
    await putSecret(A, c.id, { url: 'https://exemple.test/cal.ics' })
    let call = 0
    const spy = vi.spyOn(CONNECTOR_IMPL.ics, 'sync').mockImplementation(async ctx => {
      call++
      const page = Number(ctx.cursor('page') ?? 0)
      ctx.emit({ kind: 'event', x: `ev${page}`, data: { title: `Visite ${page}`, start: `2026-10-0${page + 1}T10:00`, end: `2026-10-0${page + 1}T11:00` } })
      if (page < 2) { ctx.setCursor('page', String(page + 1)); return { more: true } }
      ctx.setCursor('page', undefined)
      return {}
    })
    await requestRun(A, { trigger: 'manuel', requestedBy: agent.id, connections: [c] })
    const s = await pump(A, 20000)
    expect(s.run).toBeNull()
    expect(s.lastRun?.state).toBe('termine')
    expect(call).toBe(3)
    const doc = (await readJson<{ events: unknown[] }>(agencyDb(A))).data!
    expect(doc.events).toHaveLength(3)
    // deuxième exécution : mêmes données → aucune création
    await requestRun(A, { trigger: 'auto', requestedBy: 'planificateur', connections: [c] })
    await pump(A, 20000)
    expect((await readJson<{ events: unknown[] }>(agencyDb(A))).data!.events).toHaveLength(3)
    expect((await getConnection(A, c.id))!.status).toBe('connecte')
    spy.mockRestore()
  })

  it('un lancement manuel pendant une synchro automatique rejoint l’exécution en cours', async () => {
    const c = (await readJson<{ id: string }[]>(`agencies/${A}/connections.json`)).data![0] as never
    const r1 = await requestRun(A, { trigger: 'auto', requestedBy: 'planificateur', connections: [c] })
    const r2 = await requestRun(A, { trigger: 'manuel', requestedBy: agent.id, connections: [c] })
    expect(r2!.id).toBe(r1!.id)
    expect(r2!.jobs).toHaveLength(1)
    // un seul travailleur à la fois (bail)
    const spy = vi.spyOn(CONNECTOR_IMPL.ics, 'sync').mockImplementation(async () => { await new Promise(r => setTimeout(r, 300)); return {} })
    const [a, b] = await Promise.all([pump(A, 5000), pump(A, 5000)])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(a.lastRun?.id === r1!.id || b.lastRun?.id === r1!.id).toBe(true)
    spy.mockRestore()
  })

  it('accès révoqué : « Reconnecter », données conservées, pas de nouvel appel', async () => {
    const c = blankConnection({ provider: 'ics', mode: 'user', ownerId: agent.id, label: 'Agenda révoqué', services: ['events'] })
    await saveConnection(A, c)
    const spy = vi.spyOn(CONNECTOR_IMPL.ics, 'sync').mockImplementation(async () => { throw new AuthError('invalid_grant') })
    await requestRun(A, { trigger: 'manuel', requestedBy: agent.id, connections: [c] })
    const s = await pump(A, 10000)
    expect(s.lastRun?.state).toBe('echec') // seul outil de l'exécution : échec, jamais « à jour »
    const after = (await getConnection(A, c.id))!
    expect(after.status).toBe('reconnexion')
    expect((await readJson<{ events: unknown[] }>(agencyDb(A))).data!.events.length).toBeGreaterThan(0)
    await requestRun(A, { trigger: 'auto', requestedBy: 'planificateur', connections: [after] })
    await pump(A, 10000)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('erreur fournisseur : pause avec reprise différée, statut honnête', async () => {
    const c = blankConnection({ provider: 'ics', mode: 'user', ownerId: agent.id, label: 'Agenda en panne', services: ['events'] })
    await saveConnection(A, c)
    const spy = vi.spyOn(CONNECTOR_IMPL.ics, 'sync').mockImplementation(async () => { throw new Error('HTTP 503') })
    await requestRun(A, { trigger: 'manuel', requestedBy: agent.id, connections: [c] })
    await pump(A, 10000)
    const x = (await getConnection(A, c.id))!
    expect(x.status).toBe('erreur')
    expect(Date.parse(x.nextAllowedAt)).toBeGreaterThan(Date.now())
    spy.mockRestore()
  })

  it('journal d’audit chaîné et vérifiable', async () => {
    const list = await readAudit(A)
    expect(list.length).toBeGreaterThan(0)
    expect(verifyChain(list)).toBe(-1)
    const tampered = list.map((e, i) => (i === 0 ? { ...e, summary: 'modifié' } : e))
    expect(verifyChain(tampered)).toBe(0)
  })
})

describe('API — permissions, webhooks, confirmations', () => {
  it('bouton Actualiser : synchronise les outils de l’agent et rapporte l’état', async () => {
    const spy = vi.spyOn(CONNECTOR_IMPL.ics, 'sync').mockImplementation(async () => ({}))
    const r = await syncApi.POST(req('/api/sync', agent, { action: 'refresh' }))
    const b = await r.json()
    expect(r.status).toBe(200)
    expect(b.run).toBeNull()
    expect(b.lastRun.trigger).toBe('manuel')
    expect(b.toolsError.length).toBeGreaterThan(0) // l'agenda révoqué est signalé : on ne prétend pas que tout est frais
    spy.mockRestore()
  })

  it('seul l’administrateur modifie la politique; les agences sont isolées', async () => {
    expect((await connectApi.POST(req('/api/connect', agent, { action: 'policy', policy: { ai: { enabled: false } } }))).status).toBe(403)
    const ok = await connectApi.POST(req('/api/connect', admin, { action: 'policy', policy: { providers: { mailchimp: { useRoles: ['admin'] } } } }))
    expect(ok.status).toBe(200)
    const ov = await (await connectApi.GET(req('/api/connect', agent))).json()
    expect(ov.connectors.find((c: { key: string }) => c.key === 'mailchimp').access.use).toBe(false)
    expect(ov.policy).toBeNull()
    // l'autre agence ne voit pas les connexions de celle-ci
    const ov2 = await (await connectApi.GET(req('/api/connect', other))).json()
    expect(ov2.connections).toHaveLength(0)
    const data = await (await dataApi.GET(req('/api/data', agent))).json()
    expect(JSON.stringify(data)).not.toContain('Confidentiel')
  })

  it('refuse le démarrage OAuth d’une application non configurée ou non permise', async () => {
    const r = await connectApi.GET(req('/api/connect?route=start/mailchimp', agent))
    expect(r.status).toBe(302)
    expect(decodeURIComponent(r.headers.get('location')!)).toMatch(/erreur:/)
  })

  it('webhook entrant : jeton obligatoire, contenu rapproché sans doublon', async () => {
    const created = await (await connectApi.POST(req('/api/connect', admin, { action: 'createWebhook', label: 'Zapier' }))).json()
    const path = new URL(created.url).pathname
    const lead = { type: 'lead', id: 'z-1', data: { name: 'Nora Gagnon', email: 'nora@ex.com', phone: '514 555 0199' } }
    expect((await connectApi.POST(req(path, null, lead, { authorization: 'Bearer mauvais' }))).status).toBe(401)
    for (let i = 0; i < 2; i++) expect((await connectApi.POST(req(path, null, lead, { authorization: `Bearer ${created.token}` }))).status).toBe(200)
    await pump(A, 10000)
    const doc = (await readJson<{ contacts: { email: string }[]; tasks: { key?: string }[] }>(agencyDb(A))).data!
    expect(doc.contacts.filter(c => c.email === 'nora@ex.com')).toHaveLength(1)
    expect(doc.tasks.filter(t => t.key?.startsWith('lead:'))).toHaveLength(1)
    // le secret n'est jamais conservé en clair
    const conns = (await readJson<{ settings: Record<string, unknown> }[]>(`agencies/${A}/connections.json`)).data!
    expect(JSON.stringify(conns)).not.toContain(created.token)
  })

  it('import CSV rapproché : réimporter ne crée pas de doublon', async () => {
    const rows = [{ 'Prénom': 'Luc', 'Nom': 'Bélanger', 'Courriel': 'luc@ex.com' }, { 'Prénom': 'Nora', 'Nom': 'Gagnon', 'Courriel': 'NORA@ex.com' }]
    for (let i = 0; i < 2; i++) {
      const r = await connectApi.POST(req('/api/connect', agent, { action: 'import', kind: 'contacts', source: 'Prospects', rows }))
      expect(r.status).toBe(200)
    }
    const doc = (await readJson<{ contacts: { email: string }[] }>(agencyDb(A))).data!
    expect(doc.contacts.filter(c => c.email.toLowerCase() === 'luc@ex.com')).toHaveLength(1)
    expect(doc.contacts.filter(c => c.email.toLowerCase() === 'nora@ex.com')).toHaveLength(1)
  })

  it('action difficile à annuler : aperçu puis confirmation explicite obligatoire', async () => {
    const c = blankConnection({ provider: 'linkedin', mode: 'user', ownerId: agent.id, label: 'LinkedIn', services: ['publish'] })
    await saveConnection(A, c)
    await putSecret(A, c.id, { accessToken: 'jeton-factice', expiresAt: Date.now() + 86400000, extra: { sub: 'abc' } })
    const run = vi.spyOn(CONNECTOR_IMPL.linkedin.actions!.publish, 'run').mockResolvedValue({ summary: 'ok' })
    const params = { text: 'Nouvelle inscription!' }
    const prep = await (await connectApi.POST(req('/api/connect', agent, { action: 'prepare', id: c.id, act: 'publish', params }))).json()
    expect(prep.preview).toContain('Nouvelle inscription!')
    expect((await connectApi.POST(req('/api/connect', agent, { action: 'execute', id: c.id, act: 'publish', params, token: prep.token }))).status).toBe(400) // sans confirm
    expect((await connectApi.POST(req('/api/connect', agent, { action: 'execute', id: c.id, act: 'publish', params: { text: 'autre' }, token: prep.token, confirm: true }))).status).toBe(400) // paramètres changés
    expect((await connectApi.POST(req('/api/connect', admin, { action: 'execute', id: c.id, act: 'publish', params, token: prep.token, confirm: true }))).status).toBe(400) // autre utilisateur
    expect(run).not.toHaveBeenCalled()
    const ok = await connectApi.POST(req('/api/connect', agent, { action: 'execute', id: c.id, act: 'publish', params, token: prep.token, confirm: true }))
    expect(ok.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('déconnexion volontaire : secret détruit, données conservées', async () => {
    const conns = (await readJson<{ id: string; provider: string }[]>(`agencies/${A}/connections.json`)).data!
    const li = conns.find(c => c.provider === 'linkedin')!
    expect((await connectApi.POST(req('/api/connect', admin === agent ? admin : other, { action: 'disconnect', id: li.id }))).status).toBe(404) // autre agence
    expect((await connectApi.POST(req('/api/connect', agent, { action: 'disconnect', id: li.id }))).status).toBe(200)
    expect(await getSecret(A, li.id)).toBeNull()
    expect((await getConnection(A, li.id))!.status).toBe('deconnecte')
  })

  it('« À vérifier » : validation humaine appliquée et journalisée', async () => {
    await writeJson(agencyDb(A), { ...(await readJson<Record<string, unknown>>(agencyDb(A))).data!, listings: [{ id: 'l1', address: '1 rue A', centris: '111', price: 400000 }] }, (await readJson(agencyDb(A))).etag)
    const c = blankConnection({ provider: 'crea', mode: 'agency', ownerId: admin.id, label: 'DDF', services: ['listings'] })
    await saveConnection(A, c)
    const spy = vi.spyOn(CONNECTOR_IMPL.crea, 'sync').mockImplementation(async ctx => { ctx.emit({ kind: 'listing', x: 'K1', match: { centris: '111' }, data: { price: 389000 } }); return {} })
    await requestRun(A, { trigger: 'manuel', requestedBy: admin.id, connections: [c] })
    await pump(A, 10000)
    spy.mockRestore()
    const reviews = (await (await syncApi.GET(req('/api/sync?action=reviews', admin))).json()).reviews
    const r = reviews.find((x: { field: string }) => x.field === 'price')
    expect(r).toMatchObject({ current: 400000, proposed: 389000 })
    expect((await syncApi.POST(req('/api/sync', admin, { action: 'resolve', id: r.id, accept: true }))).status).toBe(200)
    const doc = (await readJson<{ listings: { price: number }[] }>(agencyDb(A))).data!
    expect(doc.listings[0].price).toBe(389000)
    expect((await readReviews(A)).find(x => x.id === r.id)!.status).toBe('accepte')
    expect((await readAudit(A)).some(e => e.kind === 'validation')).toBe(true)
  })

  it('tâche planifiée protégée par CRON_SECRET', async () => {
    delete process.env.CRON_SECRET
    expect((await syncApi.GET(req('/api/sync?action=cron', null))).status).toBe(401)
    process.env.CRON_SECRET = 'cron-test'
    const r = await syncApi.GET(req('/api/sync?action=cron', null, undefined, { authorization: 'Bearer cron-test' }))
    expect(r.status).toBe(200)
    expect((await r.json()).report[A]).toBeDefined()
    expect((await readState(A)).lease).toBeNull()
  })
})
