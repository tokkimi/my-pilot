export type ID = string

export type Role = 'admin' | 'courtier' | 'adjointe' | 'agent'
export interface Agency { name: string; office: string; phone: string; email: string; website: string; linktree: string }
export interface Member { id: ID; name: string; role: Role; title: string; phone: string; email: string; color: string; split: number; licence: string; active: boolean
  /** accès Google autorisés par l'admin de l'agence */ googleDrive?: boolean; googleCalendar?: boolean; googleEmail?: string; driveUrl?: string }

export type ContactType = 'vendeur' | 'acheteur' | 'prospect' | 'ancien_client' | 'sphere' | 'investisseur' | 'locataire'
export type Stage = 'nouveau' | 'contacte' | 'rdv' | 'mandat' | 'actif' | 'sous_offre' | 'conclu' | 'perdu'
export interface Contact {
  id: ID; type: ContactType; firstName: string; lastName: string; email: string; phone: string; address: string; city: string
  birthday: string; source: string; tags: string[]; ownerId: ID; stage: Stage; budget: number; criteria: string; motivation: string
  timeline: string; notes: string; createdAt: string; lastContact: string; referredBy: string; closingDate: string; driveUrl?: string
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
  certificatRedo: string; certificatYear: string; createdAt: string; soldPrice: number; soldDate: string; driveUrl?: string; driveFolderId?: string
}

export type DealKind = 'vente' | 'achat'
export interface Deal {
  id: ID; kind: DealKind; title: string; listingId: ID; contactIds: ID[]; agentId: ID; price: number
  checklist: Record<string, boolean>; dates: Record<string, string>; notaire: string; arpenteur: string; collabBroker: string
  lender: string; commissionPct: number; notes: string; status: 'ouvert' | 'conclu' | 'annule'; createdAt: string
  driveUrl?: string; driveFolderId?: string
  /** type de dossier, situation (condo, compagnie…) et statut de chaque document requis */ docType?: string; situation?: Record<string, boolean>; docs?: Record<string, DocStatus>; docsDue?: string; notices?: DocNotice[]
  /** fiche de suivi (numéros de dossiers, preuves, dates) */ fields?: Record<string, string>
  /** registre des offres et modifications */ offers?: Offer[]
}

export type Priority = 'basse' | 'normale' | 'haute'
export interface Task { id: ID; title: string; due: string; done: boolean; priority: Priority; assigneeId: ID; category: string; contactId: ID; listingId: ID; dealId: ID; notes: string }

export type EventType = 'rdv_vendeur' | 'rdv_acheteur' | 'visite' | 'visite_libre' | 'photo' | 'inspection' | 'notaire' | 'suivi' | 'autre'
export interface CalEvent { id: ID; title: string; start: string; end: string; type: EventType; location: string; contactId: ID; listingId: ID; agentId: ID; notes: string
  /** identifiant de l'événement dans Google Agenda, par utilisateur */ google?: Record<ID, string> }

export interface Showing { id: ID; listingId: ID; date: string; broker: string; brokerPhone: string; buyer: string; interest: 'faible' | 'moyen' | 'fort'; rating: number; priceOpinion: string; feedback: string; followUp: boolean }

export type PartnerCat = 'notaire' | 'arpenteur' | 'inspecteur' | 'hypothecaire' | 'photographe' | 'home_staging' | 'entrepreneur' | 'demenageur' | 'evaluateur' | 'avocat' | 'autre'
export interface Partner { id: ID; category: PartnerCat; name: string; company: string; phone: string; email: string; website: string; notes: string; rating: number }

export interface Platform { id: ID; name: string; url: string; category: string; account: string; notes: string; usage: string; key?: string }
export interface Template { id: ID; name: string; channel: 'courriel' | 'texto' | 'reseaux'; category: string; subject: string; body: string }
export interface Post { id: ID; date: string; platforms: string[]; format: 'publication' | 'reel' | 'story' | 'video' | 'infolettre'; caption: string; listingId: ID; status: 'idee' | 'planifie' | 'publie'; kind: string }
export interface Objection { id: ID; objection: string; response: string; category: string }
export interface Expense { id: ID; date: string; category: string; vendor: string; amount: number; memberId: ID; listingId: ID; notes: string }

// ---------- Visites terrain ----------
export interface MediaRef { id: ID; kind: 'video' | 'audio' | 'photo' | 'plan' | 'document'; mime: string; name: string; size: number; createdAt: string
  /** chemin serveur (mode connecté) */ path?: string
  /** clé IndexedDB (mode démo) */ local?: string
  /** image miniature (data URL) */ thumb?: string }
export interface Measure { id: ID; label: string; value: number; unit: 'pi' | 'm'; method: 'ar' | 'reference' | 'manuel' | 'vocal'; note: string }
export interface VisitRoom {
  id: ID; name: string; level: string; length: number; width: number; height: number; unit: 'pi' | 'm'
  floor: string; condition: '' | 'excellent' | 'bon' | 'moyen' | 'a_renover'; notes: string; likes: string; dislikes: string
  media: MediaRef[]; measures: Measure[]
}
export interface VoiceNote { id: ID; transcript: string; audio?: MediaRef; duration: number; createdAt: string; roomId: ID }
export interface PlanShape { id: ID; roomId: ID; label: string; x: number; y: number; w: number; h: number; kind: 'piece' | 'porte' | 'fenetre' | 'escalier' }
export interface FloorPlan { id: ID; level: string; shapes: PlanShape[]; image?: MediaRef; imageOpacity: number; imageScale: number }
export interface Visitor { id: ID; name: string; phone: string; email: string; broker: string; interest: 'faible' | 'moyen' | 'fort'; consent: boolean; notes: string }
export type VisitType = 'evaluation' | 'acheteur' | 'libre' | 'inspection' | 'photo'
export interface Visit {
  id: ID; type: VisitType; title: string; address: string; listingId: ID; contactIds: ID[]; agentId: ID
  date: string; startedAt: string; endedAt: string; status: 'planifiee' | 'en_cours' | 'terminee'
  rooms: VisitRoom[]; voiceNotes: VoiceNote[]; notes: string; plans: FloorPlan[]; answers: Record<string, string>
  visitors: Visitor[]; rating: number; interest: '' | 'faible' | 'moyen' | 'fort'; summary: string; photos: MediaRef[]; createdAt: string
  driveFolderId?: string; driveUrl?: string
}

export type DocStatus = 'inclus' | 'a_venir' | 'na' | 'manquant'
export interface DocNotice { id: ID; date: string; by: ID; to: ID; due: string; missing: string[]; kind: 'avis' | 'rappel' }
export type OfferKind = 'PA' | 'CP' | 'MO' | 'AS' | 'Annexe' | 'Avis'
export interface Offer { id: ID; kind: OfferKind; number: string; date: string; price: number; status: 'en_attente' | 'acceptee' | 'refusee' | 'contre_proposition' | 'expiree'; signedSeller: boolean; ackBuyer: boolean; proof: boolean; notes: string }

export interface DB {
  version: number
  agency: Agency
  currentUserId: ID
  members: Member[]; contacts: Contact[]; activities: Activity[]; listings: Listing[]; deals: Deal[]; tasks: Task[]
  events: CalEvent[]; showings: Showing[]; partners: Partner[]; platforms: Platform[]; templates: Template[]; posts: Post[]
  objections: Objection[]; expenses: Expense[]; visits: Visit[]
}
export type Coll = Exclude<keyof DB, 'version' | 'agency' | 'currentUserId'>
