import { AGENCIES, agencyDb, bootstrap, checkPassword, clearCookie, currentUser, hashPassword, json, loadAgencies, loadUsers, newUser, PLAN_SEATS, publicUser, renewCookie, sameOrigin, seedAgencyDb, sessionCookie, trackActivity, uid, USERS, type Agency, type User } from '../server/platform.js'
import { mutate, storageMode, storageReady, StorageUnavailable, uploadMode, writeJson } from '../server/storage.js'

export async function GET(req: Request) {
  if (!storageReady()) return json({ user: null, storage: storageMode(), signup: false })
  try {
    await bootstrap()
    const u = await currentUser(req)
    if (!u) return json({ user: null, storage: storageMode(), signup: signupOpen() })
    const agency = (await loadAgencies()).find(a => a.id === u.agencyId) ?? null
    return json({ user: publicUser(u), agency, storage: storageMode(), upload: uploadMode() }, 200, { 'set-cookie': renewCookie(u) })
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

    if (body.action === 'signup') return signup(req, body as Record<string, unknown>)

    if (body.action === 'onboarded') {
      const u = await currentUser(req)
      if (!u) return json({ error: 'Non connecté.' }, 401)
      await mutate<User[]>(USERS, () => [], l => l.map(x => (x.id === u.id ? { ...x, onboardedAt: new Date().toISOString() } : x)))
      return json({ ok: true })
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

// ---------- Inscription libre-service : une agence (essai 30 jours) + son administrateur ----------
const signupHits = new Map<string, { n: number; t: number }>()
export const signupOpen = () => process.env.SIGNUP_ENABLED !== 'false'
async function signup(req: Request, b: Record<string, unknown>) {
  if (!signupOpen()) return json({ error: 'Les inscriptions sont fermées. Contactez-nous.' }, 403)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'local'
  const h = signupHits.get(ip)
  if (h && Date.now() - h.t < 3600000 && h.n >= 5) return json({ error: 'Trop de tentatives, réessayez plus tard.' }, 429)
  signupHits.set(ip, h && Date.now() - h.t < 3600000 ? { n: h.n + 1, t: h.t } : { n: 1, t: Date.now() })
  if (b.website) return json({ ok: true }) // pot de miel anti-robots
  const s = (k: string, max = 120) => String(b[k] ?? '').trim().slice(0, max)
  const email = s('email', 200).toLowerCase(), name = s('name'), agencyName = s('agencyName'), password = String(b.password ?? '')
  if (!name || !agencyName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Nom, agence et courriel valides requis.' }, 400)
  if (password.length < 10) return json({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, 400)
  if (!b.acceptTerms) return json({ error: 'Veuillez accepter les conditions et la politique de confidentialité.' }, 400)
  if ((await loadUsers()).some(u => u.email === email)) return json({ error: 'Un compte existe déjà avec ce courriel. Connectez-vous.' }, 409)
  const agency: Agency = { id: uid('ag_'), name: agencyName, plan: 'essai', seats: PLAN_SEATS.essai, status: 'actif', createdAt: new Date().toISOString(), contactEmail: email, notes: 'Inscription libre-service', trialEnds: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }
  await mutate<Agency[]>(AGENCIES, () => [], l => [...l, agency])
  await writeJson(agencyDb(agency.id), seedAgencyDb(agencyName, {}, false), null)
  const user = newUser({ email, name, role: 'admin', agencyId: agency.id, title: s('title') || 'Courtier immobilier', phone: s('phone', 40) }, password)
  let created = false
  await mutate<User[]>(USERS, () => [], l => { created = !l.some(x => x.email === email); return created ? [...l, user] : l })
  if (!created) return json({ error: 'Un compte existe déjà avec ce courriel.' }, 409)
  await trackActivity(user, true)
  return json({ user: publicUser(user), redirect: '/app' }, 200, { 'set-cookie': sessionCookie(user.id, 0) })
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message, storage: 'none' }, 503)
  console.error(e)
  return json({ error: 'Erreur serveur.' }, 500)
}
