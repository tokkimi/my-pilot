import { trialExpired, AGENCIES, agencyDb, newUser, seedAgencyDb, uid, type Agency, bootstrap, checkPassword, clearCookie, currentUser, hashPassword, json, loadAgencies, loadUsers, publicUser, renewCookie, sameOrigin, sessionCookie, trackActivity, USERS, type User } from '../server/platform.js'
import { mutate, storageMode, storageReady, StorageUnavailable, uploadMode } from '../server/storage.js'
import { createHash } from 'node:crypto'

export async function GET(req: Request) {
  if (!storageReady()) return json({ user: null, storage: storageMode() })
  try {
    await bootstrap()
    const u = await currentUser(req, true)
    if (!u) return json({ user: null, storage: storageMode() })
    const agency = (await loadAgencies()).find(a => a.id === u.agencyId) ?? null
    return json({ user: publicUser(u), agency, subscriptionRequired: trialExpired(agency ?? undefined), storage: storageMode(), upload: uploadMode() }, 200, { 'set-cookie': renewCookie(u) })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  const body = await req.json().catch(() => ({})) as { action?: string; email?: string; password?: string; current?: string; next?: string; name?: string; agencyName?: string }
  try {
    if (body.action === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie() })
    if (!storageReady()) throw new StorageUnavailable()
    await bootstrap()

    if (body.action === 'signup') {
      const address = req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for') || 'local'
      const bucket = createHash('sha256').update(address + ':' + Math.floor(Date.now() / 3600000)).digest('hex')
      const attempts = await mutate<{ count: number }>('platform/signup-limits/' + bucket + '.json', () => ({ count: 0 }), x => ({ count: Math.min(x.count + 1, 21) }))
      if (attempts.count > 20) return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429)
      const email = String(body.email || '').trim().toLowerCase()
      const name = String(body.name || '').trim()
      const agencyName = String(body.agencyName || '').trim()
      const password = String(body.password || '')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !agencyName || agencyName.length > 160 || password.length < 12 || password.length > 200)
        return json({ error: 'Indiquez votre nom, votre agence, un courriel valide et un mot de passe de 12 à 200 caractères.' }, 400)
      const agencyId = uid('ag_')
      const user = newUser({ email, name, role: 'admin', agencyId, active: false }, password)
      // Reserve the email atomically; an incomplete setup cannot authenticate.
      try {
        await mutate<User[]>(USERS, () => [], list => {
          if (list.some(x => x.email === email)) throw new Error('EMAIL_EXISTS')
          return [...list, user]
        })
      } catch (e) {
        if (e instanceof Error && e.message === 'EMAIL_EXISTS') return json({ error: 'Ce courriel est déjà utilisé. Connectez-vous à votre compte.' }, 409)
        throw e
      }
      const agency: Agency = { id: agencyId, name: agencyName, plan: 'essai', seats: 3, status: 'actif', createdAt: new Date().toISOString(), contactEmail: email, notes: '', trialEnds: new Date(Date.now() + 3 * 86400000).toISOString() }
      try {
        await mutate(agencyDb(agencyId), () => seedAgencyDb(agencyName, {}, false), d => d)
        await mutate<Agency[]>(AGENCIES, () => [], list => [...list, agency])
        await mutate<User[]>(USERS, () => [], list => list.map(x => x.id === user.id ? { ...x, active: true } : x))
      } catch (e) {
        // Release only an unactivated reservation so the applicant can retry.
        await mutate<User[]>(USERS, () => [], list => list.filter(x => x.id !== user.id || x.active)).catch(() => undefined)
        throw e
      }
      return json({ user: publicUser({ ...user, active: true }), redirect: '/app#/connections' }, 201, { 'set-cookie': sessionCookie(user.id) })
    }

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
      return json({ user: publicUser(u), redirect: u.role === 'superadmin' ? '/admin' : trialExpired(agency) ? '/abonnement' : '/app' }, 200, { 'set-cookie': sessionCookie(u.id, u.sessionVersion ?? 0) })
    }

    if (body.action === 'password') {
      const u = await currentUser(req, true)
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
