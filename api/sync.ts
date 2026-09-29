// Synchronisation : bouton « Actualiser », progression, « À vérifier », historique et tâche planifiée (cron).
import { timingSafeEqual } from 'node:crypto'
import { agencyDb, currentUser, json, loadAgencies, loadUsers, sameOrigin, type User } from '../server/platform.js'
import { mutate, StorageUnavailable } from '../server/storage.js'
import { isAdmin } from '../server/policy.js'
import { listConnections, reconcileGoogle, refreshableBy } from '../server/connections.js'
import { dueConnections, pump, readReviews, readState, requestRun, status, SYNC_PATHS } from '../server/sync/engine.js'
import { applyReview } from '../server/sync/merge.js'
import { audit } from '../server/audit.js'
import type { ReviewItem } from '../src/lib/integrations/types.js'

const publicUrl = (req: Request) => process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin

async function mine(u: User) {
  const all = await listConnections(u.agencyId)
  return refreshableBy(u, all).filter(c => c.status !== 'deconnecte')
}
async function reviewsFor(u: User) {
  const visible = new Set((await mine(u)).map(c => c.id))
  return (await readReviews(u.agencyId)).filter(r => r.status === 'ouvert' && (isAdmin(u) || !r.connectionId || visible.has(r.connectionId)))
}

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams
    if (q.get('action') === 'cron') return cron(req)
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    if (q.get('action') === 'reviews') return json({ reviews: (await reviewsFor(u)).slice(-200).reverse() })
    if (q.get('action') === 'history') {
      const s = await readState(u.agencyId)
      return json({ history: s.history.filter(r => isAdmin(u) || r.requestedBy === u.id || r.trigger !== 'manuel').slice(0, 40) })
    }
    return json(await status(u.agencyId, await mine(u)))
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const b = await req.json().catch(() => ({})) as { action?: string; id?: string; accept?: boolean }
    if (b.action === 'refresh') {
      await reconcileGoogle(u.agencyId, await loadUsers())
      const conns = await mine(u)
      if (!conns.length) return json({ ...(await status(u.agencyId, conns)), message: 'Aucun outil connecté : reliez vos applications dans Plateformes.' })
      await requestRun(u.agencyId, { trigger: 'manuel', requestedBy: u.id, connections: conns })
      await pump(u.agencyId, 15000, publicUrl(req))
      return json(await status(u.agencyId, conns))
    }
    if (b.action === 'step') {
      await pump(u.agencyId, 15000, publicUrl(req))
      return json(await status(u.agencyId, await mine(u)))
    }
    if (b.action === 'resolve') {
      const r = (await reviewsFor(u)).find(x => x.id === b.id)
      if (!r) return json({ error: 'Élément introuvable ou déjà traité.' }, 404)
      const now = new Date().toISOString()
      if (b.accept) await mutate<Record<string, unknown>>(agencyDb(u.agencyId), () => ({}), d => applyReview(d, r, u.name, now))
      await mutate<ReviewItem[]>(SYNC_PATHS.reviews(u.agencyId), () => [], l => l.map(x => (x.id === r.id ? { ...x, status: b.accept ? 'accepte' : 'rejete', resolvedBy: u.id, resolvedAt: now } : x)))
      await audit(u.agencyId, [{ kind: b.accept ? 'validation' : 'rejet', actor: u.id, actorName: u.name, coll: r.coll, entityId: r.entityId, summary: `${b.accept ? 'Accepté' : 'Conservé tel quel'} — ${r.fieldLabel} de « ${r.entityLabel} » : ${fmt(r.current)} (${r.currentSource}) → ${fmt(r.proposed)} (${r.proposedSource})` }])
      return json({ ok: true })
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}
const fmt = (v: unknown) => (v === '' || v === undefined || v === null ? '(vide)' : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 120)

/**
 * Tâche planifiée : Vercel Cron (vercel.json) ou tout planificateur externe (ex. GitHub Actions) appelant
 * GET /api/sync?action=cron avec l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 * Chaque connexion est synchronisée selon la fréquence réglée par l'agence; le travail restant reprend au passage suivant.
 */
async function cron(req: Request) {
  const secret = process.env.CRON_SECRET
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return json({ error: 'Non autorisé.' }, 401)
  const end = Date.now() + 25000
  const users = await loadUsers()
  const report: Record<string, string> = {}
  const agencies = (await loadAgencies()).filter(a => a.status === 'actif')
  // ordre tournant pour que chaque agence avance, même si le temps manque
  const offset = Math.floor(Date.now() / 60000) % Math.max(1, agencies.length)
  for (const a of [...agencies.slice(offset), ...agencies.slice(0, offset)]) {
    if (Date.now() > end - 3000) { report[a.id] = 'reporté'; continue }
    try {
      await reconcileGoogle(a.id, users)
      const due = await dueConnections(a.id)
      if (due.length) await requestRun(a.id, { trigger: 'auto', requestedBy: 'planificateur', connections: due })
      const s = await readState(a.id)
      if (s.run) { const after = await pump(a.id, Math.min(15000, end - Date.now()), publicUrl(req)); report[a.id] = after.run ? 'en cours' : 'terminé' }
      else report[a.id] = 'à jour'
    } catch (e) { report[a.id] = 'erreur : ' + (e as Error).message }
  }
  return json({ ok: true, report })
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: (e as Error).message || 'Erreur serveur.' }, 500)
}
