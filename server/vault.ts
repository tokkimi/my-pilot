// Coffre des secrets des connecteurs (jetons OAuth, clés d'API, URL privées d'agenda).
// Chiffrement AES-256-GCM côté serveur. Les secrets sont rangés À PART des données de l'agence
// (secrets/<agence>/<connexion>.json) : ils ne sont jamais envoyés au navigateur, ni journalisés, ni transmis à l'IA.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readJson, removeFile, writeJson } from './storage.js'

/** Clé maîtresse : SECRETS_KEY (recommandé, distincte du secret de session); à défaut, dérivée de SESSION_SECRET. */
function masterKey() {
  const raw = process.env.SECRETS_KEY || (process.env.SESSION_SECRET || 'dev-secret-change-me') + ':connector-vault'
  return createHash('sha256').update(raw).digest()
}
export const vaultUsesDedicatedKey = () => !!process.env.SECRETS_KEY

export function seal(value: unknown): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', masterKey(), iv)
  const enc = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()])
  return ['v1', iv, c.getAuthTag(), enc].map(b => (typeof b === 'string' ? b : b.toString('base64url'))).join('.')
}

export function unseal<T>(blob: string): T {
  const [v, iv, tag, enc] = blob.split('.')
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Format de secret inconnu')
  const d = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8')) as T
}

/** Secret d'une connexion : jetons + informations propres au fournisseur. */
export interface ConnectionSecret {
  accessToken?: string; refreshToken?: string; expiresAt?: number; tokenType?: string
  apiKey?: string; clientId?: string; clientSecret?: string; url?: string
  /** données propres au fournisseur (ex. centre de données Mailchimp, jetons de pages Meta) */
  extra?: Record<string, unknown>
}

const path = (agencyId: string, connectionId: string) => {
  if (!/^[\w-]+$/.test(agencyId) || !/^[\w-]+$/.test(connectionId)) throw new Error('Identifiant invalide')
  return `secrets/${agencyId}/${connectionId}.json`
}

export async function putSecret(agencyId: string, connectionId: string, s: ConnectionSecret) {
  const p = path(agencyId, connectionId)
  for (let i = 0; i < 5; i++) {
    const { etag } = await readJson(p)
    if (await writeJson(p, { data: seal(s), at: new Date().toISOString() }, etag)) return
  }
  throw new Error('Conflit d’écriture du secret')
}

export async function getSecret(agencyId: string, connectionId: string): Promise<ConnectionSecret | null> {
  const { data } = await readJson<{ data: string }>(path(agencyId, connectionId))
  if (!data?.data) return null
  try { return unseal<ConnectionSecret>(data.data) } catch { return null }
}

export async function deleteSecret(agencyId: string, connectionId: string) {
  await removeFile(path(agencyId, connectionId))
}

/** Retire toute valeur ressemblant à un secret d'un objet destiné aux journaux, au navigateur ou à l'IA. */
const SECRET_KEYS = /(token|secret|password|passwd|motdepasse|apikey|api_key|authorization|cookie|refresh|client_secret|signing)/i
const SECRET_VALUES = /\b(sk-[A-Za-z0-9_-]{16,}|ya29\.[A-Za-z0-9._-]{20,}|EAA[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._~+/-]{16,})/g
export function redact<T>(v: T, depth = 0): T {
  if (depth > 12) return v
  if (typeof v === 'string') return v.replace(SECRET_VALUES, '[secret retiré]') as T
  if (Array.isArray(v)) return v.map(x => redact(x, depth + 1)) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEYS.test(k) ? '[secret retiré]' : redact(x, depth + 1)
    return out as T
  }
  return v
}
