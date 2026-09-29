// Journal d'activité vérifiable : données importées, modifications automatiques, actions de l'IA,
// validations humaines, connexions/déconnexions, changements de permissions.
// Un fichier par agence et par mois; chaque entrée est chaînée (hash de la précédente) pour détecter une altération.
import { createHash, randomBytes } from 'node:crypto'
import { mutate, readJson } from './storage.js'
import { redact } from './vault.js'

export type AuditKind =
  | 'connexion' | 'deconnexion' | 'reconnexion_requise' | 'import' | 'maj_auto' | 'suppression_auto' | 'a_verifier'
  | 'validation' | 'rejet' | 'action_preparee' | 'action_executee' | 'action_refusee' | 'ia_requete' | 'ia_proposition'
  | 'permission' | 'synchro' | 'webhook' | 'erreur'
export interface AuditEntry {
  id: string; at: string; kind: AuditKind; actor: string; actorName?: string
  /** fournisseur / connexion concernés */ provider?: string; connectionId?: string
  /** entité ImmoPilot concernée */ coll?: string; entityId?: string
  summary: string; detail?: Record<string, unknown>; prev: string; hash: string
}

const file = (agencyId: string, month = new Date().toISOString().slice(0, 7)) => `agencies/${agencyId}/audit/${month}.json`
const digest = (e: Omit<AuditEntry, 'hash'>) => createHash('sha256').update(JSON.stringify(e)).digest('hex').slice(0, 32)

export async function audit(agencyId: string, entries: Omit<AuditEntry, 'id' | 'at' | 'prev' | 'hash'>[]) {
  if (!entries.length) return
  await mutate<AuditEntry[]>(file(agencyId), () => [], list => {
    let prev = list.at(-1)?.hash ?? ''
    const out = list.length > 20000 ? list.slice(-20000) : [...list]
    for (const e of entries) {
      const base = { ...e, detail: e.detail ? redact(e.detail) : undefined, summary: redact(e.summary).slice(0, 500), id: randomBytes(6).toString('base64url'), at: new Date().toISOString(), prev }
      const entry = { ...base, hash: digest(base) }
      out.push(entry)
      prev = entry.hash
    }
    return out
  }).catch(err => console.error('audit', err))
}

export async function readAudit(agencyId: string, month?: string) {
  return (await readJson<AuditEntry[]>(file(agencyId, month))).data ?? []
}

/** Vérifie la chaîne d'un mois : retourne l'index de la première entrée altérée, ou -1. */
export function verifyChain(list: AuditEntry[]) {
  for (let i = 0; i < list.length; i++) {
    const { hash, ...rest } = list[i]
    if (digest(rest) !== hash) return i
    if (i > 0 && rest.prev !== list[i - 1].hash) return i
  }
  return -1
}
