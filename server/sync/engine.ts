// Moteur de synchronisation commun à tous les connecteurs.
//
//  • Une exécution (« run ») = une liste de travaux, un par connexion. Le bouton « Actualiser », le planificateur
//    et les webhooks alimentent la même file.
//  • Un seul travailleur à la fois par agence (bail avec expiration) : un lancement manuel pendant une
//    synchronisation automatique REJOINT l'exécution en cours au lieu de créer des écritures concurrentes.
//  • Fonctions serverless (30 s) : le travail est découpé; chaque passage (« pump ») traite ce qu'il peut,
//    enregistre les curseurs, et le passage suivant (navigateur qui suit la progression, cron) reprend.
//  • Écritures dans les données de l'agence par concurrence optimiste (etag) : les modifications faites en même
//    temps par les membres ne sont jamais perdues.
import { randomBytes } from 'node:crypto'
import { mutate, readJson } from '../storage.js'
import { agencyDb, loadAgencies, loadUsers, type User } from '../platform.js'
import { audit, type AuditKind } from '../audit.js'
import { AuthError, RateLimited } from '../http.js'
import { getSecret, putSecret, type ConnectionSecret } from '../vault.js'
import { getConnection, listConnections, patchConnection } from '../connections.js'
import { loadOffer, loadPolicy, offeredTo } from '../policy.js'
import { CONNECTOR_IMPL } from '../connectors/index.js'
import { freshToken } from '../connectors/oauth.js'
import { accessToken as googleAccessToken, allowed as googleAllowed } from '../google.js'
import { mergeRecords, type ExtRecord, type LinkState } from './merge.js'
import { consistencyChecks } from './rules.js'
import { migrate } from '../migrations.js'
import type { Connection, ReviewItem, SyncJob, SyncRun, SyncStatus } from '../../src/lib/integrations/types.js'
import type { SyncCtx, SyncOutcome } from '../connectors/types.js'

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface SyncState { lease: { holder: string; until: number } | null; run: SyncRun | null; lastRun: SyncRun | null; history: SyncRun[]; lastRefreshAt: string }
const P = {
  state: (a: string) => `agencies/${a}/sync/state.json`,
  links: (a: string) => `agencies/${a}/sync/links.json`,
  reviews: (a: string) => `agencies/${a}/sync/reviews.json`,
}
const emptyState = (): SyncState => ({ lease: null, run: null, lastRun: null, history: [], lastRefreshAt: '' })
const BACKOFF_MIN = [1, 5, 30, 120, 360]
const nowIso = () => new Date().toISOString()

export async function readState(agencyId: string) { return { ...emptyState(), ...(await readJson<SyncState>(P.state(agencyId))).data } }
export async function readReviews(agencyId: string) { return (await readJson<ReviewItem[]>(P.reviews(agencyId))).data ?? [] }

/** Ajoute des travaux à l'exécution en cours, ou en crée une. */
export async function requestRun(agencyId: string, o: { trigger: SyncRun['trigger']; requestedBy: string; connections: Connection[] }): Promise<SyncRun | null> {
  if (!o.connections.length) return null
  const st = await mutate<SyncState>(P.state(agencyId), emptyState, s0 => {
    const s = { ...emptyState(), ...s0 }
    const jobs = (conns: Connection[]): SyncJob[] => conns.map(c => ({ connectionId: c.id, provider: c.provider, label: c.label, state: 'attente', attempts: 0 }))
    if (s.run && s.run.state === 'en_cours') {
      const pending = new Set(s.run.jobs.filter(j => j.state === 'attente' || j.state === 'en_cours').map(j => j.connectionId))
      const add = o.connections.filter(c => !pending.has(c.id))
      // une connexion déjà terminée dans cette exécution est relancée (données plus récentes demandées)
      return { ...s, run: { ...s.run, jobs: [...s.run.jobs.filter(j => !add.some(c => c.id === j.connectionId)), ...jobs(add)] } }
    }
    return { ...s, run: { id: 'run_' + randomBytes(6).toString('base64url'), trigger: o.trigger, requestedBy: o.requestedBy, startedAt: nowIso(), endedAt: '', state: 'en_cours', jobs: jobs(o.connections) } }
  })
  return st.run
}

async function acquire(agencyId: string, ms: number): Promise<string | null> {
  const holder = randomBytes(8).toString('hex')
  let got = false
  await mutate<SyncState>(P.state(agencyId), emptyState, s => {
    got = false
    if (s.lease && s.lease.until > Date.now()) return s
    got = true
    return { ...s, lease: { holder, until: Date.now() + ms } }
  })
  return got ? holder : null
}
async function release(agencyId: string, holder: string) {
  await mutate<SyncState>(P.state(agencyId), emptyState, s => (s.lease?.holder === holder ? { ...s, lease: null } : s)).catch(() => undefined)
}
async function updateJob(agencyId: string, runId: string, connectionId: string, patch: Partial<SyncJob>) {
  await mutate<SyncState>(P.state(agencyId), emptyState, s => (s.run?.id === runId ? { ...s, run: { ...s.run, jobs: s.run.jobs.map(j => (j.connectionId === connectionId ? { ...j, ...patch } : j)) } } : s))
}

/** Fait avancer la file de l'agence pendant au plus `budgetMs`. Retourne l'état après ce passage. */
export async function pump(agencyId: string, budgetMs = 20000, publicUrl = ''): Promise<SyncState> {
  const end = Date.now() + budgetMs
  const holder = await acquire(agencyId, budgetMs + 15000)
  if (!holder) return readState(agencyId)
  try {
    for (;;) {
      const s = await readState(agencyId)
      const run = s.run
      if (!run || run.state !== 'en_cours') break
      const job = run.jobs.find(j => j.state === 'attente')
      if (!job) { await finishRun(agencyId, run); break }
      if (Date.now() > end - 4000) break
      await updateJob(agencyId, run.id, job.connectionId, { state: 'en_cours', startedAt: job.startedAt ?? nowIso(), attempts: job.attempts + 1 })
      const res = await runJob(agencyId, job.connectionId, Math.min(end, Date.now() + 22000), run.trigger, publicUrl)
      await updateJob(agencyId, run.id, job.connectionId, { ...res, ...(res.state !== 'attente' ? { endedAt: nowIso() } : {}), ...(job.attempts + 1 >= 40 && res.state === 'attente' ? { state: 'erreur', error: 'Volume trop important : reprise à la prochaine synchronisation.' } : {}) })
    }
  } finally { await release(agencyId, holder) }
  return readState(agencyId)
}

async function finishRun(agencyId: string, run: SyncRun) {
  const ok = run.jobs.filter(j => j.state === 'ok').length
  const failed = run.jobs.filter(j => j.state === 'erreur').length
  const state: SyncRun['state'] = failed === 0 ? 'termine' : ok > 0 ? 'partiel' : 'echec'
  // contrôles de cohérence (gratuits) après chaque exécution
  const { data: doc } = await readJson<Doc>(agencyDb(agencyId))
  if (doc) await addReviews(agencyId, consistencyChecks(doc, nowIso()))
  const finished: SyncRun = { ...run, state, endedAt: nowIso() }
  // analyse IA facultative (réglage de l'agence, budget respecté)
  const changes = run.jobs.reduce((n, j) => n + (j.stats ? j.stats.created + j.stats.updated + j.stats.review + j.stats.deleted : 0), 0)
  if (changes > 0) {
    try {
      const { autoAnalyze } = await import('../ai.js')
      const r = await autoAnalyze(agencyId, finished)
      if (r) { finished.aiSummary = r.summary; finished.insights = r.insights }
    } catch (e) { console.error('analyse IA', e) }
  }
  await mutate<SyncState>(P.state(agencyId), emptyState, s => ({
    ...s, run: null, lastRun: finished, history: [finished, ...s.history].slice(0, 60),
    lastRefreshAt: ok > 0 ? finished.endedAt : s.lastRefreshAt,
  }))
  await audit(agencyId, [{ kind: 'synchro', actor: run.requestedBy, provider: '', summary: `Synchronisation ${run.trigger} ${state} : ${ok} outil(s) actualisé(s), ${failed} en erreur, ${changes} changement(s).` }])
}

async function addReviews(agencyId: string, items: ReviewItem[]) {
  if (!items.length) return
  await mutate<ReviewItem[]>(P.reviews(agencyId), () => [], list => {
    const known = new Set(list.map(r => r.key)) // une décision déjà prise (acceptée/rejetée) n'est pas redemandée
    return [...list, ...items.filter(r => !known.has(r.key))].slice(-3000)
  })
}

export function agencyTz(doc: Doc | null) { return (doc?.agency?.timezone as string) || process.env.AGENCY_TIMEZONE || 'America/Toronto' }

/** Services effectivement utilisables pour cette connexion : accordés ∩ autorisés par l'admin (∩ autorisations Google du membre). */
export function effectiveServices(conn: Connection, policyServices: Record<string, boolean>, owner?: User): Set<string> {
  const g = conn.provider === 'google' && owner ? googleAllowed(owner) : null
  return new Set(conn.services.filter(s => policyServices[s] !== false && (!g || (s === 'drive' ? g.drive : s === 'calendar' ? g.calendar : true))))
}

export async function makeCtx(agencyId: string, conn: Connection, deadline: number, doc: Doc, services: Set<string>, policy: SyncCtx['policy'], cursors: Record<string, string>, emitted: ExtRecord[]): Promise<SyncCtx> {
  const impl = CONNECTOR_IMPL[conn.provider]
  let secret: ConnectionSecret | null = null
  const loadSecret = async () => (secret ??= (await getSecret(agencyId, conn.id)) ?? {})
  const saveSecret = async (s: ConnectionSecret) => { secret = s; await putSecret(agencyId, conn.id, s) }
  return {
    agencyId, conn, policy, services, deadline, doc, tz: agencyTz(doc),
    secret: loadSecret, saveSecret,
    async token() {
      if (conn.provider === 'google') {
        const t = await googleAccessToken(conn.ownerId)
        if (!t) throw new AuthError('Accès Google retiré ou expiré : reconnectez votre compte Google.')
        return t.token
      }
      if (!impl.oauth) throw new Error('Ce connecteur n’utilise pas OAuth.')
      return freshToken(impl.oauth, await loadSecret(), saveSecret)
    },
    cursor: k => cursors[k],
    setCursor: (k, v) => { if (v === undefined) delete cursors[k]; else cursors[k] = v },
    emit: r => { emitted.push(...(Array.isArray(r) ? r : [r])) },
    timeLeft: () => deadline - Date.now(),
  }
}

/** Exécute une connexion : collecte → rapprochement → enregistrement → curseurs. */
export async function runJob(agencyId: string, connectionId: string, deadline: number, trigger: SyncRun['trigger'], publicUrl = ''): Promise<Partial<SyncJob>> {
  const conn = await getConnection(agencyId, connectionId)
  if (!conn) return { state: 'ignore', error: 'Connexion retirée.' }
  if (conn.status === 'reconnexion' || conn.status === 'deconnecte') return { state: 'erreur', error: conn.statusDetail || 'Reconnexion requise.' }
  if (conn.nextAllowedAt && conn.nextAllowedAt > nowIso() && trigger !== 'import' && trigger !== 'webhook') return { state: 'erreur', error: `Pause demandée par le fournisseur (limite de débit / reprise après erreur) jusqu’à ${new Date(conn.nextAllowedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })}.` }
  const [policy, offer, users] = await Promise.all([loadPolicy(agencyId), loadOffer(), loadUsers()])
  const pp = policy.providers[conn.provider]
  if (!pp?.enabled || !offeredTo(offer, agencyId).has(conn.provider)) return { state: 'ignore', error: 'Application désactivée par l’administration.' }
  const owner = users.find(u => u.id === conn.ownerId)
  if (conn.mode === 'user' && (!owner || !owner.active || owner.agencyId !== agencyId)) return { state: 'ignore', error: 'Le propriétaire de ce compte n’est plus membre actif de l’agence.' }

  const { data: docRaw } = await readJson<Doc>(agencyDb(agencyId))
  const doc = docRaw ? migrate(docRaw as never).doc as Doc : {}
  const cursors = { ...conn.cursors }
  const emitted: ExtRecord[] = []
  const services = effectiveServices(conn, pp.services, owner)
  const ctx = await makeCtx(agencyId, conn, deadline, doc, services, policy, cursors, emitted)
  let outcome: SyncOutcome | null = null
  let error: unknown = null
  try { outcome = await CONNECTOR_IMPL[conn.provider].sync(ctx) } catch (e) { error = e }

  // on enregistre ce qui a été collecté, même en cas d'échec partiel (rapprochement idempotent)
  let stats: SyncJob['stats']
  if (emitted.length) {
    const agency = (await loadAgencies()).find(a => a.id === agencyId)
    const links = { links: {}, generated: [], ...(await readJson<LinkState>(P.links(agencyId))).data }
    const openKeys = new Set((await readReviews(agencyId)).map(r => r.key))
    let result: ReturnType<typeof mergeRecords> | null = null
    await mutate<Doc>(agencyDb(agencyId), () => ({ agency: { name: agency?.name ?? '' } }), cur => {
      result = mergeRecords(migrate(cur as never).doc as Doc, links, emitted, { provider: conn.provider, connectionId: conn.id, ownerId: conn.ownerId, now: nowIso(), policy, private: conn.mode === 'user' }, openKeys)
      return result.doc
    })
    const r = result! as ReturnType<typeof mergeRecords>
    await mutate<LinkState>(P.links(agencyId), () => ({ links: {}, generated: [] }), () => r.links)
    await addReviews(agencyId, r.reviews)
    stats = r.stats
    const kinds: Record<string, AuditKind> = { import: 'import', maj_auto: 'maj_auto', suppression_auto: 'suppression_auto', a_verifier: 'a_verifier' }
    const entries = r.log.slice(0, 150).map(l => ({ kind: kinds[l.kind], actor: 'synchro', provider: conn.provider, connectionId: conn.id, coll: l.coll, entityId: l.entityId, summary: l.summary }))
    if (r.log.length > 150) entries.push({ kind: 'import', actor: 'synchro', provider: conn.provider, connectionId: conn.id, coll: '', entityId: '', summary: `… et ${r.log.length - 150} autre(s) changement(s)` })
    await audit(agencyId, entries)
  }

  if (error) {
    const msg = (error as Error).message || 'Erreur inconnue'
    if (error instanceof AuthError) {
      await patchConnection(agencyId, conn.id, c => ({ ...c, status: 'reconnexion', statusDetail: msg, lastError: msg, lastSyncAt: nowIso() }))
      await audit(agencyId, [{ kind: 'reconnexion_requise', actor: 'synchro', provider: conn.provider, connectionId: conn.id, summary: `${conn.label} : reconnexion requise (${msg}). Les données déjà importées sont conservées.` }])
      return { state: 'erreur', error: 'Reconnexion requise : ' + msg, stats }
    }
    const wait = error instanceof RateLimited ? error.retryAfterMs : BACKOFF_MIN[Math.min(conn.failures, BACKOFF_MIN.length - 1)] * 60000
    await patchConnection(agencyId, conn.id, c => ({ ...c, status: 'erreur', statusDetail: msg, lastError: msg, failures: c.failures + 1, nextAllowedAt: new Date(Date.now() + wait).toISOString(), lastSyncAt: nowIso() }))
    await audit(agencyId, [{ kind: 'erreur', actor: 'synchro', provider: conn.provider, connectionId: conn.id, summary: `${conn.label} : ${msg}` }])
    return { state: 'erreur', error: msg, stats }
  }

  await outcome?.after?.()
  await patchConnection(agencyId, conn.id, c => ({ ...c, cursors, status: 'connecte', statusDetail: '', lastError: '', failures: 0, nextAllowedAt: '', lastSyncAt: nowIso(), lastSuccessAt: outcome?.more ? c.lastSuccessAt : nowIso(), counts: { ...c.counts, ...outcome?.counts, ...(stats ? { dernierLot: stats.fetched } : {}) }, ...(outcome?.account ? { account: outcome.account } : {}) }))
  // (ré)inscription des webhooks expirés ou absents
  if (publicUrl && !outcome?.more && CONNECTOR_IMPL[conn.provider].registerHooks && /^https:/.test(publicUrl)) {
    const soon = Date.now() + 86400000
    if (!conn.hooks.length && !conn.settings.hooksTried || conn.hooks.some(h => h.expiresAt && Date.parse(h.expiresAt) < soon)) {
      try {
        const hooks = await CONNECTOR_IMPL[conn.provider].registerHooks!(await makeCtx(agencyId, conn, Date.now() + 8000, doc, services, policy, {}, []), publicUrl)
        await patchConnection(agencyId, conn.id, c => ({ ...c, hooks, settings: { ...c.settings, hooksTried: true } }))
      } catch (e) {
        await patchConnection(agencyId, conn.id, c => ({ ...c, settings: { ...c.settings, hooksTried: true, hooksError: String((e as Error).message).slice(0, 200) } }))
      }
    }
  }
  return { state: outcome?.more ? 'attente' : 'ok', stats, error: undefined }
}

/** Connexions dont la synchronisation automatique est due. */
export async function dueConnections(agencyId: string, at = Date.now()) {
  const [conns, policy, offer] = await Promise.all([listConnections(agencyId), loadPolicy(agencyId), loadOffer()])
  const offered = offeredTo(offer, agencyId)
  return conns.filter(c => {
    const p = policy.providers[c.provider]
    if (!p?.enabled || !offered.has(c.provider) || !p.everyMin) return false
    if (c.status === 'reconnexion' || c.status === 'deconnecte') return false
    if (c.nextAllowedAt && Date.parse(c.nextAllowedAt) > at) return false
    return !c.lastSyncAt || Date.parse(c.lastSyncAt) + p.everyMin * 60000 <= at
  })
}

/** Résumé pour le tableau de bord (bouton Actualiser). */
export async function status(agencyId: string, visible: Connection[]): Promise<SyncStatus> {
  const [s, reviews] = await Promise.all([readState(agencyId), readReviews(agencyId)])
  const last = s.lastRun
  return {
    run: s.run, lastRun: last, lastRefreshAt: s.lastRefreshAt,
    toolsOk: visible.filter(c => c.status === 'connecte').length,
    toolsError: visible.filter(c => c.status === 'erreur' || c.status === 'reconnexion').map(c => c.label),
    reviewsOpen: reviews.filter(r => r.status === 'ouvert' && (visible.some(c => c.id === r.connectionId) || !r.connectionId)).length,
    connections: visible.map(c => ({ id: c.id, provider: c.provider, label: c.label, status: c.status, lastSuccessAt: c.lastSuccessAt, lastError: c.lastError })),
  }
}

export { P as SYNC_PATHS, addReviews }
