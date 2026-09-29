// Assistant IA intégré (API OpenAI côté serveur). Les permissions sont vérifiées à chaque appel.
import { currentUser, json, sameOrigin } from '../server/platform.js'
import { StorageUnavailable } from '../server/storage.js'
import { aiAccess, loadPolicy } from '../server/policy.js'
import { aiModel, ask, decide, listProposals } from '../server/ai.js'

export async function GET(req: Request) {
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const policy = await loadPolicy(u.agencyId)
    const a = aiAccess(u, policy)
    return json({ available: a.ok, reason: a.reason, model: a.ok ? aiModel() : '', proposals: a.ok ? await listProposals(u.agencyId, u) : [], collections: policy.ai.collections })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const a = aiAccess(u, await loadPolicy(u.agencyId))
    if (!a.ok) return json({ error: a.reason }, 403)
    const b = await req.json().catch(() => ({})) as { action?: string; question?: string; focus?: { coll: string; id: string }; id?: string; accept?: boolean }
    if (b.action === 'ask') {
      const q = String(b.question ?? '').trim()
      if (!q) return json({ error: 'Question vide.' }, 400)
      const focus = b.focus && ['contacts', 'listings', 'deals'].includes(b.focus.coll) && /^[\w-]+$/.test(b.focus.id) ? b.focus : undefined
      return json(await ask(u.agencyId, u, q, focus))
    }
    if (b.action === 'decide') return json({ ok: true, proposal: await decide(u.agencyId, u, String(b.id), !!b.accept) })
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: (e as Error).message || 'Erreur serveur.' }, 500)
}
