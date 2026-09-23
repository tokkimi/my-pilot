// Intégration Google par utilisateur : statut, connexion, jetons d'accès, déconnexion, autorisations (admin d'agence).
import { randomBytes } from 'node:crypto'
import { currentUser, json, loadUsers, sameOrigin, USERS, type User } from '../server/platform.js'
import { accessToken, allowed, googleConfigured, redirectUri, revokeGoogle, scopesFor, signState, SCOPES } from '../server/google.js'
import { mutate, StorageUnavailable } from '../server/storage.js'

const NONCE = 'ip_gnonce'

export async function GET(req: Request) {
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const action = new URL(req.url).searchParams.get('action') || 'status'
    const perms = allowed(u)

    if (action === 'status') {
      return json({
        configured: googleConfigured(), allowed: perms,
        connected: u.googleEmail ? { email: u.googleEmail, scopes: u.googleScopes ?? '', at: u.googleConnectedAt ?? '' } : null,
        picker: process.env.GOOGLE_API_KEY && process.env.GOOGLE_APP_ID ? { apiKey: process.env.GOOGLE_API_KEY, appId: process.env.GOOGLE_APP_ID, clientId: process.env.GOOGLE_CLIENT_ID } : null,
      })
    }
    if (action === 'start') {
      if (!googleConfigured()) return json({ error: 'Intégration Google non configurée par le propriétaire de la plateforme.' }, 503)
      if (!perms.drive && !perms.calendar) return json({ error: 'L’administrateur de votre agence n’a pas autorisé l’accès Google pour votre profil.' }, 403)
      const nonce = randomBytes(16).toString('base64url')
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(req), response_type: 'code', access_type: 'offline', prompt: 'consent',
        include_granted_scopes: 'false', scope: scopesFor(u).join(' '), state: signState(u.id, nonce), login_hint: u.googleEmail || u.email,
      }).toString()
      const secure = process.env.VERCEL ? '; Secure' : ''
      return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': `${NONCE}=${nonce}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=600${secure}` } })
    }
    if (action === 'token') {
      if (!googleConfigured()) return json({ error: 'Intégration Google non configurée.' }, 503)
      if (!perms.drive && !perms.calendar) return json({ error: 'Accès Google non autorisé pour votre profil.' }, 403)
      const t = await accessToken(u.id)
      if (!t) return json({ error: 'Compte Google non relié (ou accès retiré). Reconnectez votre compte.' }, 409)
      // les portées accordées doivent rester dans les autorisations actuelles de l'admin
      const granted = t.scopes.split(' ')
      if ((!perms.drive && granted.includes(SCOPES.drive)) || (!perms.calendar && granted.includes(SCOPES.calendar))) {
        await revokeGoogle(u.id)
        return json({ error: 'Vos autorisations Google ont changé. Reconnectez votre compte.' }, 409)
      }
      return json({ token: t.token, exp: t.exp, scopes: t.scopes, email: t.email })
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const b = await req.json().catch(() => ({})) as { action?: string; userId?: string; drive?: boolean; calendar?: boolean }
    if (b.action === 'disconnect') {
      await revokeGoogle(u.id)
      return json({ ok: true })
    }
    if (b.action === 'permissions') {
      // réservé à l'administrateur de l'agence (ou au super-admin)
      if (u.role !== 'admin' && u.role !== 'superadmin') return json({ error: 'Réservé à l’administrateur de l’agence.' }, 403)
      const target = (await loadUsers()).find(x => x.id === b.userId)
      if (!target || (u.role !== 'superadmin' && target.agencyId !== u.agencyId)) return json({ error: 'Membre introuvable.' }, 404)
      await applyPermissions(target, !!b.drive, !!b.calendar)
      return json({ ok: true })
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

/** Met à jour les autorisations; si un accès est retiré, le compte Google est déconnecté immédiatement. */
async function applyPermissions(target: User, drive: boolean, calendar: boolean) {
  const before = allowed(target)
  await mutate<User[]>(USERS, () => [], l => l.map(x => (x.id === target.id ? { ...x, googleDrive: drive, googleCalendar: calendar } : x)))
  if (target.googleEmail && ((before.drive && !drive) || (before.calendar && !calendar))) await revokeGoogle(target.id)
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: (e as Error).message || 'Erreur serveur.' }, 500)
}
