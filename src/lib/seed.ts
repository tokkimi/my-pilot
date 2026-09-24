import type { Contact, DB, Deal, Listing, Task, CalEvent, Showing, Partner, Expense, Post } from './types.js'
import { OBJECTIONS_SEED, TEMPLATES_SEED } from './content.js'
import { PLATFORM_CATALOG } from './platforms.js'
import { addDays, isoDate, isoDateTime, uid } from './utils.js'

export const newContact = (ownerId: string, p: Partial<Contact> = {}): Contact => ({
  id: uid(), type: 'prospect', firstName: '', lastName: '', email: '', phone: '', address: '', city: '', birthday: '', source: '', tags: [],
  ownerId, stage: 'nouveau', budget: 0, criteria: '', motivation: '', timeline: '', notes: '', createdAt: isoDate(new Date()), lastContact: '',
  referredBy: '', closingDate: '', ...p,
})

export const newListing = (agentId: string, p: Partial<Listing> = {}): Listing => ({
  id: uid(), address: '', city: '', centris: '', propertyType: 'Maison', price: 0, status: 'preparation', sellerIds: [], agentId,
  mandateStart: isoDate(new Date()), mandateEnd: isoDate(addDays(182)), commissionPct: 5, collabPct: 2.5, bedrooms: 0, bathrooms: 0, yearBuilt: 0,
  lot: '', livingArea: '', taxesMun: 0, taxesScol: 0, condoFees: 0, mortgageBalance: 0, features: {}, rooms: [], marketing: {}, docs: {},
  schedule: {}, visitInfo: {}, extInfo: '', intInfo: '', notes: '', photoUrl: '', certificatRedo: '', certificatYear: '', createdAt: isoDate(new Date()),
  soldPrice: 0, soldDate: '', ...p,
})

export const newDeal = (agentId: string, p: Partial<Deal> = {}): Deal => ({
  id: uid(), kind: 'vente', title: '', listingId: '', contactIds: [], agentId, price: 0, checklist: {}, dates: {}, notaire: '', arpenteur: '',
  collabBroker: '', lender: '', commissionPct: 5, notes: '', status: 'ouvert', createdAt: isoDate(new Date()), ...p,
})

export const newTask = (assigneeId: string, p: Partial<Task> = {}): Task => ({
  id: uid(), title: '', due: isoDate(new Date()), done: false, priority: 'normale', assigneeId, category: 'Suivi', contactId: '', listingId: '', dealId: '', notes: '', ...p,
})

export const newEvent = (agentId: string, p: Partial<CalEvent> = {}): CalEvent => {
  const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1)
  const e = new Date(s); e.setHours(e.getHours() + 1)
  return { id: uid(), title: '', start: isoDateTime(s), end: isoDateTime(e), type: 'rdv_vendeur', location: '', contactId: '', listingId: '', agentId, notes: '', ...p }
}

export const newShowing = (p: Partial<Showing> = {}): Showing => ({
  id: uid(), listingId: '', date: isoDateTime(new Date()), broker: '', brokerPhone: '', buyer: '', interest: 'moyen', rating: 3, priceOpinion: '', feedback: '', followUp: false, ...p,
})

export const newPartner = (p: Partial<Partner> = {}): Partner => ({ id: uid(), category: 'notaire', name: '', company: '', phone: '', email: '', website: '', notes: '', rating: 0, ...p })
export const newExpense = (memberId: string, p: Partial<Expense> = {}): Expense => ({ id: uid(), date: isoDate(new Date()), category: 'Marketing', vendor: '', amount: 0, memberId, listingId: '', notes: '', ...p })
export const newPost = (p: Partial<Post> = {}): Post => ({ id: uid(), date: isoDate(new Date()), platforms: ['Instagram', 'Facebook'], format: 'publication', caption: '', listingId: '', status: 'idee', kind: 'Nouveauté', ...p })

export function seed(): DB {
  const d = (n: number) => isoDate(addDays(n))
  const dt = (n: number, h: number) => { const x = addDays(n); x.setHours(h, 0, 0, 0); return isoDateTime(x) }
  const bday = (n: number) => { const x = addDays(n); x.setFullYear(1985); return isoDate(x) }

  const members = [
    { id: 'm1', name: 'Emilie Cauvier', role: 'admin' as const, title: 'Courtier immobilier résidentiel', phone: '514 774-9818', email: 'emilie@equipecauvier.com', color: '#7c3aed', split: 70, licence: '', active: true },
    { id: 'm2', name: 'Jean-François Alexandre', role: 'courtier' as const, title: 'Courtier immobilier résidentiel et commercial', phone: '514 588-8478', email: 'jf@cauvieralexandre.com', color: '#0891b2', split: 70, licence: '', active: true },
    { id: 'm3', name: 'Adjointe administrative', role: 'adjointe' as const, title: 'Adjointe de l’équipe', phone: '', email: 'admin@equipecauvier.com', color: '#db2777', split: 0, licence: '', active: true },
    { id: 'm4', name: 'Marketing', role: 'agent' as const, title: 'Responsable marketing', phone: '', email: 'marketing@equipecauvier.com', color: '#ea580c', split: 0, licence: '', active: true },
  ]

  const c = (p: Partial<Contact>) => newContact(p.ownerId ?? 'm1', p)
  const contacts: Contact[] = [
    c({ id: 'c1', type: 'vendeur', firstName: 'Julie', lastName: 'Tremblay', email: 'julie.t@exemple.com', phone: '514 555-0101', address: '1245 rue des Érables', city: 'Laval', stage: 'actif', source: 'Référence', tags: ['Unifamiliale'], birthday: bday(4), lastContact: d(-2), motivation: 'Achat d’une plus grande maison', timeline: '3 mois' }),
    c({ id: 'c2', type: 'vendeur', firstName: 'Marc', lastName: 'Gagnon', email: 'marc.g@exemple.com', phone: '514 555-0102', address: '88 av. du Parc, app. 402', city: 'Montréal', stage: 'sous_offre', source: 'Centris', tags: ['Condo'], lastContact: d(-1), ownerId: 'm2' }),
    c({ id: 'c3', type: 'acheteur', firstName: 'Sophie', lastName: 'Côté', email: 'sophie.c@exemple.com', phone: '438 555-0103', city: 'Montréal', stage: 'actif', source: 'Instagram', budget: 650000, criteria: 'Plex 2-3 logements, Rosemont / Villeray', tags: ['Premier achat'], lastContact: d(-5) }),
    c({ id: 'c4', type: 'acheteur', firstName: 'David', lastName: 'Roy', email: 'd.roy@exemple.com', phone: '514 555-0104', city: 'Laval', stage: 'sous_offre', source: 'Site Web', budget: 480000, criteria: 'Condo 2 CAC près métro', lastContact: d(-3), ownerId: 'm2' }),
    c({ id: 'c5', type: 'prospect', firstName: 'Nathalie', lastName: 'Bouchard', email: 'n.bouchard@exemple.com', phone: '450 555-0105', city: 'Laval', stage: 'rdv', source: 'Porte-à-porte', motivation: 'Enfants partis — veut réduire', lastContact: d(-7) }),
    c({ id: 'c6', type: 'prospect', firstName: 'Patrick', lastName: 'Lavoie', phone: '514 555-0106', city: 'Montréal', stage: 'nouveau', source: 'Facebook', lastContact: '' }),
    c({ id: 'c7', type: 'ancien_client', firstName: 'Isabelle', lastName: 'Morin', email: 'i.morin@exemple.com', phone: '514 555-0107', city: 'Blainville', stage: 'conclu', source: 'Référence', birthday: bday(12), closingDate: isoDate(addDays(-355)), lastContact: d(-200) }),
    c({ id: 'c8', type: 'sphere', firstName: 'Kevin', lastName: 'Pelletier', phone: '514 555-0108', city: 'Montréal', stage: 'contacte', source: 'Sphère', lastContact: d(-140) }),
    c({ id: 'c9', type: 'investisseur', firstName: 'Olivier', lastName: 'Fortin', email: 'o.fortin@exemple.com', phone: '514 555-0109', city: 'Montréal', stage: 'contacte', source: 'LinkedIn', budget: 1500000, criteria: '6-plex et +, rendement 6 %+', ownerId: 'm2', lastContact: d(-20) }),
    c({ id: 'c10', type: 'ancien_client', firstName: 'Caroline', lastName: 'Bélanger', phone: '450 555-0110', city: 'Laval', stage: 'conclu', birthday: bday(-1), closingDate: isoDate(addDays(-700)), lastContact: d(-400) }),
    c({ id: 'c11', type: 'prospect', firstName: 'Mathieu', lastName: 'Girard', email: 'm.girard@exemple.com', phone: '514 555-0111', city: 'Montréal', stage: 'contacte', source: 'DuProprio', lastContact: d(-10) }),
    c({ id: 'c12', type: 'vendeur', firstName: 'Annie', lastName: 'Caron', phone: '450 555-0112', city: 'Terrebonne', stage: 'mandat', source: 'Référence', lastContact: d(-1) }),
  ]

  const listings: Listing[] = [
    newListing('m1', { id: 'l1', address: '1245 rue des Érables', city: 'Laval', centris: '12345678', propertyType: 'Maison à étages', price: 689000, status: 'active', sellerIds: ['c1'], bedrooms: 4, bathrooms: 2, yearBuilt: 1998, mortgageBalance: 280000, taxesMun: 4200, taxesScol: 420, mandateStart: d(-21), mandateEnd: d(160), marketing: { 'Photographies professionnelles (correction lumière)': true, 'Centris': true, 'Realtor.ca': true, 'Publicité Facebook': true, 'Pancarte + boîte à clé': true }, docs: { 'Contrat de courtage': true, 'Déclaration du vendeur': true, 'Compte de taxes municipales': true } }),
    newListing('m2', { id: 'l2', address: '88 av. du Parc, app. 402', city: 'Montréal', centris: '23456789', propertyType: 'Condo', price: 529000, status: 'pa_acceptee', sellerIds: ['c2'], bedrooms: 2, bathrooms: 1, yearBuilt: 2012, condoFees: 385, mortgageBalance: 310000, mandateStart: d(-60), mandateEnd: d(120) }),
    newListing('m1', { id: 'l3', address: '17 place Caron', city: 'Terrebonne', propertyType: 'Maison plain-pied', price: 545000, status: 'preparation', sellerIds: ['c12'], bedrooms: 3, bathrooms: 1, yearBuilt: 1987 }),
  ]

  const deals: Deal[] = [
    newDeal('m2', { id: 'd1', kind: 'vente', title: 'Vente — 88 av. du Parc #402', listingId: 'l2', contactIds: ['c2'], price: 521000, commissionPct: 5, dates: { mandat: d(-60), paAcceptee: d(-4), inspection: d(3), financement: d(10), acte: d(40), occupation: d(41) }, checklist: { m1: true, m2: true, m3: true, m4: true, m5: true, m6: true, m7: true, n1: true, n2: true, n3: true, n4: true, n5: true, n6: true, k1: true, k2: true, k3: true, p1: true, p2: true }, notaire: 'Me Exemple, notaire', collabBroker: 'Courtier collaborateur — Agence X', docType: 'vente_residentielle', situation: { condo_divise: true, depot: true }, docs: { contrat: 'inclus', fiche: 'inclus', identite: 'inclus', canafe: 'inclus', loi25: 'inclus', dv: 'inclus', certificat: 'a_venir', taxes_mun: 'inclus', decl_copro: 'a_venir' }, docsDue: d(2), offers: [{ id: 'o1', kind: 'PA', number: '1', date: d(-4), price: 521000, status: 'acceptee', signedSeller: true, ackBuyer: true, proof: true, notes: 'Inspection 7 j, financement 14 j' }] }),
    newDeal('m2', { id: 'd2', kind: 'achat', title: 'Achat — David Roy (condo Laval)', contactIds: ['c4'], price: 465000, commissionPct: 2.5, dates: { mandat: d(-45), paAcceptee: d(-2), inspection: d(5), financement: d(12), acte: d(45) }, docType: 'achat', situation: { financement: true, inspection: true, depot: true }, docs: { contrat_achat: 'inclus', identite: 'inclus', loi25: 'inclus', pa: 'inclus' }, docsDue: d(-1), checklist: { a1: true, a2: true, a3: true, a4: true, a5: true, a6: true, r1: true, r2: true, r3: true, o1: true, o2: true, o3: true, o4: true } }),
    newDeal('m1', { id: 'd3', kind: 'vente', title: 'Vente — 1245 rue des Érables', listingId: 'l1', contactIds: ['c1'], price: 689000, commissionPct: 5, dates: { mandat: d(-21), photo: d(-16), enLigne: d(-14) }, checklist: { m1: true, m2: true, m3: true, m4: true, m5: true, m6: true, n1: true, n2: true, n3: true, n4: true, n5: true, k1: true, k2: true } }),
    newDeal('m1', { id: 'd4', kind: 'vente', title: 'Vente — 32 rue Saint-Louis', contactIds: ['c7'], price: 612000, commissionPct: 5, status: 'conclu', dates: { acte: d(-20) } }),
  ]

  const t = (p: Partial<Task>) => newTask(p.assigneeId ?? 'm1', p)
  const tasks: Task[] = [
    t({ title: 'Rappeler Nathalie Bouchard — confirmer RDV évaluation', due: d(0), priority: 'haute', contactId: 'c5', category: 'Prospection' }),
    t({ title: 'Commander Pancarte Express + boîte à clé — 17 place Caron', due: d(1), assigneeId: 'm3', listingId: 'l3', category: 'Inscription' }),
    t({ title: 'Relancer financement — dossier av. du Parc', due: d(2), assigneeId: 'm2', dealId: 'd1', priority: 'haute', category: 'Transaction' }),
    t({ title: 'Rapport de mise en marché à Julie Tremblay', due: d(-1), contactId: 'c1', listingId: 'l1', category: 'Vendeur' }),
    t({ title: 'Créer reel « Nouveauté » — rue des Érables', due: d(3), assigneeId: 'm4', listingId: 'l1', category: 'Marketing' }),
    t({ title: 'Envoyer propriétés ciblées à Sophie Côté', due: d(1), contactId: 'c3', category: 'Acheteur' }),
  ]

  const e = (p: Partial<CalEvent>) => newEvent(p.agentId ?? 'm1', p)
  const events: CalEvent[] = [
    e({ title: 'RDV vendeur — Nathalie Bouchard', start: dt(1, 18), end: dt(1, 19), type: 'rdv_vendeur', contactId: 'c5', location: 'Laval' }),
    e({ title: 'Séance photo — 17 place Caron', start: dt(3, 10), end: dt(3, 12), type: 'photo', listingId: 'l3', agentId: 'm1' }),
    e({ title: 'Inspection — 88 av. du Parc', start: dt(3, 13), end: dt(3, 16), type: 'inspection', listingId: 'l2', agentId: 'm2' }),
    e({ title: 'Visites — Sophie Côté (3 plex)', start: dt(2, 17), end: dt(2, 20), type: 'visite', contactId: 'c3' }),
    e({ title: 'Visite libre — 1245 rue des Érables', start: dt(5, 14), end: dt(5, 16), type: 'visite_libre', listingId: 'l1' }),
  ]

  const showings: Showing[] = [
    { id: uid(), listingId: 'l1', date: dt(-3, 18), broker: 'Courtier A — Royal LePage', brokerPhone: '514 555-0200', buyer: 'Jeune famille', interest: 'fort', rating: 4, priceOpinion: 'Juste', feedback: 'Aiment la cour, trouvent la cuisine à rafraîchir.', followUp: true },
    { id: uid(), listingId: 'l1', date: dt(-2, 19), broker: 'Courtier B — RE/MAX', brokerPhone: '', buyer: 'Couple retraité', interest: 'faible', rating: 2, priceOpinion: 'Élevé', feedback: 'Trop d’escaliers pour eux.', followUp: false },
  ]

  const partners: Partner[] = [
    newPartner({ category: 'notaire', name: 'Notaire (à compléter)', company: '', notes: 'Ajoutez vos notaires de confiance' }),
    newPartner({ category: 'arpenteur', name: 'Arpenteur-géomètre (à compléter)' }),
    newPartner({ category: 'inspecteur', name: 'Inspecteur en bâtiment (à compléter)' }),
    newPartner({ category: 'hypothecaire', name: 'Courtier hypothécaire (à compléter)', notes: 'Résidentiel : payé par l’institution. Commercial : ~1 % du prêt.' }),
    newPartner({ category: 'photographe', name: 'Photographe / drone (à compléter)' }),
    newPartner({ category: 'home_staging', name: 'Home staging (à compléter)' }),
  ]

  const expenses: Expense[] = [
    newExpense('m1', { category: 'Photographie', vendor: 'Photographe', amount: 350, listingId: 'l1', date: d(-16) }),
    newExpense('m1', { category: 'Pancartes', vendor: 'Pancarte Express', amount: 120, listingId: 'l1', date: d(-18) }),
    newExpense('m4', { category: 'Publicité', vendor: 'Meta Ads', amount: 200, listingId: 'l1', date: d(-12) }),
  ]

  return {
    version: 1, marketingItems: [], operations: [], resources: [],
    agency: { name: 'Équipe Cauvier', office: 'Laval – Montréal, QC', phone: '514 774-9818', email: 'info@equipecauvier.com', website: 'https://emiliecauvier.com', linktree: '' },
    currentUserId: 'm1',
    members,
    contacts,
    activities: [
      { id: uid(), contactId: 'c1', kind: 'appel', date: d(-2), summary: 'Retour sur les visites de la fin de semaine', memberId: 'm1' },
      { id: uid(), contactId: 'c5', kind: 'rencontre', date: d(-7), summary: 'Rencontrée au porte-à-porte, intéressée par une évaluation', memberId: 'm1' },
    ],
    listings,
    deals,
    tasks,
    events,
    showings,
    partners,
    platforms: PLATFORM_CATALOG.map(p => ({ key: p.key, name: p.name, url: p.url, category: p.category, usage: p.usage, id: uid(), account: '', notes: '' })),
    templates: TEMPLATES_SEED.map(p => ({ ...p, id: uid(), channel: p.channel as 'courriel' | 'texto' | 'reseaux' })),
    posts: [
      newPost({ date: d(1), caption: 'Nouveauté à vendre — 1245 rue des Érables, Laval', listingId: 'l1', status: 'planifie', format: 'reel' }),
      newPost({ date: d(4), caption: 'VENDU — av. du Parc (à publier après conditions)', listingId: 'l2', status: 'idee', kind: 'Vendu' }),
    ],
    objections: OBJECTIONS_SEED.map(o => ({ ...o, id: uid() })),
    expenses,
    visits: [],
    ledger: [
      { id: uid(), kind: 'revenu', date: d(-20), ownerId: 'm1', category: 'commission', description: 'Rétribution — 32 rue Saint-Louis', counterpart: 'Agence', amount: 21420, tps: 1071, tvq: 2136.65, deductiblePct: 100, paymentMethod: 'Virement', receipts: [], dealId: 'd4', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-16), ownerId: 'm1', category: 'mise_en_valeur', description: 'Photos professionnelles + drone — rue des Érables', counterpart: 'Photographe', amount: 350, tps: 17.5, tvq: 34.91, deductiblePct: 100, paymentMethod: 'Carte de crédit', receipts: [], dealId: 'd3', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-12), ownerId: 'm1', category: 'publicite', description: 'Publicité Facebook / Instagram', counterpart: 'Meta', amount: 200, tps: 10, tvq: 19.95, deductiblePct: 100, paymentMethod: 'Carte de crédit', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-9), ownerId: 'm1', category: 'repas', description: 'Dîner client — Nathalie Bouchard', counterpart: 'Restaurant', amount: 68, tps: 3.4, tvq: 6.78, deductiblePct: 50, paymentMethod: 'Carte de crédit', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-30), ownerId: 'm1', category: 'cotisations', description: 'Cotisation annuelle OACIQ', counterpart: 'OACIQ', amount: 690, tps: 0, tvq: 0, deductiblePct: 100, paymentMethod: 'Virement', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-5), ownerId: 'm1', category: 'vehicule', description: 'Essence', counterpart: 'Station-service', amount: 82, tps: 4.1, tvq: 8.18, deductiblePct: 100, paymentMethod: 'Carte de débit', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'revenu', date: d(-20), ownerId: 'agence', category: 'redevances', description: 'Part d’agence — 32 rue Saint-Louis', counterpart: 'Transaction', amount: 9180, tps: 459, tvq: 915.71, deductiblePct: 100, paymentMethod: 'Virement', receipts: [], dealId: 'd4', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-25), ownerId: 'agence', category: 'loyer', description: 'Loyer du bureau', counterpart: 'Propriétaire', amount: 1800, tps: 90, tvq: 179.55, deductiblePct: 100, paymentMethod: 'Prélèvement', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
      { id: uid(), kind: 'depense', date: d(-15), ownerId: 'agence', category: 'logiciels', description: 'Abonnements logiciels', counterpart: 'Divers', amount: 240, tps: 12, tvq: 23.94, deductiblePct: 100, paymentMethod: 'Carte de crédit', receipts: [], dealId: '', invoiceId: '', createdBy: 'm1' },
    ],
    trips: [
      { id: uid(), ownerId: 'm1', date: d(-16), from: 'Bureau', to: '1245 rue des Érables, Laval', purpose: 'Séance photo', km: 18, dealId: 'd3' },
      { id: uid(), ownerId: 'm1', date: d(-7), from: 'Bureau', to: 'Laval — RDV Nathalie Bouchard', purpose: 'Évaluation vendeur', km: 24, dealId: '' },
    ],
    acctYears: [{ id: `m1-${new Date().getFullYear()}`, ownerId: 'm1', year: new Date().getFullYear(), totalKm: 18000, regime: 'autonome', notes: '' }],
    invoices: [
      { id: uid(), kind: 'devis', number: `DEV-${new Date().getFullYear()}-001`, date: d(-3), due: d(27), ownerId: 'agence', contactId: 'c9', client: { name: 'Olivier Fortin', email: 'o.fortin@exemple.com', address: 'Montréal', phone: '514 555-0109' },
        lines: [{ desc: 'Analyse de rentabilité — 6-plex (comparables, TGA, MRB)', qty: 1, unit: 'forfait', price: 750 }, { desc: 'Visite et relevé des logements', qty: 3, unit: 'heure', price: 95 }],
        discountPct: 0, taxable: true, notes: 'Merci de votre confiance.', terms: 'Devis valable 30 jours. Paiement à la livraison du rapport.', status: 'envoye', payments: [], sentAt: d(-3), fromQuoteId: '', dealId: '', createdBy: 'm1' },
    ],
  }
}

