export type ID = string

export type Role = 'admin' | 'courtier' | 'adjointe' | 'agent'
export interface Agency { name: string; office: string; phone: string; email: string; website: string; linktree: string }
export interface Member { id: ID; name: string; role: Role; title: string; phone: string; email: string; color: string; split: number; licence: string; active: boolean }

export type ContactType = 'vendeur' | 'acheteur' | 'prospect' | 'ancien_client' | 'sphere' | 'investisseur' | 'locataire'
export type Stage = 'nouveau' | 'contacte' | 'rdv' | 'mandat' | 'actif' | 'sous_offre' | 'conclu' | 'perdu'
export interface Contact {
  id: ID; type: ContactType; firstName: string; lastName: string; email: string; phone: string; address: string; city: string
  birthday: string; source: string; tags: string[]; ownerId: ID; stage: Stage; budget: number; criteria: string; motivation: string
  timeline: string; notes: string; createdAt: string; lastContact: string; referredBy: string; closingDate: string
}
export type ActivityKind = 'appel' | 'courriel' | 'texto' | 'rencontre' | 'note' | 'visite'
export interface Activity { id: ID; contactId: ID; kind: ActivityKind; date: string; summary: string; memberId: ID }

export type ListingStatus = 'preparation' | 'active' | 'pa_acceptee' | 'conditions_realisees' | 'vendu' | 'expire' | 'retire'
export interface Room { name: string; level: string; dim: string; floor: string }
export interface Listing {
  id: ID; address: string; city: string; centris: string; propertyType: string; price: number; status: ListingStatus
  sellerIds: ID[]; agentId: ID; mandateStart: string; mandateEnd: string; commissionPct: number; collabPct: number
  bedrooms: number; bathrooms: number; yearBuilt: number; lot: string; livingArea: string; taxesMun: number; taxesScol: number; condoFees: number
  mortgageBalance: number; features: Record<string, string[]>; rooms: Room[]; marketing: Record<string, boolean>; docs: Record<string, boolean>
  schedule: Record<string, string>; visitInfo: Record<string, string>; extInfo: string; intInfo: string; notes: string; photoUrl: string
  certificatRedo: string; certificatYear: string; createdAt: string; soldPrice: number; soldDate: string
}

export type DealKind = 'vente' | 'achat'
export interface Deal {
  id: ID; kind: DealKind; title: string; listingId: ID; contactIds: ID[]; agentId: ID; price: number
  checklist: Record<string, boolean>; dates: Record<string, string>; notaire: string; arpenteur: string; collabBroker: string
  lender: string; commissionPct: number; notes: string; status: 'ouvert' | 'conclu' | 'annule'; createdAt: string
}

export type Priority = 'basse' | 'normale' | 'haute'
export interface Task { id: ID; title: string; due: string; done: boolean; priority: Priority; assigneeId: ID; category: string; contactId: ID; listingId: ID; dealId: ID; notes: string }

export type EventType = 'rdv_vendeur' | 'rdv_acheteur' | 'visite' | 'visite_libre' | 'photo' | 'inspection' | 'notaire' | 'suivi' | 'autre'
export interface CalEvent { id: ID; title: string; start: string; end: string; type: EventType; location: string; contactId: ID; listingId: ID; agentId: ID; notes: string }

export interface Showing { id: ID; listingId: ID; date: string; broker: string; brokerPhone: string; buyer: string; interest: 'faible' | 'moyen' | 'fort'; rating: number; priceOpinion: string; feedback: string; followUp: boolean }

export type PartnerCat = 'notaire' | 'arpenteur' | 'inspecteur' | 'hypothecaire' | 'photographe' | 'home_staging' | 'entrepreneur' | 'demenageur' | 'evaluateur' | 'avocat' | 'autre'
export interface Partner { id: ID; category: PartnerCat; name: string; company: string; phone: string; email: string; website: string; notes: string; rating: number }

export interface Platform { id: ID; name: string; url: string; category: string; account: string; notes: string; usage: string }
export interface Template { id: ID; name: string; channel: 'courriel' | 'texto' | 'reseaux'; category: string; subject: string; body: string }
export interface Post { id: ID; date: string; platforms: string[]; format: 'publication' | 'reel' | 'story' | 'video' | 'infolettre'; caption: string; listingId: ID; status: 'idee' | 'planifie' | 'publie'; kind: string }
export interface Objection { id: ID; objection: string; response: string; category: string }
export interface Expense { id: ID; date: string; category: string; vendor: string; amount: number; memberId: ID; listingId: ID; notes: string }

export interface DB {
  version: number
  agency: Agency
  currentUserId: ID
  members: Member[]; contacts: Contact[]; activities: Activity[]; listings: Listing[]; deals: Deal[]; tasks: Task[]
  events: CalEvent[]; showings: Showing[]; partners: Partner[]; platforms: Platform[]; templates: Template[]; posts: Post[]
  objections: Objection[]; expenses: Expense[]
}
export type Coll = Exclude<keyof DB, 'version' | 'agency' | 'currentUserId'>
