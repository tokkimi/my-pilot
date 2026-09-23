// Connexion Google (OAuth 2.0, flux serveur) : chaque utilisateur relie SON compte Google.
// Le jeton d'actualisation est chiffré (AES-256-GCM) et stocké côté serveur; le navigateur ne reçoit
// que des jetons d'accès de courte durée, et seulement si l'administrateur de l'agence l'autorise.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mutate, readJson, removeFile, writeJson } from './storage.js'
import { USERS, type User } from './platform.js'

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
export const SCOPES = {
  base: ['openid', 'email'],
  drive: 'https://www.googleapis.com/auth/drive.file',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
}
/** Autorisations effectives : les administrateurs d'agence ont accès par défaut, les autres sur approbation. */
export const allowed = (u: Pick<User, 'role' | 'googleDrive' | 'googleCalendar'>) => ({
  drive: u.googleDrive ?? (u.role === 'admin' || u.role === 'superadmin'),
  calendar: u.googleCalendar ?? (u.role === 'admin' || u.role === 'superadmin'),
})
export const scopesFor = (u: Pick<User, 'role' | 'googleDrive' | 'googleCalendar'>) => {
  const a = allowed(u)
  return [...SCOPES.base, ...(a.drive ? [SCOPES.drive] : []), ...(a.calendar ? [SCOPES.calendar] : [])]
}
export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/google-callback`

const key = () => createHash('sha256').update((process.env.SESSION_SECRET || 'dev-secret-change-me') + ':google-tokens').digest()
function encrypt(text: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.')
}
function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

// ---------- état OAuth signé (anti-CSRF) ----------
const hmac = (v: string) => createHmac('sha256', key()).update(v).digest('base64url')
export function signState(userId: string, nonce: string) {
  const p = Buffer.from(JSON.stringify({ u: userId, n: nonce, e: Date.now() + 10 * 60000 })).toString('base64url')
  return `${p}.${hmac(p)}`
}
export function readState(state: string): { u: string; n: string } | null {
  const [p, s] = state.split('.')
  if (!p || !s) return null
  const exp = hmac(p)
  if (exp.length !== s.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(s))) return null
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null } catch { return null }
}

// ---------- jetons ----------
interface Stored { refresh: string; scopes: string; email: string; access?: string; accessExp?: number }
const tokenPath = (uid: string) => `platform/google/${uid}.json`

export async function saveTokens(uid: string, refresh: string, scopes: string, email: string) {
  const { etag } = await readJson(tokenPath(uid))
  await writeJson(tokenPath(uid), { data: encrypt(JSON.stringify({ refresh, scopes, email } satisfies Stored)) }, etag)
}
async function loadTokens(uid: string): Promise<{ s: Stored; etag: string | null } | null> {
  const { data, etag } = await readJson<{ data: string }>(tokenPath(uid))
  if (!data) return null
  try { return { s: JSON.parse(decrypt(data.data)), etag } } catch { return null }
}

export async function exchangeCode(code: string, redirect: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirect, grant_type: 'authorization_code' }),
  })
  const b = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string }
  if (!r.ok || !b.access_token) throw new Error(b.error_description || 'Échange du code Google refusé')
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${b.access_token}` } }).then(x => x.json()).catch(() => ({})) as { email?: string }
  return { access: b.access_token, refresh: b.refresh_token, scopes: b.scope ?? '', email: info.email ?? '', expiresIn: b.expires_in ?? 3600 }
}

/** Jeton d'accès valide pour l'utilisateur (actualisé au besoin). */
export async function accessToken(uid: string): Promise<{ token: string; exp: number; scopes: string; email: string } | null> {
  const t = await loadTokens(uid)
  if (!t) return null
  if (t.s.access && t.s.accessExp && t.s.accessExp > Date.now() + 60000) return { token: t.s.access, exp: t.s.accessExp, scopes: t.s.scopes, email: t.s.email }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: t.s.refresh, grant_type: 'refresh_token' }),
  })
  const b = await r.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!r.ok || !b.access_token) {
    if (b.error === 'invalid_grant') await removeFile(tokenPath(uid)) // accès retiré dans le compte Google
    return null
  }
  const exp = Date.now() + (b.expires_in ?? 3600) * 1000
  await writeJson(tokenPath(uid), { data: encrypt(JSON.stringify({ ...t.s, access: b.access_token, accessExp: exp })) }, t.etag).catch(() => false)
  return { token: b.access_token, exp, scopes: t.s.scopes, email: t.s.email }
}

/** Révoque l'accès chez Google et supprime les jetons stockés. */
export async function disconnect(uid: string) {
  const t = await loadTokens(uid)
  if (t) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.s.refresh), { method: 'POST' }).catch(() => undefined)
  await removeFile(tokenPath(uid))
}

/** Déconnecte le compte Google d'un utilisateur et efface l'état de connexion. */
export async function revokeGoogle(uid: string) {
  await disconnect(uid)
  await mutate<User[]>(USERS, () => [], l => l.map(x => (x.id === uid ? { ...x, googleEmail: '', googleScopes: '', googleConnectedAt: '' } : x)))
}
