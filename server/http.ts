// Appels HTTP vers les fournisseurs : limitation de débit, reprises avec attente exponentielle,
// respect de Retry-After, et erreurs typées pour que le moteur de synchronisation réagisse correctement.

export class AuthError extends Error {
  /** l'utilisateur doit se reconnecter (accès révoqué, jeton invalide, MFA exigée…) */
  constructor(msg = 'Autorisation refusée par le fournisseur') { super(msg) }
}
export class RateLimited extends Error {
  constructor(public retryAfterMs: number, msg = 'Limite de débit du fournisseur atteinte') { super(msg) }
}
export class ProviderError extends Error {
  constructor(public status: number, msg: string) { super(msg) }
}

// Seau à jetons en mémoire par fournisseur (par instance de fonction).
const buckets = new Map<string, { tokens: number; at: number }>()
const RATES: Record<string, number> = { default: 8, google: 10, microsoft: 8, mailchimp: 5, calendly: 5, meta: 4, linkedin: 2, tiktok: 2, canva: 4, crea: 3, openai: 3 }
async function take(key: string) {
  const rate = RATES[key] ?? RATES.default
  for (;;) {
    const b = buckets.get(key) ?? { tokens: rate, at: Date.now() }
    const now = Date.now()
    b.tokens = Math.min(rate, b.tokens + ((now - b.at) / 1000) * rate)
    b.at = now
    if (b.tokens >= 1) { b.tokens -= 1; buckets.set(key, b); return }
    buckets.set(key, b)
    await sleep(Math.ceil(((1 - b.tokens) / rate) * 1000))
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface CallOpts extends RequestInit { provider?: string; retries?: number; deadline?: number; json?: unknown; form?: Record<string, string> }

/** Appel JSON : 401/403 d'autorisation → AuthError; 429 → RateLimited (après une reprise courte); 5xx → reprises. */
export async function call<T = any>(url: string, o: CallOpts = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { provider = 'default', retries = 2, deadline, json, form, ...init } = o
  const headers = new Headers(init.headers)
  let body = init.body
  if (json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(json) }
  if (form) { headers.set('content-type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(form).toString() }
  if (!headers.has('accept')) headers.set('accept', 'application/json')
  for (let attempt = 0; ; attempt++) {
    await take(provider)
    let r: Response
    try {
      r = await fetch(url, { ...init, headers, body, signal: AbortSignal.timeout(Math.max(1000, Math.min(15000, (deadline ?? Date.now() + 15000) - Date.now()))) })
    } catch (e) {
      if (attempt < retries && (!deadline || Date.now() + 2000 < deadline)) { await sleep(500 * 2 ** attempt); continue }
      throw new ProviderError(0, `Fournisseur injoignable (${(e as Error).message})`)
    }
    if (r.status === 204) return null as T
    const text = await r.text()
    let data: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (r.ok) return data as T
    const msg = errorMessage(data) || `HTTP ${r.status}`
    if (r.status === 401 || (r.status === 400 && /invalid_grant|expired|revoked/i.test(msg))) throw new AuthError(msg)
    if (r.status === 429) {
      const ra = retryAfter(r)
      if (attempt < retries && ra <= 3000 && (!deadline || Date.now() + ra + 1000 < deadline)) { await sleep(ra); continue }
      throw new RateLimited(Math.max(ra, 30000))
    }
    if (r.status >= 500 && attempt < retries && (!deadline || Date.now() + 2000 < deadline)) { await sleep(700 * 2 ** attempt); continue }
    throw new ProviderError(r.status, msg)
  }
}

function retryAfter(r: Response) {
  const h = r.headers.get('retry-after')
  if (!h) return 2000
  const n = Number(h)
  if (!isNaN(n)) return n * 1000
  const d = Date.parse(h)
  return isNaN(d) ? 2000 : Math.max(0, d - Date.now())
}
function errorMessage(d: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!d) return ''
  if (typeof d === 'string') return d.slice(0, 200)
  const e = d.error
  if (typeof e === 'string') return [e, d.error_description].filter(Boolean).join(' : ')
  return String(e?.message ?? d.message ?? d.detail ?? d.title ?? '').slice(0, 300)
}
