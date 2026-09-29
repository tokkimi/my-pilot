// Connexions aux outils externes : une fiche par compte relié (individuel ou partagé par l'agence).
// Les fiches ne contiennent AUCUN secret (voir vault.ts). Elles portent l'état visible dans ImmoPilot.
import { randomBytes } from 'node:crypto'
import { mutate, readJson } from './storage.js'
import { deleteSecret } from './vault.js'
import type { Connection, ConnectionStatus } from '../src/lib/integrations/types.js'
import type { ConnectorKey } from '../src/lib/integrations/catalog.js'
import type { User } from './platform.js'

const file = (agencyId: string) => `agencies/${agencyId}/connections.json`
export const newConnectionId = (provider: string) => `cx_${provider}_${randomBytes(6).toString('base64url').replace(/[^\w]/g, 'x')}`

export async function listConnections(agencyId: string): Promise<Connection[]> {
  return (await readJson<Connection[]>(file(agencyId))).data ?? []
}
export async function getConnection(agencyId: string, id: string) {
  return (await listConnections(agencyId)).find(c => c.id === id) ?? null
}

export function blankConnection(p: { provider: ConnectorKey; mode: Connection['mode']; ownerId: string; label: string; account?: string; services?: string[]; id?: string }): Connection {
  const now = new Date().toISOString()
  return {
    id: p.id ?? newConnectionId(p.provider), provider: p.provider, mode: p.mode, ownerId: p.ownerId, label: p.label, account: p.account ?? '', services: p.services ?? [],
    status: 'connecte', statusDetail: '', createdAt: now, updatedAt: now, lastSyncAt: '', lastSuccessAt: '', lastError: '', nextAllowedAt: '', failures: 0,
    cursors: {}, hooks: [], settings: {}, counts: {},
  }
}

export async function saveConnection(agencyId: string, c: Connection) {
  await mutate<Connection[]>(file(agencyId), () => [], l => [...l.filter(x => x.id !== c.id), { ...c, updatedAt: new Date().toISOString() }])
  return c
}
export async function patchConnection(agencyId: string, id: string, fn: (c: Connection) => Connection) {
  let out: Connection | null = null
  await mutate<Connection[]>(file(agencyId), () => [], l => l.map(c => (c.id === id ? (out = { ...fn(c), updatedAt: new Date().toISOString() }) : c)))
  return out as Connection | null
}
export async function setStatus(agencyId: string, id: string, status: ConnectionStatus, detail = '') {
  return patchConnection(agencyId, id, c => ({ ...c, status, statusDetail: detail, ...(status === 'erreur' || status === 'reconnexion' ? { lastError: detail } : {}) }))
}

/** Retire la fiche et détruit le secret. Les données déjà importées restent dans ImmoPilot, avec leur date. */
export async function deleteConnection(agencyId: string, id: string) {
  await deleteSecret(agencyId, id).catch(() => undefined)
  await mutate<Connection[]>(file(agencyId), () => [], l => l.filter(c => c.id !== id))
}

/**
 * Google garde son flux d'autorisation historique (/api/google, jetons dans platform/google/<membre>.json).
 * Cette fonction aligne les fiches de connexion sur l'état des comptes Google des membres.
 * Retourne les connexions nouvellement créées (pour lancer leur première synchronisation).
 */
export async function reconcileGoogle(agencyId: string, users: User[]): Promise<Connection[]> {
  const { servicesFromScopes } = await import('./google.js')
  const members = users.filter(u => u.agencyId === agencyId)
  const created: Connection[] = []
  const current = await listConnections(agencyId)
  const needs = members.some(u => {
    const c = current.find(x => x.id === `cx_google_${u.id}`)
    const services = servicesFromScopes(u.googleScopes ?? '').join(',')
    return u.googleEmail ? !c || c.status === 'deconnecte' || c.services.join(',') !== services || c.account !== u.googleEmail : !!c && c.status !== 'deconnecte'
  })
  if (!needs) return []
  await mutate<Connection[]>(file(agencyId), () => [], list => {
    created.length = 0
    let out = [...list]
    for (const u of members) {
      const id = `cx_google_${u.id}`
      const c = out.find(x => x.id === id)
      if (u.googleEmail) {
        const services = servicesFromScopes(u.googleScopes ?? '')
        if (!c) { const n = { ...blankConnection({ id, provider: 'google', mode: 'user', ownerId: u.id, label: `Google — ${u.name}`, account: u.googleEmail, services }), createdAt: u.googleConnectedAt || new Date().toISOString() }; out.push(n); created.push(n) }
        else out = out.map(x => (x.id === id ? { ...x, account: u.googleEmail!, services, ...(x.status === 'deconnecte' || (x.status === 'reconnexion' && u.googleConnectedAt && u.googleConnectedAt > x.updatedAt) ? { status: 'connecte' as const, statusDetail: '', lastError: '', failures: 0, nextAllowedAt: '' } : {}) } : x))
      } else if (c && c.status !== 'deconnecte') out = out.map(x => (x.id === id ? { ...x, status: 'deconnecte', statusDetail: 'Compte Google déconnecté.' } : x))
    }
    return out
  })
  return created
}

/** Connexions qu'un utilisateur peut voir : les siennes + celles partagées par l'agence; l'admin voit tout (sans secret). */
export function visibleTo(u: Pick<User, 'id' | 'role'>, list: Connection[]) {
  const admin = u.role === 'admin' || u.role === 'superadmin'
  return list.filter(c => admin || c.mode === 'agency' || c.ownerId === u.id)
}
/** Connexions qu'un utilisateur peut actualiser : les siennes + les partagées (l'admin : toutes celles de l'agence). */
export function refreshableBy(u: Pick<User, 'id' | 'role'>, list: Connection[]) {
  const admin = u.role === 'admin' || u.role === 'superadmin'
  return list.filter(c => admin || c.mode === 'agency' || c.ownerId === u.id)
}
/** Connexions au nom desquelles un utilisateur peut agir (envoyer, publier) : les siennes; les partagées pour l'admin. */
export function actionableBy(u: Pick<User, 'id' | 'role'>, c: Connection) {
  const admin = u.role === 'admin' || u.role === 'superadmin'
  return c.ownerId === u.id || (c.mode === 'agency' && admin)
}
