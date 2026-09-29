// Permissions des intégrations, appliquées côté serveur à chaque lecture et chaque action.
// Deux niveaux : la plateforme choisit les applications proposées à chaque agence (super-admin);
// l'administrateur de l'agence choisit rôles, comptes permis, fréquences, actions automatiques et accès de l'IA.
import { mutate, readJson } from './storage.js'
import { CONNECTORS, type ConnectorKey } from '../src/lib/integrations/catalog.js'
import { ALL_ROLES, AUTO_ACTIONS, AI_COLLECTIONS, type AgencyPolicy, type AiCollection, type AutoAction, type ProviderPolicy, type Role } from '../src/lib/integrations/types.js'
import type { User } from './platform.js'

export const OFFER = 'platform/integrations.json'
export interface PlatformOffer { default: ConnectorKey[] | 'all'; agencies: Record<string, ConnectorKey[] | 'all'>; aiBudget: Record<string, number> }
const policyPath = (agencyId: string) => `agencies/${agencyId}/integrations.json`

export const roleOf = (u: Pick<User, 'role'>): Role => (u.role === 'superadmin' ? 'admin' : u.role)
export const isAdmin = (u: Pick<User, 'role'>) => u.role === 'admin' || u.role === 'superadmin'

export function defaultProviderPolicy(key: ConnectorKey): ProviderPolicy {
  const c = CONNECTORS[key]
  return {
    enabled: true, visibleRoles: [...ALL_ROLES], useRoles: key === 'webhook' ? ['admin'] : [...ALL_ROLES],
    accountModes: [...c.modes], everyMin: c.defaultEveryMin,
    services: Object.fromEntries(c.services.map(s => [s.key, s.defaultOn])),
  }
}

export function defaultPolicy(): AgencyPolicy {
  return {
    providers: Object.fromEntries((Object.keys(CONNECTORS) as ConnectorKey[]).map(k => [k, defaultProviderPolicy(k)])),
    auto: { createContacts: true, importLeads: true, createEvents: true, applyNonSensitive: true, deleteCancelledEvents: true, createFollowUpTasks: true },
    ai: {
      enabled: true, roles: [...ALL_ROLES], autoAnalyze: false, monthlyTokenBudget: 1_000_000,
      collections: { ...Object.fromEntries(Object.keys(AI_COLLECTIONS).map(k => [k, true])), finance: false, communications: false } as Record<AiCollection, boolean>,
    },
    updatedAt: '', updatedBy: '',
  }
}

/** Complète une politique stockée avec les valeurs par défaut (nouveaux connecteurs, nouveaux réglages). */
export function normalizePolicy(p: Partial<AgencyPolicy> | null): AgencyPolicy {
  const d = defaultPolicy()
  if (!p) return d
  const providers = { ...d.providers }
  for (const k of Object.keys(CONNECTORS) as ConnectorKey[]) {
    const s = p.providers?.[k]
    if (s) providers[k] = { ...d.providers[k]!, ...s, services: { ...d.providers[k]!.services, ...s.services } }
  }
  return { ...d, ...p, providers, auto: { ...d.auto, ...p.auto }, ai: { ...d.ai, ...p.ai, collections: { ...d.ai.collections, ...p.ai?.collections } } }
}

export async function loadPolicy(agencyId: string) { return normalizePolicy((await readJson<AgencyPolicy>(policyPath(agencyId))).data) }
export async function loadOffer(): Promise<PlatformOffer> {
  return { default: 'all', agencies: {}, aiBudget: {}, ...(await readJson<PlatformOffer>(OFFER)).data }
}
export function offeredTo(offer: PlatformOffer, agencyId: string): Set<ConnectorKey> {
  const o = offer.agencies[agencyId] ?? offer.default
  return new Set(o === 'all' ? (Object.keys(CONNECTORS) as ConnectorKey[]) : o)
}

/** Enregistre une politique en ne gardant que des valeurs valides. */
export async function savePolicy(agencyId: string, patch: Partial<AgencyPolicy>, by: string) {
  const roles = (v: unknown) => (Array.isArray(v) ? v.filter((r): r is Role => ALL_ROLES.includes(r as Role)) : undefined)
  return mutate<AgencyPolicy>(policyPath(agencyId), defaultPolicy, cur => {
    const base = normalizePolicy(cur)
    const providers = { ...base.providers }
    for (const [k, v] of Object.entries(patch.providers ?? {}) as [ConnectorKey, Partial<ProviderPolicy>][]) {
      if (!CONNECTORS[k] || !v) continue
      const b = providers[k]!
      providers[k] = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : b.enabled,
        visibleRoles: roles(v.visibleRoles) ?? b.visibleRoles,
        useRoles: roles(v.useRoles) ?? b.useRoles,
        accountModes: Array.isArray(v.accountModes) ? v.accountModes.filter(m => CONNECTORS[k].modes.includes(m)) : b.accountModes,
        everyMin: Number.isFinite(v.everyMin) ? Math.max(0, Math.min(10080, Math.round(v.everyMin!))) : b.everyMin,
        services: { ...b.services, ...Object.fromEntries(Object.entries(v.services ?? {}).filter(([s, x]) => CONNECTORS[k].services.some(y => y.key === s) && typeof x === 'boolean')) },
      }
      // l'administrateur garde toujours l'usage d'un connecteur activé
      if (!providers[k]!.useRoles.includes('admin')) providers[k]!.useRoles.push('admin')
    }
    const auto = { ...base.auto }
    for (const [k, v] of Object.entries(patch.auto ?? {})) if (k in AUTO_ACTIONS && typeof v === 'boolean') auto[k as AutoAction] = v
    const ai = { ...base.ai, collections: { ...base.ai.collections } }
    if (patch.ai) {
      if (typeof patch.ai.enabled === 'boolean') ai.enabled = patch.ai.enabled
      if (typeof patch.ai.autoAnalyze === 'boolean') ai.autoAnalyze = patch.ai.autoAnalyze
      ai.roles = roles(patch.ai.roles) ?? ai.roles
      if (Number.isFinite(patch.ai.monthlyTokenBudget)) ai.monthlyTokenBudget = Math.max(0, Math.min(50_000_000, Math.round(patch.ai.monthlyTokenBudget!)))
      for (const [k, v] of Object.entries(patch.ai.collections ?? {})) if (k in AI_COLLECTIONS && typeof v === 'boolean') ai.collections[k as AiCollection] = v
    }
    return { ...base, providers, auto, ai, updatedAt: new Date().toISOString(), updatedBy: by }
  })
}

export interface Access { see: boolean; use: boolean; reason: string }
/** Accès d'un utilisateur à un connecteur (offre plateforme + politique d'agence + rôle). */
export function access(u: Pick<User, 'role'>, key: ConnectorKey, policy: AgencyPolicy, offered: Set<ConnectorKey>): Access {
  if (!CONNECTORS[key]) return { see: false, use: false, reason: 'Connecteur inconnu.' }
  if (!offered.has(key)) return { see: false, use: false, reason: 'Application non proposée à votre agence.' }
  const p = policy.providers[key]!
  if (!p.enabled) return { see: isAdmin(u), use: false, reason: 'Application désactivée par l’administrateur de l’agence.' }
  const r = roleOf(u)
  const see = p.visibleRoles.includes(r) || isAdmin(u)
  const use = see && p.useRoles.includes(r)
  return { see, use, reason: use ? '' : see ? 'Votre rôle ne permet pas d’utiliser cette application.' : 'Application masquée pour votre rôle.' }
}

export function aiAccess(u: Pick<User, 'role'>, policy: AgencyPolicy) {
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: 'Assistant IA non configuré sur la plateforme (clé OpenAI manquante).' }
  if (!policy.ai.enabled) return { ok: false, reason: 'Assistant IA désactivé par l’administrateur de l’agence.' }
  if (!policy.ai.roles.includes(roleOf(u))) return { ok: false, reason: 'Votre rôle n’a pas accès à l’assistant IA.' }
  return { ok: true, reason: '' }
}
