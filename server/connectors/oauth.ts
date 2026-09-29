// OAuth 2.0 générique : URL d'autorisation (état signé + PKCE), échange du code, renouvellement.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { AuthError, call } from '../http.js'
import { seal, unseal, type ConnectionSecret } from '../vault.js'
import type { OAuthConfig } from './types.js'

const stateKey = () => createHash('sha256').update((process.env.SESSION_SECRET || 'dev-secret-change-me') + ':oauth-state').digest()
export interface OAuthState { u: string; a: string; p: string; m: 'user' | 'agency'; n: string; s: string[]; r?: string; e: number }

export function signState(s: Omit<OAuthState, 'e'>) {
  const p = Buffer.from(JSON.stringify({ ...s, e: Date.now() + 10 * 60000 })).toString('base64url')
  return `${p}.${createHmac('sha256', stateKey()).update(p).digest('base64url')}`
}
export function readState(v: string): OAuthState | null {
  const [p, sig] = v.split('.')
  if (!p || !sig) return null
  const exp = createHmac('sha256', stateKey()).update(p).digest('base64url')
  if (exp.length !== sig.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return null
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()) as OAuthState; return o.e > Date.now() ? o : null } catch { return null }
}

/** Cookie HttpOnly chiffré contenant le nonce et le vérificateur PKCE (jamais dans l'URL). */
export const OAUTH_COOKIE = 'ip_oauth'
export function oauthCookie(nonce: string, verifier: string) {
  const secure = process.env.VERCEL ? '; Secure' : ''
  return `${OAUTH_COOKIE}=${seal({ n: nonce, v: verifier })}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
}
export function readOauthCookie(req: Request): { n: string; v: string } | null {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(OAUTH_COOKIE + '='))?.slice(OAUTH_COOKIE.length + 1)
  if (!raw) return null
  try { return unseal(raw) } catch { return null }
}
export const clearOauthCookie = () => `${OAUTH_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0`

export const callbackUrl = (origin: string, provider: string) => `${origin}/api/connect/callback/${provider}`

export function authorizeUrl(cfg: OAuthConfig, provider: string, origin: string, state: string, services: string[], verifier: string) {
  const u = new URL(cfg.authorizeUrl)
  const q: Record<string, string> = {
    [cfg.clientIdParam ?? 'client_id']: cfg.clientId()!, redirect_uri: callbackUrl(origin, provider), response_type: 'code', state,
    ...(cfg.scopes(services).length ? { scope: cfg.scopes(services).join(cfg.scopeSep ?? ' ') } : {}), ...cfg.extraAuth,
  }
  if (cfg.pkce) { q.code_challenge = createHash('sha256').update(verifier).digest('base64url'); q.code_challenge_method = 'S256' }
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  return u.toString()
}
export const newVerifier = () => randomBytes(48).toString('base64url')

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; refresh_expires_in?: number; open_id?: string }
function tokenCall(cfg: OAuthConfig, form: Record<string, string>) {
  const headers: Record<string, string> = {}
  const body = { ...form }
  if (cfg.tokenAuth === 'basic') headers.authorization = 'Basic ' + Buffer.from(`${cfg.clientId()}:${cfg.clientSecret()}`).toString('base64')
  else { body[cfg.clientIdParam ?? 'client_id'] = cfg.clientId()!; body.client_secret = cfg.clientSecret()! }
  return call<TokenResponse>(cfg.tokenUrl, { method: 'POST', headers, form: body, retries: 1 })
}

export async function exchangeCode(cfg: OAuthConfig, provider: string, origin: string, code: string, verifier: string): Promise<ConnectionSecret & { scope?: string }> {
  const t = await tokenCall(cfg, { grant_type: 'authorization_code', code, redirect_uri: callbackUrl(origin, provider), ...(cfg.pkce ? { code_verifier: verifier } : {}) })
  if (!t?.access_token) throw new Error('Le fournisseur n’a pas remis de jeton d’accès.')
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined, tokenType: t.token_type, scope: t.scope, extra: t.open_id ? { openId: t.open_id } : undefined }
}

/** Renouvelle le jeton si nécessaire. Lève AuthError si le fournisseur a révoqué l'accès. */
export async function freshToken(cfg: OAuthConfig, s: ConnectionSecret, save: (s: ConnectionSecret) => Promise<void>): Promise<string> {
  if (!s.accessToken) throw new AuthError('Aucun jeton : reconnectez le compte.')
  if (!s.expiresAt || s.expiresAt > Date.now() + 90_000) return s.accessToken
  if (!s.refreshToken) throw new AuthError('Accès expiré; le fournisseur ne permet pas le renouvellement automatique. Reconnectez le compte.')
  let t: TokenResponse
  try { t = await tokenCall(cfg, { grant_type: 'refresh_token', refresh_token: s.refreshToken }) } catch (e) {
    if (e instanceof AuthError) throw e
    const msg = (e as Error).message
    if (/invalid_grant|invalid_token|revoked|expired/i.test(msg)) throw new AuthError(msg)
    throw e
  }
  if (!t?.access_token) throw new AuthError('Renouvellement refusé.')
  const next = { ...s, accessToken: t.access_token, refreshToken: t.refresh_token || s.refreshToken, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined }
  await save(next)
  return next.accessToken!
}
