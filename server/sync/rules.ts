// Contrôles de cohérence exécutés après chaque synchronisation (sans IA, sans coût).
// Ils ne modifient rien : ils signalent dans « À vérifier ».
import { createHash } from 'node:crypto'
import type { ReviewItem } from '../../src/lib/integrations/types.js'
import { normEmail, normPhone } from './merge.js'

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const key = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 16)

export function consistencyChecks(doc: Doc, now: string): ReviewItem[] {
  const out: ReviewItem[] = []
  const add = (r: Omit<ReviewItem, 'id' | 'key' | 'createdAt' | 'status' | 'connectionId' | 'proposedSource' | 'proposedAt' | 'currentAt'>, k: string) =>
    out.push({ ...r, id: 'rv_' + key(k), key: key(k), createdAt: now, status: 'ouvert', connectionId: '', proposedSource: 'contrôle de cohérence', proposedAt: now, currentAt: '' })
  const name = (c: Doc) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || 'Contact'

  // doublons de contacts (même courriel ou même téléphone)
  const seen = new Map<string, Doc>()
  for (const c of doc.contacts ?? []) for (const k of [normEmail(c.email) && `e:${normEmail(c.email)}`, normPhone(c.phone) && `p:${normPhone(c.phone)}`].filter(Boolean) as string[]) {
    const other = seen.get(k)
    if (other && other.id !== c.id) add({ kind: 'doublon', coll: 'contacts', entityId: c.id, entityLabel: name(c), field: '_duplicate', fieldLabel: 'Doublon possible', current: `${name(other)} (${other.email || other.phone})`, currentSource: 'ImmoPilot', proposed: `${name(c)} (${c.email || c.phone})`, note: `Même ${k.startsWith('e') ? 'courriel' : 'téléphone'}. Accepter = fusionner les deux fiches.`, relatedId: other.id },`dup|${[other.id, c.id].sort().join('|')}`)
    else seen.set(k, c)
  }
  // dossier ouvert sur une inscription vendue/expirée, ou prix incohérent
  for (const d of doc.deals ?? []) {
    const l = (doc.listings ?? []).find((x: Doc) => x.id === d.listingId)
    if (!l || d.status !== 'ouvert') continue
    if (['expire', 'retire'].includes(l.status)) add({ kind: 'incoherence', coll: 'deals', entityId: d.id, entityLabel: d.title, field: 'status', fieldLabel: 'Statut', current: 'dossier ouvert', currentSource: 'ImmoPilot', proposed: `inscription « ${l.status} »`, note: 'Le dossier est ouvert alors que l’inscription liée est expirée ou retirée.' }, `inc|st|${d.id}|${l.status}`)
    if (l.soldPrice && d.price && Math.abs(l.soldPrice - d.price) >= 1) add({ kind: 'incoherence', coll: 'deals', entityId: d.id, entityLabel: d.title, field: 'price', fieldLabel: 'Prix', current: d.price, currentSource: 'Dossier', proposed: l.soldPrice, note: 'Le prix du dossier diffère du prix vendu de l’inscription.' }, `inc|px|${d.id}|${d.price}|${l.soldPrice}`)
  }
  return out
}
