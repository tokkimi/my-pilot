// Contrat commun à tous les connecteurs.
import type { Connection } from '../../src/lib/integrations/types.js'
import type { AgencyPolicy } from '../../src/lib/integrations/types.js'
import type { ConnectorKey } from '../../src/lib/integrations/catalog.js'
import type { ConnectionSecret } from '../vault.js'
import type { ExtRecord } from '../sync/merge.js'

export interface SyncCtx {
  agencyId: string
  conn: Connection
  policy: AgencyPolicy
  /** services autorisés ET accordés pour cette connexion */ services: Set<string>
  deadline: number
  /** instantané (lecture seule) du document d'agence, ex. pour retrouver les dossiers Drive */
  doc: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** jeton d'accès valide (renouvelé au besoin) */ token(): Promise<string>
  secret(): Promise<ConnectionSecret>
  saveSecret(s: ConnectionSecret): Promise<void>
  cursor(k: string): string | undefined
  setCursor(k: string, v: string | undefined): void
  emit(r: ExtRecord | ExtRecord[]): void
  /** fuseau de l'agence pour convertir les heures */ tz: string
  timeLeft(): number
}
export interface SyncOutcome {
  /** travail restant (délai atteint) : le moteur reprendra au prochain passage, à partir des curseurs */ more?: boolean
  account?: string; counts?: Record<string, number>
  /** exécuté seulement APRÈS l'enregistrement réussi des données (ex. vider la boîte de réception) */ after?: () => Promise<void>
}

export interface OAuthConfig {
  authorizeUrl: string; tokenUrl: string; scopes: (services: string[]) => string[]
  clientId: () => string | undefined; clientSecret: () => string | undefined
  pkce?: boolean; scopeSep?: string
  /** paramètres supplémentaires de la page d'autorisation */ extraAuth?: Record<string, string>
  /** authentification du client au jeton : corps (défaut) ou en-tête Basic */ tokenAuth?: 'body' | 'basic'
  clientIdParam?: string
}

export interface ActionCtx { agencyId: string; conn: Connection; token(): Promise<string>; secret(): Promise<ConnectionSecret>; params: Record<string, unknown>; userId: string }
export interface ActionImpl {
  /** aperçu lisible présenté avant confirmation */ preview(ctx: ActionCtx): Promise<string>
  run(ctx: ActionCtx): Promise<{ summary: string; externalId?: string }>
}

export interface Connector {
  key: ConnectorKey
  oauth?: OAuthConfig
  /** après l'échange du code : compte, secret complémentaire (ex. centre de données Mailchimp) */
  afterAuth?(secret: ConnectionSecret): Promise<{ account: string; label?: string; secret?: ConnectionSecret; services?: string[] }>
  /** connexion par identifiants (clé API, URL privée) : vérifie puis retourne le compte */
  verifyCredentials?(secret: ConnectionSecret): Promise<{ account: string; label?: string }>
  sync(ctx: SyncCtx): Promise<SyncOutcome>
  revoke?(secret: ConnectionSecret): Promise<void>
  actions?: Record<string, ActionImpl>
  /** (ré)inscription des webhooks chez le fournisseur */
  registerHooks?(ctx: SyncCtx, publicUrl: string): Promise<Connection['hooks']>
}
