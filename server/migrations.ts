// Migrations du document d'agence (agencies/<id>/db.json). Chaque migration est idempotente
// et appliquée au chargement si la version stockée est plus ancienne.
import type { DB } from '../src/lib/types.js'

export const CURRENT_VERSION = 2
type Doc = Omit<DB, 'members' | 'currentUserId'>

const MIGRATIONS: Record<number, (d: Doc) => Doc> = {
  // v2 : synchronisation multi-sources — collections campagnes et indicateurs externes
  2: d => ({ ...d, campaigns: d.campaigns ?? [], metrics: d.metrics ?? [], visits: d.visits ?? [] }),
}

export function migrate(d: Doc): { doc: Doc; changed: boolean } {
  let doc = d
  const from = d.version ?? 1
  for (let v = from + 1; v <= CURRENT_VERSION; v++) doc = { ...(MIGRATIONS[v]?.(doc) ?? doc), version: v }
  return { doc, changed: from < CURRENT_VERSION }
}
