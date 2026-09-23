import { bootstrap, checkPassword, clearCookie, currentUser, hashPassword, json, loadAgencies, loadUsers, publicUser, renewCookie, sameOrigin, sessionCookie, trackActivity, USERS, type User } from '../server/platform.js'
import { mutate, storageMode, storageReady, StorageUnavailable } from '../server/storage.js'

export async function GET(req: Request) {
  if (!storageReady()) return json({ user: null, storage: storageMode() })
  try {
    await bootstrap()
    const u = await currentUser(req)
    if (!u) return json({ user: null, storage: storageMode() })
    const agency = (await loadAgencies()).find(a => a.id === u.agencyId) ?? null
    return json({ user: publicUser(u), agency, storage: storageMode() }, 200, { 'set-cookie': renewCookie(u) })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  const body = await req.json().catch(() => ({})) as { action?: string; email?: string; password?: string; current?: string; next?: string }
  try {
    if (body.action === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie() })
    if (!storageReady()) throw new StorageUnavailable()
    await bootstrap()

    if (body.action === 'login') {
      const email = String(body.email || '').trim().toLowerCase()
      const pw = String(body.password || '')
      const users = await loadUsers()
      const u = users.find(x => x.email === email)
      if (u?.lockedUntil && u.lockedUntil > new Date().toISOString()) return json({ error: 'Compte temporairement verrouillé (trop de tentatives). Réessayez dans 15 minutes.' }, 429)
      if (!u || !u.active || !checkPassword(u, pw)) {
        if (u) await mutate<User[]>(USERS, () => [], l => l.map(x => x.id === u.id ? { ...x, failed: x.failed + 1, lockedUntil: x.failed + 1 >= 8 ? new Date(Date.now() + 15 * 60000).toISOString() : '' } : x))
        await new Promise(r => setTimeout(r, 400))
        return json({ error: 'Courriel ou mot de passe invalide.' }, 401)
      }
      const agency = (await loadAgencies()).find(a => a.id === u.agencyId)
      if (u.role !== 'superadmin' && agency?.status === 'suspendu') return json({ error: 'L’abonnement de votre agence est suspendu. Contactez-nous.' }, 403)
      await trackActivity(u, true)
      return json({ user: publicUser(u), redirect: u.role === 'superadmin' ? '/admin' : '/app' }, 200, { 'set-cookie': sessionCookie(u.id, u.sessionVersion ?? 0) })
    }

    if (body.action === 'password') {
      const u = await currentUser(req)
      if (!u) return json({ error: 'Non connecté.' }, 401)
      if (!checkPassword(u, String(body.current || ''))) return json({ error: 'Mot de passe actuel invalide.' }, 400)
      if (String(body.next || '').length < 8) return json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' }, 400)
      const { salt, hash } = hashPassword(String(body.next))
      // les autres appareils sont déconnectés; l'appareil actuel reste connecté
      const version = (u.sessionVersion ?? 0) + 1
      await mutate<User[]>(USERS, () => [], l => l.map(x => x.id === u.id ? { ...x, salt, hash, mustChangePassword: false, sessionVersion: version } : x))
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie(u.id, version) })
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message, storage: 'none' }, 503)
  console.error(e)
  return json({ error: 'Erreur serveur.' }, 500)
}
