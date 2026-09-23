// Retour de Google après l'autorisation de l'utilisateur.
import { currentUser, USERS, type User } from '../server/platform.js'
import { allowed, exchangeCode, readState, redirectUri, saveTokens, SCOPES } from '../server/google.js'
import { mutate } from '../server/storage.js'

const back = (msg: string, ok = false) => new Response(null, { status: 302, headers: { location: `/app#/google/${ok ? 'ok' : 'erreur:' + encodeURIComponent(msg)}`, 'set-cookie': 'ip_gnonce=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0' } })

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('error')) return back('Autorisation refusée dans Google.')
  const state = readState(url.searchParams.get('state') || '')
  const nonce = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith('ip_gnonce='))?.slice(10)
  const u = await currentUser(req)
  if (!state || !u || state.u !== u.id || !nonce || nonce !== state.n) return back('Session expirée, recommencez la connexion.')
  try {
    const t = await exchangeCode(url.searchParams.get('code') || '', redirectUri(req))
    if (!t.refresh) return back('Google n’a pas fourni d’accès permanent. Retirez ImmoPilot de votre compte Google puis reconnectez-vous.')
    // on ne conserve que les portées autorisées par l'admin
    const perms = allowed(u)
    const granted = t.scopes.split(' ')
    if ((!perms.drive && granted.includes(SCOPES.drive)) || (!perms.calendar && granted.includes(SCOPES.calendar))) return back('Portées non autorisées.')
    await saveTokens(u.id, t.refresh, t.scopes, t.email)
    await mutate<User[]>(USERS, () => [], l => l.map(x => (x.id === u.id ? { ...x, googleEmail: t.email, googleScopes: t.scopes, googleConnectedAt: new Date().toISOString() } : x)))
    return back('', true)
  } catch (e) {
    return back((e as Error).message)
  }
}
