// Comptes, agences, sessions et statistiques de la plateforme.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mutate, readJson, writeJson } from './storage.js'
import { seed } from '../src/lib/seed.js'
import type { DB } from '../src/lib/types.js'

export type PlatformRole = 'superadmin' | 'admin' | 'courtier' | 'adjointe' | 'agent'
export interface User {
  id: string; email: string; name: string; role: PlatformRole; agencyId: string; active: boolean
  title: string; phone: string; color: string; split: number; licence: string
  salt: string; hash: string; createdAt: string; lastLoginAt: string; lastSeenAt: string; loginCount: number
  failed: number; lockedUntil: string; mustChangePassword: boolean
}
export type Plan = 'essai' | 'solo' | 'equipe' | 'agence' | 'entreprise' | 'illimite'
export interface Agency { id: string; name: string; plan: Plan; seats: number; status: 'actif' | 'suspendu'; createdAt: string; contactEmail: string; notes: string; trialEnds: string }
export interface Lead { id: string; createdAt: string; name: string; email: string; phone: string; agency: string; role: string; agents: string; interest: string; message: string; status: 'nouveau' | 'contacte' | 'converti' | 'archive'; notes: string }
export interface Activity { days: Record<string, { logins: number; active: string[] }> }

export const USERS = 'platform/users.json'
export const AGENCIES = 'platform/agencies.json'
export const LEADS = 'platform/leads.json'
export const ACTIVITY = 'platform/activity.json'
export const agencyDb = (id: string) => `agencies/${id}/db.json`

export const uid = (p = '') => p + randomBytes(9).toString('base64url')
const now = () => new Date().toISOString()
const day = () => now().slice(0, 10)

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(pw, salt, 64).toString('hex') }
}
export function checkPassword(u: User, pw: string) {
  const a = Buffer.from(u.hash, 'hex')
  const b = scryptSync(pw, u.salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const publicUser = (u: User) => {
  const { salt: _s, hash: _h, failed: _f, lockedUntil: _l, ...rest } = u
  return rest
}

// ---------- Sessions (cookie signé HMAC) ----------
const COOKIE = 'ip_session'
const secret = () => process.env.SESSION_SECRET || 'dev-secret-change-me'
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('base64url')
export function sessionCookie(userId: string, maxAgeDays = 30) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + maxAgeDays * 86400000 })).toString('base64url')
  const secure = process.env.VERCEL ? '; Secure' : ''
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure}`
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
function readSession(req: Request): string | null {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return e > Date.now() ? u : null
  } catch { return null }
}

export async function loadUsers() { return (await readJson<User[]>(USERS)).data ?? [] }
export async function loadAgencies() { return (await readJson<Agency[]>(AGENCIES)).data ?? [] }

export async function currentUser(req: Request): Promise<User | null> {
  const id = readSession(req)
  if (!id) return null
  const u = (await loadUsers()).find(x => x.id === id)
  return u && u.active ? u : null
}

// ---------- Initialisation : super-admin + agence de test illimitée ----------
const COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#ca8a04']
export function newUser(p: Partial<User> & { email: string; name: string; role: PlatformRole; agencyId: string }, password: string): User {
  const { salt, hash } = hashPassword(password)
  return {
    id: uid('u_'), active: true, title: '', phone: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], split: 70, licence: '',
    createdAt: now(), lastLoginAt: '', lastSeenAt: '', loginCount: 0, failed: 0, lockedUntil: '', mustChangePassword: false, ...p,
    email: p.email.trim().toLowerCase(), salt, hash,
  }
}

let bootstrapped = false
export async function bootstrap() {
  if (bootstrapped) return
  const env = process.env
  const wanted: { email?: string; pw?: string; role: PlatformRole; name: string; test: boolean }[] = [
    { email: env.SUPERADMIN_EMAIL, pw: env.SUPERADMIN_PASSWORD, role: 'superadmin' as PlatformRole, name: 'Administration ImmoPilot', test: false },
    { email: env.TEST_ADMIN_EMAIL, pw: env.TEST_ADMIN_PASSWORD, role: 'admin' as PlatformRole, name: 'Admin Test (agence)', test: true },
    { email: env.TEST_AGENT_EMAIL, pw: env.TEST_AGENT_PASSWORD, role: 'courtier' as PlatformRole, name: 'Courtier Test', test: true },
  ].filter(w => w.email && w.pw)
  if (!wanted.length) { bootstrapped = true; return }
  const users = await loadUsers()
  const missing = wanted.filter(w => !users.some(u => u.email === w.email!.toLowerCase()))
  if (!missing.length) { bootstrapped = true; return }

  let testAgency = ''
  if (missing.some(m => m.test)) {
    const agencies = await mutate<Agency[]>(AGENCIES, () => [], list => {
      if (list.some(a => a.id === 'ag_test')) return list
      return [...list, { id: 'ag_test', name: 'Agence Test — accès illimité', plan: 'illimite', seats: 0, status: 'actif', createdAt: now(), contactEmail: env.TEST_ADMIN_EMAIL || '', notes: 'Compte de test interne', trialEnds: '' }]
    })
    testAgency = agencies.find(a => a.id === 'ag_test')!.id
  }
  const created = await mutate<User[]>(USERS, () => [], list => {
    const out = [...list]
    for (const w of missing) {
      if (out.some(u => u.email === w.email!.toLowerCase())) continue
      out.push(newUser({ email: w.email!, name: w.name, role: w.role, agencyId: w.test ? testAgency : 'platform', title: w.role === 'admin' ? 'Directeur·rice d’agence' : w.role === 'courtier' ? 'Courtier immobilier' : 'Propriétaire de la plateforme' }, w.pw!))
    }
    return out
  })
  if (testAgency) {
    const { data } = await readJson(agencyDb(testAgency))
    if (!data) {
      const admin = created.find(u => u.email === env.TEST_ADMIN_EMAIL?.toLowerCase())
      const agent = created.find(u => u.email === env.TEST_AGENT_EMAIL?.toLowerCase())
      await writeJson(agencyDb(testAgency), seedAgencyDb('Agence Test — accès illimité', { m1: admin?.id, m2: agent?.id, m3: admin?.id, m4: agent?.id }), null)
    }
  }
  bootstrapped = true
}

/** Données de démarrage d'une agence (exemples) — les ids des membres de démonstration sont remappés. */
export function seedAgencyDb(name: string, remap: Record<string, string | undefined> = {}, withDemo = true): Omit<DB, 'members' | 'currentUserId'> {
  const s = seed()
  let json = JSON.stringify(withDemo ? s : { ...s, contacts: [], activities: [], listings: [], deals: [], tasks: [], events: [], showings: [], posts: [], expenses: [], visits: [] })
  for (const [from, to] of Object.entries(remap)) if (to) json = json.replaceAll(`"${from}"`, `"${to}"`)
  const d = JSON.parse(json) as DB
  const { members: _m, currentUserId: _c, ...rest } = d
  return { ...rest, agency: { ...rest.agency, name, email: '', phone: '', website: '', office: '' } }
}

export async function trackActivity(u: User, login: boolean) {
  const today = day()
  const seenToday = u.lastSeenAt.slice(0, 10) === today
  if (!login && seenToday) return
  await mutate<Activity>(ACTIVITY, () => ({ days: {} }), a => {
    const d = a.days[today] ?? { logins: 0, active: [] }
    if (login) d.logins++
    if (!d.active.includes(u.id)) d.active.push(u.id)
    a.days[today] = d
    // on garde 400 jours
    const keys = Object.keys(a.days).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete a.days[k]
    return a
  }).catch(() => undefined)
  await mutate<User[]>(USERS, () => [], list => list.map(x => (x.id === u.id ? { ...x, lastSeenAt: now(), ...(login ? { lastLoginAt: now(), loginCount: x.loginCount + 1, failed: 0, lockedUntil: '' } : {}) } : x))).catch(() => undefined)
}

// ---------- utilitaires HTTP ----------
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
export const sameOrigin = (req: Request) => {
  const o = req.headers.get('origin')
  return !o || o === new URL(req.url).origin
}
export const PLAN_SEATS: Record<Plan, number> = { essai: 3, solo: 1, equipe: 5, agence: 25, entreprise: 0, illimite: 0 }
export const PLAN_LABEL: Record<Plan, string> = { essai: 'Essai', solo: 'Courtier solo', equipe: 'Équipe', agence: 'Agence', entreprise: 'Entreprise', illimite: 'Illimité (interne)' }
