import { describe, expect, it } from 'vitest'
import { mergeRecords, mergeContacts, applyReview, type ExtRecord, type LinkState } from '../server/sync/merge'
import { consistencyChecks } from '../server/sync/rules'
import { defaultPolicy } from '../server/policy'

const ctx = (over: Partial<Parameters<typeof mergeRecords>[3]> = {}) => ({ provider: 'google', connectionId: 'cx1', ownerId: 'u1', now: '2026-09-29T12:00:00.000Z', policy: defaultPolicy(), ...over })
const empty = (): LinkState => ({ links: {}, generated: [] })
const ev = (x: string, data: Record<string, unknown>, extra: Partial<ExtRecord> = {}): ExtRecord => ({ kind: 'event', x, data, ...extra })

describe('rapprochement et fusion', () => {
  it('crée une fois puis ne duplique jamais (resynchronisation idempotente)', () => {
    const recs = [ev('e1', { title: 'Visite', start: '2026-10-01T10:00', end: '2026-10-01T11:00' })]
    const a = mergeRecords({ events: [] }, empty(), recs, ctx())
    expect(a.doc.events).toHaveLength(1)
    expect(a.stats.created).toBe(1)
    const b = mergeRecords(a.doc, a.links, recs, ctx())
    expect(b.doc.events).toHaveLength(1)
    expect(b.stats.created).toBe(0)
    // même sans le fichier de liens (échec partiel entre deux écritures) : retrouvé par sa provenance
    const c = mergeRecords(a.doc, empty(), recs, ctx())
    expect(c.doc.events).toHaveLength(1)
    expect(a.doc.events[0]._src[0]).toMatchObject({ p: 'google', c: 'cx1', x: 'e1' })
    expect(a.doc.events[0]._prov.title).toMatchObject({ p: 'google' })
  })

  it('rapproche un événement envoyé depuis ImmoPilot par son identifiant', () => {
    const doc = { events: [{ id: 'local1', title: 'RDV', start: '2026-10-01T10:00', end: '2026-10-01T11:00', type: 'rdv_vendeur' }] }
    const r = mergeRecords(doc, empty(), [ev('g1', { title: 'RDV', start: '2026-10-01T10:00' }, { match: { immopilotId: 'local1' } })], ctx())
    expect(r.doc.events).toHaveLength(1)
    expect(r.doc.events[0].type).toBe('rdv_vendeur') // champ absent de la source : jamais modifié
  })

  it('applique un changement ordinaire de la source si la valeur locale n’a pas bougé', () => {
    const a = mergeRecords({ events: [] }, empty(), [ev('e1', { title: 'Visite', location: 'Laval' })], ctx())
    const b = mergeRecords(a.doc, a.links, [ev('e1', { title: 'Visite', location: 'Montréal' })], ctx())
    expect(b.doc.events[0].location).toBe('Montréal')
    expect(b.stats.updated).toBe(1)
    expect(b.reviews).toHaveLength(0)
  })

  it('préserve une modification locale quand la source n’a pas changé', () => {
    const a = mergeRecords({ events: [] }, empty(), [ev('e1', { title: 'Visite', location: 'Laval' })], ctx())
    a.doc.events[0].location = 'Laval — bureau'
    const b = mergeRecords(a.doc, a.links, [ev('e1', { title: 'Visite', location: 'Laval' })], ctx())
    expect(b.doc.events[0].location).toBe('Laval — bureau')
    expect(b.reviews).toHaveLength(0)
  })

  it('signale un conflit quand les deux côtés ont changé', () => {
    const a = mergeRecords({ events: [] }, empty(), [ev('e1', { title: 'Visite', location: 'Laval' })], ctx())
    a.doc.events[0].location = 'Laval — bureau'
    const b = mergeRecords(a.doc, a.links, [ev('e1', { title: 'Visite', location: 'Terrebonne' })], ctx())
    expect(b.doc.events[0].location).toBe('Laval — bureau')
    expect(b.reviews[0]).toMatchObject({ kind: 'conflit', field: 'location', current: 'Laval — bureau', proposed: 'Terrebonne' })
    // la même exception n'est pas recréée à la synchronisation suivante
    const c = mergeRecords(b.doc, b.links, [ev('e1', { title: 'Visite', location: 'Terrebonne' })], ctx(), new Set(b.reviews.map(r => r.key)))
    expect(c.reviews).toHaveLength(0)
  })

  it('envoie les données importantes (prix, superficie) en « À vérifier » sans les écraser', () => {
    const doc = { listings: [{ id: 'l1', address: '12 rue des Érables', centris: '12345678', price: 500000, livingArea: '1200 pi²' }] }
    const r = mergeRecords(doc, empty(), [{ kind: 'listing', x: 'k1', match: { centris: '12345678' }, data: { price: 489000, livingArea: '1250 pi²', bedrooms: 3 } }], ctx({ provider: 'crea' }))
    expect(r.doc.listings[0].price).toBe(500000)
    expect(r.doc.listings[0].bedrooms).toBe(3) // champ ordinaire vide : complété
    expect(r.reviews.map(x => x.field).sort()).toEqual(['livingArea', 'price'])
    expect(r.reviews[0]).toMatchObject({ kind: 'sensible', proposedSource: 'crea' })
    const accepted = applyReview(r.doc, r.reviews.find(x => x.field === 'price')!, 'Admin', '2026-09-29')
    expect(accepted.listings[0].price).toBe(489000)
    expect(accepted.listings[0]._prov.price.p).toContain('validé par Admin')
  })

  it('rapproche les contacts par courriel puis téléphone, sans créer de doublon', () => {
    const doc = { contacts: [{ id: 'c1', firstName: 'Julie', lastName: 'Tremblay', email: 'JULIE@ex.com', phone: '' }, { id: 'c2', firstName: 'Marc', lastName: 'Roy', email: '', phone: '(514) 555-0101' }] }
    const r = mergeRecords(doc, empty(), [
      { kind: 'contact', x: 'p1', data: { email: 'julie@ex.com', phone: '450 555-0000' } },
      { kind: 'contact', x: 'p2', data: { phone: '+1 514-555-0101', city: 'Laval' } },
    ], ctx())
    expect(r.doc.contacts).toHaveLength(2)
    expect(r.doc.contacts.find((c: { id: string }) => c.id === 'c1').phone).toBe('450 555-0000')
    expect(r.doc.contacts.find((c: { id: string }) => c.id === 'c2').city).toBe('Laval')
  })

  it('ne modifie jamais l’identité d’un contact existant sans validation', () => {
    const doc = { contacts: [{ id: 'c1', firstName: 'Julie', lastName: 'Tremblay', email: 'j@ex.com' }] }
    const r = mergeRecords(doc, empty(), [{ kind: 'contact', x: 'p1', data: { email: 'j@ex.com', lastName: 'Tremblay-Roy' } }], ctx())
    expect(r.doc.contacts[0].lastName).toBe('Tremblay')
    expect(r.reviews[0]).toMatchObject({ kind: 'sensible', field: 'lastName' })
  })

  it('retire un rendez-vous annulé à la source s’il n’a pas été modifié, sinon le signale', () => {
    const a = mergeRecords({ events: [] }, empty(), [ev('e1', { title: 'A' }), ev('e2', { title: 'B' })], ctx())
    a.doc.events.find((e: { title: string }) => e.title === 'B').notes = 'modifié localement'
    a.doc.events.find((e: { title: string }) => e.title === 'B').title = 'B (confirmé)'
    const b = mergeRecords(a.doc, a.links, [ev('e1', {}, { deleted: true }), ev('e2', {}, { deleted: true })], ctx())
    expect(b.doc.events.map((e: { title: string }) => e.title)).toEqual(['B (confirmé)'])
    expect(b.reviews[0]).toMatchObject({ kind: 'suppression' })
  })

  it('ne supprime jamais un contact automatiquement', () => {
    const a = mergeRecords({ contacts: [] }, empty(), [{ kind: 'contact', x: 'p1', data: { firstName: 'A', email: 'a@x.com' } }], ctx())
    const b = mergeRecords(a.doc, a.links, [{ kind: 'contact', x: 'p1', deleted: true, data: {} }], ctx())
    expect(b.doc.contacts).toHaveLength(1)
    expect(b.reviews[0].kind).toBe('suppression')
  })

  it('crée une tâche de suivi par demande entrante, une seule fois, et ne la recrée pas si elle est supprimée', () => {
    const lead: ExtRecord = { kind: 'contact', x: 'lead1', lead: true, data: { firstName: 'Nora', email: 'nora@ex.com' } }
    const a = mergeRecords({ contacts: [], tasks: [] }, empty(), [lead], ctx({ provider: 'meta' }))
    expect(a.doc.tasks).toHaveLength(1)
    expect(a.doc.tasks[0].key).toMatch(/^lead:/)
    const withoutTask = { ...a.doc, tasks: [] }
    const b = mergeRecords(withoutTask, a.links, [lead], ctx({ provider: 'meta' }))
    expect(b.doc.tasks).toHaveLength(0)
    expect(b.doc.contacts).toHaveLength(1)
  })

  it('respecte les actions automatiques désactivées par l’administrateur', () => {
    const policy = defaultPolicy()
    policy.auto.createContacts = false
    policy.auto.applyNonSensitive = false
    const a = mergeRecords({ contacts: [], events: [] }, empty(), [{ kind: 'contact', x: 'p1', data: { email: 'z@z.com' } }, ev('e1', { title: 'X', location: 'A' })], ctx({ policy }))
    expect(a.doc.contacts).toHaveLength(0)
    const b = mergeRecords(a.doc, a.links, [ev('e1', { title: 'X', location: 'B' })], ctx({ policy }))
    expect(b.doc.events[0].location).toBe('A')
    expect(b.reviews[0].kind).toBe('conflit')
  })

  it('rattache les communications à un contact existant uniquement, en privé', () => {
    const doc = { contacts: [{ id: 'c1', email: 'c@ex.com', lastContact: '2026-01-01' }], activities: [] }
    const r = mergeRecords(doc, empty(), [
      { kind: 'activity', x: 'm1', match: { contactEmail: 'c@ex.com' }, data: { kind: 'courriel', date: '2026-09-28', summary: 'Courriel reçu : offre', memberId: 'u1' } },
      { kind: 'activity', x: 'm2', match: { contactEmail: 'inconnu@ex.com' }, data: { kind: 'courriel', date: '2026-09-28', summary: 'spam', memberId: 'u1' } },
    ], ctx({ private: true }))
    expect(r.doc.activities).toHaveLength(1)
    expect(r.doc.activities[0]).toMatchObject({ contactId: 'c1', private: true })
    expect(r.doc.contacts[0].lastContact).toBe('2026-09-28')
  })

  it('signale et fusionne les doublons', () => {
    const doc = { contacts: [{ id: 'a', firstName: 'Léa', lastName: 'Roy', email: 'lea@x.com', phone: '' }, { id: 'b', firstName: 'Léa', lastName: 'Roy', email: 'LEA@x.com', phone: '5145550000' }], tasks: [{ id: 't', contactId: 'b' }], deals: [{ id: 'd', contactIds: ['b'] }] }
    const checks = consistencyChecks(doc, '2026-09-29')
    expect(checks[0]).toMatchObject({ kind: 'doublon', relatedId: 'a', entityId: 'b' })
    const merged = mergeContacts(doc, 'a', 'b', '2026-09-29')
    expect(merged.contacts).toHaveLength(1)
    expect(merged.contacts[0].phone).toBe('5145550000')
    expect(merged.tasks[0].contactId).toBe('a')
    expect(merged.deals[0].contactIds).toEqual(['a'])
  })

  it('met à jour les statistiques externes sans doublon', () => {
    const m: ExtRecord = { kind: 'metric', x: 'fb:1:followers', data: { label: 'Abonnés', value: 10, unit: '', at: 'x', ownerId: 'u1' } }
    const a = mergeRecords({ metrics: [] }, empty(), [m], ctx({ provider: 'meta' }))
    const b = mergeRecords(a.doc, a.links, [{ ...m, data: { ...m.data, value: 12 } }], ctx({ provider: 'meta' }))
    expect(b.doc.metrics).toHaveLength(1)
    expect(b.doc.metrics[0].value).toBe(12)
  })
})
