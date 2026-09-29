// Rapprochement des données externes avec les entités ImmoPilot — fonctions pures, sans E/S.
//
// Règles :
//  • identifiant externe (fournisseur + id) → même entité à chaque synchronisation (aucun doublon);
//  • sinon règle de rapprochement par type (courriel, téléphone, n° Centris/MLS, adresse, id ImmoPilot);
//  • fusion à trois voies par champ (valeur de base vue à la dernière synchro / valeur locale / nouvelle valeur) :
//    une modification faite dans ImmoPilot n'est jamais écrasée silencieusement;
//  • champs sensibles (prix, superficie, identité, montants, dates contractuelles) → « À vérifier »;
//  • suppressions à la source : rendez-vous retirés automatiquement s'ils n'ont pas été modifiés localement,
//    sinon « À vérifier »; les autres fiches ne sont jamais supprimées automatiquement;
//  • aucune donnée n'est inventée : un champ absent de la source n'est jamais modifié.
import { createHash } from 'node:crypto'
import type { AgencyPolicy, JobStats, ReviewItem, SourceRef } from '../../src/lib/integrations/types.js'

export type ExtKind = 'contact' | 'event' | 'activity' | 'task' | 'listing' | 'campaign' | 'metric' | 'doc'
export interface ExtRecord {
  kind: ExtKind
  /** identifiant externe stable (ex. iCalUID d'un événement, id de contact) */ x: string
  deleted?: boolean
  /** date de modification à la source */ at?: string
  url?: string
  data: Record<string, unknown>
  match?: { email?: string; phone?: string; centris?: string; address?: string; immopilotId?: string; contactEmail?: string; contactPhone?: string }
  ownerId?: string
  /** demande entrante (prospect) — soumise au réglage « importLeads » */ lead?: boolean
  /** pour kind = 'doc' : fiche cible */ target?: { coll: 'listings' | 'deals' | 'contacts'; id: string }
}
export interface Link { coll: string; id: string; base: Record<string, unknown>; at: string }
export interface LinkState { links: Record<string, Link>; generated: string[] }
export interface MergeCtx { provider: string; connectionId: string; ownerId: string; now: string; policy: AgencyPolicy; private?: boolean }
export interface MergeResult { doc: Doc; links: LinkState; reviews: ReviewItem[]; stats: JobStats; log: { kind: 'import' | 'maj_auto' | 'suppression_auto' | 'a_verifier'; coll: string; entityId: string; summary: string }[] }
type Entity = Record<string, any> & { id: string } // eslint-disable-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const COLL: Record<ExtKind, string> = { contact: 'contacts', event: 'events', activity: 'activities', task: 'tasks', listing: 'listings', campaign: 'campaigns', metric: 'metrics', doc: '' }

/** Champs dont toute modification passe par « À vérifier ». */
export const SENSITIVE: Record<string, string[]> = {
  contacts: ['firstName', 'lastName', 'birthday'],
  listings: ['price', 'livingArea', 'lot', 'soldPrice', 'address', 'city', 'commissionPct', 'centris'],
  deals: ['price', 'commissionPct', 'dates'],
  events: [],
}
/** Champs clés : une divergence dès le premier rapprochement est signalée (contradiction entre sources). */
const KEY_FIELDS: Record<string, string[]> = { contacts: ['email', 'phone'], events: ['start', 'end'], listings: [] }
export const FIELD_LABEL: Record<string, string> = {
  firstName: 'Prénom', lastName: 'Nom', birthday: 'Date de naissance', email: 'Courriel', phone: 'Téléphone', address: 'Adresse', city: 'Ville',
  price: 'Prix', livingArea: 'Superficie habitable', lot: 'Terrain', soldPrice: 'Prix vendu', commissionPct: 'Commission (%)', centris: 'N° Centris / MLS',
  start: 'Début', end: 'Fin', title: 'Titre', location: 'Lieu', status: 'Statut', bedrooms: 'Chambres', bathrooms: 'Salles de bain',
}

export const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase()
export const normPhone = (s: unknown) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }
export const normAddress = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(rue|avenue|av|boulevard|boul|bd|chemin|ch|place|pl|rang|montee)\b\.?/g, '').replace(/[^a-z0-9]/g, '')
const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'number' && v === 0) || (Array.isArray(v) && !v.length)
const norm = (field: string, v: unknown): string => {
  if (field === 'email') return normEmail(v)
  if (field === 'phone') return normPhone(v) || String(v ?? '').trim()
  if (typeof v === 'string') return v.trim().replace(/\s+/g, ' ')
  return JSON.stringify(v ?? null)
}
export const same = (field: string, a: unknown, b: unknown) => (isEmpty(a) && isEmpty(b)) || norm(field, a) === norm(field, b)
const hash = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 16)
export const linkKey = (provider: string, x: string) => `${provider}|${x}`

function labelOf(coll: string, e: Entity) {
  if (coll === 'contacts') return `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.email || 'Contact'
  if (coll === 'listings') return [e.address, e.city].filter(Boolean).join(', ') || 'Inscription'
  return e.title || e.summary || e.name || coll
}

function findEntity(doc: Doc, coll: string, rec: ExtRecord, provider: string, links: LinkState): Entity | undefined {
  const list: Entity[] = doc[coll] ?? []
  const l = links.links[linkKey(provider, rec.x)]
  if (l) { const e = list.find(x => x.id === l.id); if (e) return e }
  const bySrc = list.find(e => (e._src as SourceRef[] | undefined)?.some(s => s.p === provider && s.x === rec.x))
  if (bySrc) return bySrc
  const m = rec.match ?? {}
  if (m.immopilotId) { const e = list.find(x => x.id === m.immopilotId); if (e) return e }
  if (coll === 'contacts') {
    const em = normEmail(m.email ?? rec.data.email)
    if (em) { const e = list.find(x => normEmail(x.email) === em); if (e) return e }
    const ph = normPhone(m.phone ?? rec.data.phone)
    if (ph) { const e = list.find(x => normPhone(x.phone) === ph); if (e) return e }
  }
  if (coll === 'listings') {
    const c = String(m.centris ?? rec.data.centris ?? '').trim()
    if (c) { const e = list.find(x => String(x.centris ?? '').trim() === c); if (e) return e }
    const a = normAddress(m.address ?? rec.data.address)
    if (a.length > 4) { const e = list.find(x => normAddress(x.address) === a); if (e) return e }
  }
  return undefined
}

function findContact(doc: Doc, email?: string, phone?: string): Entity | undefined {
  const list: Entity[] = doc.contacts ?? []
  const em = normEmail(email), ph = normPhone(phone)
  return (em && list.find(c => normEmail(c.email) === em)) || (ph && list.find(c => normPhone(c.phone) === ph)) || undefined
}

function withSource(e: Entity, ctx: MergeCtx, rec: ExtRecord): Entity {
  const src: SourceRef = { p: ctx.provider, c: ctx.connectionId, x: rec.x, at: ctx.now, ...(rec.url ? { url: rec.url } : {}) }
  const list = ((e._src as SourceRef[] | undefined) ?? []).filter(s => !(s.p === ctx.provider && s.x === rec.x))
  return { ...e, _src: [...list, src] }
}

/** Valeurs par défaut d'une nouvelle entité (mêmes formes que les fabriques du navigateur). */
function blank(coll: string, id: string, ctx: MergeCtx): Entity {
  const today = ctx.now.slice(0, 10)
  switch (coll) {
    case 'contacts': return { id, type: 'prospect', firstName: '', lastName: '', email: '', phone: '', address: '', city: '', birthday: '', source: '', tags: [], ownerId: ctx.ownerId, stage: 'nouveau', budget: 0, criteria: '', motivation: '', timeline: '', notes: '', createdAt: today, lastContact: '', referredBy: '', closingDate: '' }
    case 'events': return { id, title: '', start: '', end: '', type: 'autre', location: '', contactId: '', listingId: '', agentId: ctx.ownerId, notes: '' }
    case 'tasks': return { id, title: '', due: today, done: false, priority: 'normale', assigneeId: ctx.ownerId, category: 'Suivi', contactId: '', listingId: '', dealId: '', notes: '' }
    case 'activities': return { id, contactId: '', kind: 'note', date: today, summary: '', memberId: ctx.ownerId }
    case 'listings': return { id, address: '', city: '', centris: '', propertyType: 'Maison', price: 0, status: 'active', sellerIds: [], agentId: ctx.ownerId, mandateStart: '', mandateEnd: '', commissionPct: 0, collabPct: 0, bedrooms: 0, bathrooms: 0, yearBuilt: 0, lot: '', livingArea: '', taxesMun: 0, taxesScol: 0, condoFees: 0, mortgageBalance: 0, features: {}, rooms: [], marketing: {}, docs: {}, schedule: {}, visitInfo: {}, extInfo: '', intInfo: '', notes: '', photoUrl: '', certificatRedo: '', certificatYear: '', createdAt: today, soldPrice: 0, soldDate: '' }
    default: return { id }
  }
}

export function emptyStats(): JobStats { return { fetched: 0, created: 0, updated: 0, unchanged: 0, review: 0, deleted: 0, tasks: 0 } }

/** Applique un lot d'enregistrements externes au document de l'agence. Pur : retourne un nouveau document. */
export function mergeRecords(docIn: Doc, linksIn: LinkState, records: ExtRecord[], ctx: MergeCtx, openReviewKeys: Set<string> = new Set()): MergeResult {
  const doc: Doc = { ...docIn }
  const links: LinkState = { links: { ...linksIn.links }, generated: [...linksIn.generated] }
  const reviews: ReviewItem[] = []
  const stats = emptyStats()
  const log: MergeResult['log'] = []
  const touch = (coll: string) => { doc[coll] = [...(doc[coll] ?? [])] }
  const put = (coll: string, e: Entity) => {
    const list: Entity[] = doc[coll]
    const i = list.findIndex(x => x.id === e.id)
    if (i >= 0) list[i] = e; else list.unshift(e)
  }
  const review = (r: Omit<ReviewItem, 'id' | 'key' | 'createdAt' | 'status' | 'connectionId' | 'proposedSource' | 'proposedAt'>) => {
    const key = hash(`${r.kind}|${r.coll}|${r.entityId}|${r.field}|${JSON.stringify(r.proposed)}`)
    if (openReviewKeys.has(key) || reviews.some(x => x.key === key)) return
    reviews.push({ ...r, id: 'rv_' + key, key, createdAt: ctx.now, status: 'ouvert', connectionId: ctx.connectionId, proposedSource: ctx.provider, proposedAt: ctx.now })
    stats.review++
    log.push({ kind: 'a_verifier', coll: r.coll, entityId: r.entityId, summary: `${r.fieldLabel} : écart à vérifier (${r.entityLabel})` })
  }

  for (const rec0 of records) {
    let rec = rec0
    stats.fetched++
    // ----- statistiques et campagnes : données externes pures, toujours mises à jour -----
    if (rec.kind === 'campaign' || rec.kind === 'metric') {
      const coll = COLL[rec.kind]; touch(coll)
      const id = `${ctx.provider}:${rec.x}`
      const cur = (doc[coll] as Entity[]).find(x => x.id === id)
      if (rec.deleted) { if (cur) { doc[coll] = (doc[coll] as Entity[]).filter(x => x.id !== id); stats.deleted++ } continue }
      const next = withSource({ ...(cur ?? { id, provider: ctx.provider, ownerId: ctx.ownerId }), ...rec.data, id }, ctx, rec)
      if (cur && JSON.stringify({ ...cur, _src: 0 }) === JSON.stringify({ ...next, _src: 0 })) { stats.unchanged++; continue }
      put(coll, next); cur ? stats.updated++ : stats.created++
      continue
    }
    // ----- documents externes rattachés à une fiche -----
    if (rec.kind === 'doc') {
      const t = rec.target
      if (!t) continue
      touch(t.coll)
      const e = (doc[t.coll] as Entity[]).find(x => x.id === t.id)
      if (!e) continue
      const docs = (rec.data.docs as { id: string }[]) ?? []
      const others = ((e.extDocs as { id: string; provider: string }[] | undefined) ?? []).filter(d => d.provider !== ctx.provider)
      const next = { ...e, extDocs: [...others, ...docs.map(d => ({ ...d, provider: ctx.provider, fetchedAt: ctx.now }))] }
      if (JSON.stringify((e.extDocs ?? []).map((d: { id: string }) => d.id)) === JSON.stringify(next.extDocs.map((d: { id: string }) => d.id))) { stats.unchanged++; put(t.coll, next); continue }
      put(t.coll, next); stats.updated++
      continue
    }

    const coll = COLL[rec.kind]; touch(coll)
    const key = linkKey(ctx.provider, rec.x)
    let entity = findEntity(doc, coll, rec, ctx.provider, links)

    // ----- suppression à la source -----
    if (rec.deleted) {
      if (!entity) { delete links.links[key]; continue }
      const base = links.links[key]?.base ?? {}
      const untouched = Object.entries(base).every(([f, v]) => same(f, entity![f], v))
      const onlyThisSource = ((entity._src as SourceRef[] | undefined) ?? []).every(s => s.p === ctx.provider)
      if (coll === 'events' && ctx.policy.auto.deleteCancelledEvents && untouched && onlyThisSource) {
        doc[coll] = (doc[coll] as Entity[]).filter(x => x.id !== entity!.id)
        delete links.links[key]
        stats.deleted++
        log.push({ kind: 'suppression_auto', coll, entityId: entity.id, summary: `Rendez-vous annulé à la source : ${labelOf(coll, entity)}` })
      } else {
        review({ kind: 'suppression', coll, entityId: entity.id, entityLabel: labelOf(coll, entity), field: '_deleted', fieldLabel: 'Supprimé à la source', current: 'présent', currentSource: 'ImmoPilot', currentAt: '', proposed: 'supprimé', note: 'La fiche a été supprimée ou annulée dans l’outil source. Rien n’a été retiré d’ImmoPilot.' })
      }
      continue
    }

    // ----- activités : rattachées à un contact existant seulement -----
    if (coll === 'activities' && !entity) {
      const c = findContact(doc, rec.match?.contactEmail, rec.match?.contactPhone)
      if (!c) { stats.unchanged++; continue }
      rec = { ...rec, data: { ...rec.data, contactId: c.id } }
      const lastContact = String(rec.data.date ?? '').slice(0, 10)
      if (lastContact && lastContact > String(c.lastContact ?? '')) {
        touch('contacts'); put('contacts', { ...c, lastContact })
      }
    }
    if (coll === 'events' && rec.match?.contactEmail) {
      const c = findContact(doc, rec.match.contactEmail)
      if (c && !rec.data.contactId) rec = { ...rec, data: { ...rec.data, contactId: c.id } }
    }

    // ----- création -----
    if (!entity) {
      const allowed = coll === 'contacts' ? (rec.lead ? ctx.policy.auto.importLeads : ctx.policy.auto.createContacts)
        : coll === 'events' ? ctx.policy.auto.createEvents : true
      if (!allowed) { stats.unchanged++; continue }
      const id = `${coll.slice(0, 2)}_${hash(key)}`
      const data = Object.fromEntries(Object.entries(rec.data).filter(([, v]) => v !== undefined))
      const prov = Object.fromEntries(Object.keys(data).map(f => [f, { p: ctx.provider, at: ctx.now }]))
      const created = withSource({ ...blank(coll, id, ctx), ...(rec.ownerId ? { ownerId: rec.ownerId } : {}), ...data, ...(ctx.private && coll === 'activities' ? { private: true } : {}), _prov: prov, id }, ctx, rec)
      put(coll, created)
      links.links[key] = { coll, id, base: data, at: ctx.now }
      stats.created++
      log.push({ kind: 'import', coll, entityId: id, summary: `Nouveau (${coll}) : ${labelOf(coll, created)}` })
      // doublon possible : même nom qu'un contact existant sans courriel/téléphone communs
      if (coll === 'contacts') {
        const name = `${created.firstName} ${created.lastName}`.trim().toLowerCase()
        const twin = name && (doc.contacts as Entity[]).find(c => c.id !== id && `${c.firstName} ${c.lastName}`.trim().toLowerCase() === name)
        if (twin) review({ kind: 'doublon', coll, entityId: id, entityLabel: labelOf(coll, created), field: '_duplicate', fieldLabel: 'Doublon possible', current: labelOf(coll, twin) + (twin.email ? ` <${twin.email}>` : ''), currentSource: 'ImmoPilot', currentAt: twin.createdAt ?? '', proposed: labelOf(coll, created) + (created.email ? ` <${created.email}>` : ''), note: 'Même nom qu’un contact existant. Accepter = fusionner les deux fiches.', relatedId: twin.id })
        if (rec.lead && ctx.policy.auto.createFollowUpTasks) {
          const tkey = `lead:${id}`
          if (!links.generated.includes(tkey) && !(doc.tasks as Entity[] ?? []).some(t => t.key === tkey)) {
            touch('tasks')
            put('tasks', { ...blank('tasks', `ta_${hash(tkey)}`, ctx), assigneeId: created.ownerId, key: tkey, title: `Rappeler ${labelOf(coll, created)} — nouvelle demande (${ctx.provider})`, priority: 'haute', contactId: id, category: 'Prospection', notes: 'Tâche créée automatiquement à la réception de la demande.', _src: [{ p: 'immopilot', c: 'regles', x: tkey, at: ctx.now }] })
            links.generated.push(tkey)
            stats.tasks++
          }
        }
      }
      continue
    }

    // ----- mise à jour : fusion à trois voies par champ -----
    const link = links.links[key]
    const firstLink = !link
    const base = { ...(link?.base ?? {}) }
    let next: Entity = { ...entity }
    const prov = { ...((entity._prov as Record<string, { p: string; at: string }>) ?? {}) }
    let changed = false
    const createdHere = ((entity._src as SourceRef[] | undefined) ?? [])[0]?.p === ctx.provider
    for (const [field, remote] of Object.entries(rec.data)) {
      if (remote === undefined) continue // la source ne fournit pas ce champ : on n'invente rien
      const local = entity[field]
      const had = field in base
      const b = base[field]
      base[field] = remote
      if (same(field, local, remote)) continue
      if (had && same(field, b, remote)) { base[field] = b; continue } // la source n'a pas changé : on garde la valeur locale
      const sensitive = (SENSITIVE[coll] ?? []).includes(field)
      const localUntouched = had ? same(field, local, b) : isEmpty(local)
      const common = { coll, entityId: entity.id, entityLabel: labelOf(coll, entity), field, fieldLabel: FIELD_LABEL[field] ?? field, current: local, currentSource: prov[field]?.p ?? 'ImmoPilot', currentAt: prov[field]?.at ?? '', proposed: remote }
      if (sensitive && !(isEmpty(local) && createdHere)) {
        review({ ...common, kind: 'sensible', note: 'Donnée importante : la valeur d’ImmoPilot est conservée jusqu’à votre validation.' })
        continue
      }
      if (localUntouched) {
        if (!ctx.policy.auto.applyNonSensitive) { review({ ...common, kind: 'conflit', note: 'Application automatique désactivée par l’administrateur.' }); continue }
        next = { ...next, [field]: remote }
        prov[field] = { p: ctx.provider, at: ctx.now }
        changed = true
        continue
      }
      // valeur modifiée des deux côtés (ou divergence dès le premier rapprochement)
      if (!firstLink || (KEY_FIELDS[coll] ?? []).includes(field)) review({ ...common, kind: 'conflit', note: firstLink ? 'Les deux sources ne concordent pas.' : 'Modifié dans ImmoPilot et dans l’outil source.' })
    }
    next = withSource({ ...next, _prov: prov }, ctx, rec)
    put(coll, next)
    links.links[key] = { coll, id: entity.id, base, at: ctx.now }
    if (changed) { stats.updated++; log.push({ kind: 'maj_auto', coll, entityId: entity.id, summary: `Mis à jour depuis ${ctx.provider} : ${labelOf(coll, next)}` }) }
    else stats.unchanged++
  }
  return { doc, links, reviews, stats, log }
}

/** Fusionne le contact `dropId` dans `keepId` : champs vides complétés, sources réunies, références déplacées. */
export function mergeContacts(doc: Doc, keepId: string, dropId: string, now: string): Doc {
  const list: Entity[] = doc.contacts ?? []
  const keep = list.find(c => c.id === keepId), drop = list.find(c => c.id === dropId)
  if (!keep || !drop || keepId === dropId) return doc
  const merged: Entity = { ...keep }
  for (const [k, v] of Object.entries(drop)) if (isEmpty(merged[k]) && !isEmpty(v) && !k.startsWith('_')) merged[k] = v
  merged.tags = [...new Set([...(keep.tags ?? []), ...(drop.tags ?? [])])]
  merged._src = [...(keep._src ?? []), ...(drop._src ?? [])]
  merged._prov = { ...(drop._prov ?? {}), ...(keep._prov ?? {}) }
  merged.notes = [keep.notes, drop.notes && drop.notes !== keep.notes ? drop.notes : ''].filter(Boolean).join('\n')
  const swap = (id: string) => (id === dropId ? keepId : id)
  const out: Doc = { ...doc, contacts: list.filter(c => c.id !== dropId).map(c => (c.id === keepId ? merged : c)) }
  for (const coll of ['activities', 'tasks', 'events']) out[coll] = (doc[coll] ?? []).map((e: Entity) => (e.contactId === dropId ? { ...e, contactId: keepId } : e))
  out.deals = (doc.deals ?? []).map((d: Entity) => ({ ...d, contactIds: [...new Set((d.contactIds ?? []).map(swap))] }))
  out.listings = (doc.listings ?? []).map((l: Entity) => ({ ...l, sellerIds: [...new Set((l.sellerIds ?? []).map(swap))] }))
  void now
  return out
}

/** Application d'une décision « À vérifier » acceptée. */
export function applyReview(doc: Doc, r: ReviewItem, by: string, now: string): Doc {
  const list: Entity[] = doc[r.coll] ?? []
  if (r.field === '_deleted') return { ...doc, [r.coll]: list.filter(e => e.id !== r.entityId) }
  if (r.field === '_duplicate') return mergeContacts(doc, r.relatedId ?? '', r.entityId, now)
  return { ...doc, [r.coll]: list.map(e => (e.id === r.entityId ? { ...e, [r.field]: r.proposed, _prov: { ...(e._prov ?? {}), [r.field]: { p: `${r.proposedSource} (validé par ${by})`, at: now } } } : e)) }
}
