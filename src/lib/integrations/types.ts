// Types partagés serveur / navigateur pour les connexions, les politiques et la synchronisation.
// Aucun secret ne transite par ces types.
import type { AccountMode, ConnectorKey } from './catalog'

export type Role = 'admin' | 'courtier' | 'adjointe' | 'marketing' | 'agent'
export const ALL_ROLES: Role[] = ['admin', 'courtier', 'adjointe', 'marketing', 'agent']

export type ConnectionStatus = 'connecte' | 'reconnexion' | 'erreur' | 'deconnecte' | 'en_attente'
export interface Connection {
  id: string; provider: ConnectorKey; mode: AccountMode
  /** propriétaire (membre) pour une connexion individuelle; auteur pour une connexion partagée */
  ownerId: string
  label: string; account: string
  services: string[]
  status: ConnectionStatus; statusDetail: string
  createdAt: string; updatedAt: string
  lastSyncAt: string; lastSuccessAt: string; lastError: string
  /** prochaine synchronisation permise (limitation de débit / reprise après erreur) */
  nextAllowedAt: string; failures: number
  /** curseurs incrémentaux par flux (jeton de synchro, horodatage…) */
  cursors: Record<string, string>
  /** webhooks / abonnements actifs chez le fournisseur */
  hooks: { id: string; kind: string; expiresAt: string }[]
  settings: Record<string, string | boolean | number>
  counts: Record<string, number>
}

export interface ProviderPolicy {
  enabled: boolean
  /** rôles qui voient l'application dans Plateformes */ visibleRoles: Role[]
  /** rôles qui peuvent la connecter et l'utiliser */ useRoles: Role[]
  accountModes: AccountMode[]
  /** fréquence de synchronisation en minutes (0 = manuelle / webhooks seulement) */ everyMin: number
  services: Record<string, boolean>
}
export type AutoAction = 'createContacts' | 'createEvents' | 'applyNonSensitive' | 'deleteCancelledEvents' | 'createFollowUpTasks' | 'importLeads'
export const AUTO_ACTIONS: Record<AutoAction, string> = {
  createContacts: 'Créer les nouveaux contacts importés',
  importLeads: 'Créer un prospect pour chaque demande entrante (Lead Ads, webhooks)',
  createEvents: 'Ajouter les rendez-vous importés au calendrier',
  applyNonSensitive: 'Appliquer automatiquement les changements ordinaires (non sensibles)',
  deleteCancelledEvents: 'Retirer les rendez-vous annulés à la source (si non modifiés dans ImmoPilot)',
  createFollowUpTasks: 'Créer les tâches de suivi (nouvelle demande, rendez-vous pris)',
}
export type AiCollection = 'contacts' | 'activities' | 'listings' | 'deals' | 'tasks' | 'events' | 'showings' | 'posts' | 'campaigns' | 'metrics' | 'finance' | 'communications'
export const AI_COLLECTIONS: Record<AiCollection, string> = {
  contacts: 'Contacts & prospects', activities: 'Historique des interactions', listings: 'Inscriptions', deals: 'Dossiers & transactions', tasks: 'Tâches',
  events: 'Rendez-vous & visites', showings: 'Rétroactions de visites', posts: 'Calendrier marketing', campaigns: 'Campagnes & publications', metrics: 'Statistiques externes',
  finance: 'Commissions, dépenses et montants', communications: 'Métadonnées de courriels (propriétaire seulement)',
}
export interface AgencyPolicy {
  providers: Partial<Record<ConnectorKey, ProviderPolicy>>
  auto: Record<AutoAction, boolean>
  ai: { enabled: boolean; roles: Role[]; collections: Record<AiCollection, boolean>; autoAnalyze: boolean; monthlyTokenBudget: number }
  /** fournisseurs dont les membres doivent se reconnecter (liste gérée par l'admin) */
  updatedAt: string; updatedBy: string
}

/** Référence de provenance d'une donnée importée. */
export interface SourceRef { p: string; c: string; x: string; at: string; url?: string }
export type Provenance = Record<string, { p: string; at: string }>

export interface ReviewItem {
  id: string; key: string; createdAt: string
  kind: 'conflit' | 'sensible' | 'doublon' | 'suppression' | 'incoherence'
  coll: string; entityId: string; entityLabel: string; field: string; fieldLabel: string
  current: unknown; currentSource: string; currentAt: string
  proposed: unknown; proposedSource: string; proposedAt: string
  connectionId: string; note: string
  /** pour un doublon : l'autre fiche (fusion possible) */ relatedId?: string
  status: 'ouvert' | 'accepte' | 'rejete'; resolvedBy?: string; resolvedAt?: string
}

export interface SyncJob { connectionId: string; provider: ConnectorKey; label: string; state: 'attente' | 'en_cours' | 'ok' | 'erreur' | 'ignore'; attempts: number; error?: string; stats?: JobStats; startedAt?: string; endedAt?: string }
export interface JobStats { fetched: number; created: number; updated: number; unchanged: number; review: number; deleted: number; tasks: number }
export interface SyncRun {
  id: string; trigger: 'manuel' | 'auto' | 'webhook' | 'import'; requestedBy: string; startedAt: string; endedAt: string
  state: 'en_cours' | 'termine' | 'partiel' | 'echec'
  jobs: SyncJob[]; aiSummary?: string; insights?: string[]
}
export interface SyncStatus {
  run: SyncRun | null; lastRun: SyncRun | null
  lastRefreshAt: string; toolsOk: number; toolsError: string[]; reviewsOpen: number
  connections: { id: string; provider: ConnectorKey; label: string; status: ConnectionStatus; lastSuccessAt: string; lastError: string }[]
}
