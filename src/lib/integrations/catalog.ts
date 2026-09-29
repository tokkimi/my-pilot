// Matrice des intégrations ImmoPilot — une entrée par application ou site de la rubrique Plateformes.
// Ce fichier est la source unique : il alimente l'écran Plateformes, l'administration, le serveur
// (connecteurs réellement disponibles) et la documentation docs/INTEGRATIONS.md (générée).
// Règle : seule une connexion réellement établie par un connecteur peut être affichée « Connecté ».

export type Method = 'oauth2' | 'cle_api' | 'ics' | 'webhook' | 'fichier' | 'lien'
/** État de l'implémentation dans ImmoPilot */
export type Impl =
  | 'connecteur'          // connecteur fonctionnel, utilisable dès que les clés plateforme sont configurées
  | 'connecteur_approbation' // code livré, mais le fournisseur exige une revue d'application / un accès approuvé
  | 'import'              // import de fichier (CSV) ou webhook entrant, aucun accès direct au compte
  | 'lien'                // lien et guide seulement (aucune API autorisée)
export type AccountMode = 'user' | 'agency'
export interface ActionDef { key: string; label: string; risk: 'confirmation' | 'simple'; detail: string }

export interface IntegrationDef {
  key: string; name: string; domain: string; url: string; category: string
  /** connecteur serveur qui gère la connexion (plusieurs fiches peuvent partager un connecteur, ex. Facebook + Instagram) */
  connector?: ConnectorKey
  /** services du connecteur utilisés par cette fiche */ services?: string[]
  method: Method[]
  access: string[]
  read: string[]; write: string[]; stats: string[]
  actions: ActionDef[]
  embed: { status: 'non' | 'a_tester' | 'oui'; note: string }
  automation: { status: 'api' | 'api_webhook' | 'import' | 'non'; note: string }
  impl: Impl; implNote: string
  blockers: string[]
  docs: string[]
  modes: AccountMode[]
  /** modules ImmoPilot alimentés */ modules: string[]
}

export type ConnectorKey = 'google' | 'microsoft' | 'mailchimp' | 'calendly' | 'meta' | 'linkedin' | 'tiktok' | 'canva' | 'crea' | 'ics' | 'webhook' | 'csv'

export interface ConnectorDef {
  key: ConnectorKey; name: string; auth: 'oauth2' | 'cle_api' | 'url_privee' | 'jeton_entrant' | 'fichier'
  modes: AccountMode[]; defaultEveryMin: number; webhooks: boolean
  /** variables d'environnement plateforme nécessaires */ env: string[]
  services: { key: string; label: string; scope?: string; sensitive?: boolean; approval?: string; defaultOn: boolean }[]
  refresh: string
}

export const CONNECTORS: Record<ConnectorKey, ConnectorDef> = {
  google: { key: 'google', name: 'Google Workspace', auth: 'oauth2', modes: ['user'], defaultEveryMin: 15, webhooks: true, env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    refresh: 'Jeton de renouvellement Google conservé chiffré; valide tant que l’utilisateur ne le révoque pas (7 jours seulement si l’application Google est en mode « Test »).',
    services: [
      { key: 'drive', label: 'Google Drive (fichiers créés/choisis dans ImmoPilot)', scope: 'https://www.googleapis.com/auth/drive.file', defaultOn: true },
      { key: 'calendar', label: 'Google Agenda (lecture et envoi d’événements)', scope: 'https://www.googleapis.com/auth/calendar.events', defaultOn: true },
      { key: 'contacts', label: 'Google Contacts (lecture)', scope: 'https://www.googleapis.com/auth/contacts.readonly', sensitive: true, defaultOn: false },
      { key: 'gmail', label: 'Gmail — en-têtes seulement (expéditeur, destinataire, objet, date)', scope: 'https://www.googleapis.com/auth/gmail.metadata', sensitive: true, approval: 'Portée « restreinte » : vérification Google + évaluation de sécurité (CASA) obligatoires au-delà de 100 utilisateurs.', defaultOn: false },
      { key: 'youtube', label: 'YouTube (statistiques de la chaîne)', scope: 'https://www.googleapis.com/auth/youtube.readonly', sensitive: true, defaultOn: false },
      { key: 'gbp', label: 'Google Business Profile (avis et note)', scope: 'https://www.googleapis.com/auth/business.manage', approval: 'Accès à l’API Business Profile sur demande (formulaire Google) — quota 0 tant que la demande n’est pas approuvée.', defaultOn: false },
    ] },
  microsoft: { key: 'microsoft', name: 'Microsoft 365 / Outlook', auth: 'oauth2', modes: ['user'], defaultEveryMin: 15, webhooks: true, env: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    refresh: 'Jeton de renouvellement (offline_access) conservé chiffré; durée glissante de 90 jours, renouvelée à chaque synchronisation.',
    services: [
      { key: 'calendar', label: 'Calendrier Outlook', scope: 'Calendars.ReadWrite', defaultOn: true },
      { key: 'contacts', label: 'Contacts Outlook (lecture)', scope: 'Contacts.Read', defaultOn: false },
      { key: 'mail', label: 'Courriels — métadonnées seulement (sans le contenu)', scope: 'Mail.ReadBasic', sensitive: true, defaultOn: false },
    ] },
  mailchimp: { key: 'mailchimp', name: 'Mailchimp', auth: 'oauth2', modes: ['agency', 'user'], defaultEveryMin: 360, webhooks: true, env: ['MAILCHIMP_CLIENT_ID', 'MAILCHIMP_CLIENT_SECRET'],
    refresh: 'Le jeton Mailchimp n’expire pas; il reste valide jusqu’à sa révocation dans Mailchimp.',
    services: [{ key: 'audience', label: 'Audiences et abonnés', defaultOn: true }, { key: 'campaigns', label: 'Campagnes et rapports', defaultOn: true }] },
  calendly: { key: 'calendly', name: 'Calendly', auth: 'oauth2', modes: ['user'], defaultEveryMin: 30, webhooks: true, env: ['CALENDLY_CLIENT_ID', 'CALENDLY_CLIENT_SECRET', 'CALENDLY_WEBHOOK_SIGNING_KEY'],
    refresh: 'Jeton de renouvellement Calendly conservé chiffré (jeton d’accès de 2 h renouvelé automatiquement).',
    services: [{ key: 'events', label: 'Rendez-vous planifiés et invités', defaultOn: true }] },
  meta: { key: 'meta', name: 'Meta (Facebook, Instagram, Lead Ads)', auth: 'oauth2', modes: ['agency', 'user'], defaultEveryMin: 60, webhooks: true, env: ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'],
    refresh: 'Jeton utilisateur longue durée (60 jours) échangé contre des jetons de Page sans expiration; reconnexion demandée si Meta les invalide (changement de mot de passe, retrait d’un rôle).',
    services: [
      { key: 'pages', label: 'Pages Facebook (abonnés, publications)', scope: 'pages_show_list,pages_read_engagement', approval: 'Revue d’application Meta + vérification d’entreprise.', defaultOn: true },
      { key: 'instagram', label: 'Instagram professionnel (abonnés, publications, statistiques)', scope: 'instagram_basic,instagram_manage_insights', approval: 'Revue d’application Meta.', defaultOn: true },
      { key: 'leads', label: 'Formulaires Lead Ads (demandes entrantes)', scope: 'leads_retrieval,pages_manage_metadata', approval: 'Revue d’application Meta.', defaultOn: true },
      { key: 'publish', label: 'Publier sur la Page (avec confirmation)', scope: 'pages_manage_posts', approval: 'Revue d’application Meta.', defaultOn: false },
    ] },
  linkedin: { key: 'linkedin', name: 'LinkedIn', auth: 'oauth2', modes: ['user'], defaultEveryMin: 1440, webhooks: false, env: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    refresh: 'Jeton de 60 jours; LinkedIn ne fournit des jetons de renouvellement qu’à ses partenaires approuvés → bouton « Reconnecter » tous les 60 jours.',
    services: [{ key: 'publish', label: 'Publier en votre nom (avec confirmation)', scope: 'openid profile w_member_social', defaultOn: true }] },
  tiktok: { key: 'tiktok', name: 'TikTok', auth: 'oauth2', modes: ['user'], defaultEveryMin: 720, webhooks: false, env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    refresh: 'Jeton d’accès de 24 h renouvelé automatiquement; jeton de renouvellement valide 365 jours.',
    services: [{ key: 'stats', label: 'Profil et statistiques des vidéos', scope: 'user.info.basic,user.info.stats,video.list', approval: 'Revue de l’application TikTok (Login Kit + Display API).', defaultOn: true }] },
  canva: { key: 'canva', name: 'Canva', auth: 'oauth2', modes: ['user'], defaultEveryMin: 1440, webhooks: false, env: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'],
    refresh: 'Jeton de renouvellement Canva (à usage unique, remplacé à chaque renouvellement) conservé chiffré.',
    services: [{ key: 'designs', label: 'Liste de vos designs (titres, liens, miniatures)', scope: 'design:meta:read profile:read', defaultOn: true }] },
  crea: { key: 'crea', name: 'CREA DDF® (Realtor.ca)', auth: 'cle_api', modes: ['agency', 'user'], defaultEveryMin: 360, webhooks: false, env: [],
    refresh: 'Identifiants DDF (client credentials) conservés chiffrés; jeton de 60 min obtenu à chaque synchronisation.',
    services: [{ key: 'listings', label: 'Inscriptions diffusées (prix, statut, superficie, lien)', defaultOn: true }] },
  ics: { key: 'ics', name: 'Abonnement d’agenda (.ics)', auth: 'url_privee', modes: ['user', 'agency'], defaultEveryMin: 60, webhooks: false, env: [],
    refresh: 'L’adresse privée de l’agenda est conservée chiffrée; elle fonctionne tant que le service ne la régénère pas.',
    services: [{ key: 'events', label: 'Événements (lecture seule)', defaultOn: true }] },
  webhook: { key: 'webhook', name: 'Webhook entrant (Zapier, Make, Apify, eZsign…)', auth: 'jeton_entrant', modes: ['agency'], defaultEveryMin: 0, webhooks: true, env: [],
    refresh: 'Adresse secrète propre à l’agence; peut être régénérée à tout moment.',
    services: [{ key: 'inbound', label: 'Contacts, demandes, rendez-vous, tâches, inscriptions, événements', defaultOn: true }] },
  csv: { key: 'csv', name: 'Import de fichier (CSV)', auth: 'fichier', modes: ['user', 'agency'], defaultEveryMin: 0, webhooks: false, env: [],
    refresh: 'Aucune connexion permanente : chaque import est rapproché sans créer de doublons.',
    services: [{ key: 'import', label: 'Contacts / inscriptions / dépenses exportés d’un autre outil', defaultOn: true }] },
}

const L = (text: string): IntegrationDef['embed'] => ({ status: 'a_tester', note: text })
const NOEMBED = 'Affichage intégré généralement interdit par le site (X-Frame-Options / CSP) — à confirmer avec le test intégré; ouverture dans une fenêtre à côté d’ImmoPilot.'
const LOGIN_NOEMBED = 'Pages de connexion : les fournisseurs interdisent l’affichage dans un cadre (anti-hameçonnage). Ouverture dans une fenêtre à côté.'

export const INTEGRATIONS: IntegrationDef[] = [
  // ---------- Inscriptions, transactions & données ----------
  { key: 'centris', name: 'Centris', domain: 'centris.ca', url: 'https://www.centris.ca', category: 'Inscriptions & transactions', method: ['lien', 'fichier'],
    access: ['Compte courtier Centris (Matrix)'], read: ['Aucune lecture automatique autorisée pour un logiciel tiers'], write: [], stats: [],
    actions: [], embed: L(NOEMBED), automation: { status: 'non', note: 'Aucune API publique; l’automatisation du site (robot) est interdite par les conditions d’utilisation. Les listings des courtiers sont diffusés à des tiers seulement par entente de diffusion.' },
    impl: 'lien', implNote: 'Fiche d’inscription préparée dans ImmoPilot (saisie rapide), numéro Centris enregistré; les données Centris diffusées sur Realtor.ca peuvent être lues par le connecteur CREA DDF.',
    blockers: ['Aucune API Centris ouverte aux logiciels tiers; accès aux données seulement par entente de diffusion (Centris / chambre immobilière).', 'Robot de navigation interdit par les conditions d’utilisation.'],
    docs: ['https://www.centris.ca/fr/conditions-utilisation'], modes: [], modules: ['Inscriptions'] },
  { key: 'rechat', name: 'Rechat', domain: 'rechat.com', url: 'https://app.rechat.com/', category: 'Inscriptions & transactions', connector: 'csv', method: ['fichier', 'lien'],
    access: ['Compte Rechat fourni par la bannière (SSO)'], read: ['Contacts exportés (CSV)'], write: [], stats: [], actions: [],
    embed: L(LOGIN_NOEMBED), automation: { status: 'import', note: 'API réservée aux partenaires/bannières; export CSV des contacts disponible dans Rechat People.' },
    impl: 'import', implNote: 'Import CSV rapproché (sans doublons) dans Contacts.', blockers: ['API Rechat réservée aux partenaires : demande à faire par la bannière.'],
    docs: ['https://rechat.ai/'], modes: ['user', 'agency'], modules: ['Contacts'] },
  { key: 'nexone', name: 'NexOne Office', domain: 'nexone.ca', url: 'https://office.nexone.ca/apex/f?p=100:101', category: 'Inscriptions & transactions', connector: 'csv', method: ['lien', 'fichier'],
    access: ['Compte NexOne de l’agence'], read: ['Exports CSV (transactions, déboursés) si activés par l’agence'], write: [], stats: [], actions: [],
    embed: L(LOGIN_NOEMBED), automation: { status: 'import', note: 'Pas d’API publique documentée; intégrations sur entente avec NexOne.' },
    impl: 'import', implNote: 'Import CSV des dépenses/transactions; le dossier ImmoPilot fournit les données à reporter.', blockers: ['Entente partenaire NexOne nécessaire pour une synchronisation directe.'],
    docs: ['https://nexone.ca/fr/'], modes: ['agency'], modules: ['Dossiers', 'Comptabilité'] },
  { key: 'ezsign', name: 'eZsign / eZmax', domain: 'ezmax.ca', url: 'https://www.ezmax.ca/fr/courtiers/signature-electronique', category: 'Inscriptions & transactions', connector: 'webhook', method: ['webhook', 'lien'],
    access: ['Compte eZmax; accès API remis par eZmax', 'Webhook configuré dans la console d’administration eZmax'], read: ['Événements de signature reçus par webhook (ex. document complété) avec leur date'], write: [], stats: ['Nombre de signatures complétées'],
    actions: [{ key: 'send', label: 'Envoyer pour signature', risk: 'confirmation', detail: 'Non disponible sans accès API eZmax (voir blocage).' }],
    embed: L(LOGIN_NOEMBED), automation: { status: 'api_webhook', note: 'API REST officielle + webhooks (spécification publique sur GitHub eZmaxinc); identifiants API délivrés par eZmax.' },
    impl: 'import', implNote: 'Réception des webhooks eZsign par l’adresse entrante de l’agence (journalisés dans l’activité du dossier). Envoi pour signature : à brancher dès qu’eZmax délivre les identifiants API.',
    blockers: ['Identifiants API eZmax à demander (support eZmax) avant de pouvoir lire/envoyer des dossiers de signature.'],
    docs: ['https://github.com/eZmaxinc/eZmax-API', 'https://ezmaxinc.github.io/eZmax-API/'], modes: ['agency'], modules: ['Dossiers', 'Conformité'] },
  { key: 'immocontact', name: 'Immocontact', domain: 'immocontact.com', url: 'https://immocontact.com/', category: 'Inscriptions & transactions', connector: 'ics', method: ['ics', 'lien'],
    access: ['Compte Immocontact'], read: ['Visites via un abonnement d’agenda (.ics) si votre compte en fournit un'], write: [], stats: [], actions: [],
    embed: L(LOGIN_NOEMBED), automation: { status: 'import', note: 'Pas d’API publique documentée.' },
    impl: 'import', implNote: 'Si Immocontact synchronise vos visites avec Google/Outlook, elles arrivent par ces connecteurs; sinon lien + guide.', blockers: ['Aucune API publique; demander à Immocontact un flux d’agenda ou une API.'],
    docs: ['https://immocontact.com/faq'], modes: ['user'], modules: ['Calendrier', 'Visites'] },
  { key: 'jlr', name: 'JLR', domain: 'jlr.ca', url: 'https://www.jlr.ca/me-connecter', category: 'Inscriptions & transactions', method: ['lien'],
    access: ['Abonnement JLR'], read: [], write: [], stats: [], actions: [], embed: L(LOGIN_NOEMBED),
    automation: { status: 'non', note: 'Données sous licence; API commerciale seulement (entente JLR/Equifax). Extraction automatisée interdite.' },
    impl: 'lien', implNote: 'Lien + guide; les comparables sont notés dans l’inscription.', blockers: ['Licence de données commerciale JLR requise pour une API.'], docs: ['https://solutions.jlr.ca/fr/courtier-immobilier'], modes: [], modules: ['Inscriptions'] },
  { key: 'registre', name: 'Registre foncier du Québec', domain: 'registrefoncier.gouv.qc.ca', url: 'https://www.registrefoncier.gouv.qc.ca/Sirf/', category: 'Inscriptions & transactions', method: ['lien'],
    access: ['Compte client (consultation payante)'], read: [], write: [], stats: [], actions: [], embed: L(NOEMBED),
    automation: { status: 'non', note: 'Service gouvernemental payant sans API; automatisation non autorisée.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Aucune API.'], docs: ['https://www.registrefoncier.gouv.qc.ca/'], modes: [], modules: ['Dossiers'] },
  { key: 'oaciq', name: 'OACIQ', domain: 'oaciq.com', url: 'https://www.oaciq.com', category: 'Inscriptions & transactions', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [],
    embed: L(NOEMBED), automation: { status: 'non', note: 'Site d’information public.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: [], docs: ['https://www.oaciq.com'], modes: [], modules: ['SOP'] },
  { key: 'apciq', name: 'APCIQ', domain: 'apciq.ca', url: 'https://apciq.ca/', category: 'Inscriptions & transactions', method: ['lien'], access: [], read: [], write: [], stats: ['Statistiques de marché publiées (consultation)'], actions: [],
    embed: L(NOEMBED), automation: { status: 'non', note: 'Statistiques publiées en ligne/PDF, sans API.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: [], docs: ['https://apciq.ca/'], modes: [], modules: ['Statistiques'] },
  { key: 'realtor', name: 'Realtor.ca (CREA DDF®)', domain: 'realtor.ca', url: 'https://www.realtor.ca', category: 'Diffusion', connector: 'crea', method: ['cle_api'],
    access: ['Membre ACI/CREA', 'Flux DDF® créé dans le portail CREA (identifiants client)'], read: ['Vos inscriptions diffusées : numéro MLS®/Centris, adresse, prix, statut, chambres, salles de bain, superficie, lien Realtor.ca'], write: [],
    stats: ['Inscriptions diffusées', 'Changements de prix/statut'], actions: [], embed: L(NOEMBED),
    automation: { status: 'api', note: 'API officielle DDF® (OData) pour les membres, en lecture seule.' },
    impl: 'connecteur', implNote: 'Synchronisation des inscriptions (rapprochées par numéro MLS®/Centris puis par adresse); prix et superficie → « À vérifier » en cas d’écart.',
    blockers: ['Chaque agence/courtier doit créer son flux DDF® et saisir ses identifiants dans ImmoPilot.'], docs: ['https://www.crea.ca/technology/data-distribution-facility/', 'https://ddfapi-docs.realtor.ca/'], modes: ['agency', 'user'], modules: ['Inscriptions', 'Statistiques'] },
  { key: 'properstar', name: 'Properstar', domain: 'properstar.ca', url: 'https://www.properstar.ca/', category: 'Diffusion', method: ['lien'], access: ['Espace professionnel'], read: [], write: [], stats: [], actions: [],
    embed: L(NOEMBED), automation: { status: 'non', note: 'Diffusion par flux partenaires (XML), pas d’API de lecture pour les courtiers.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Flux réservés aux partenaires de diffusion.'], docs: ['https://www.properstar.ca/'], modes: [], modules: ['Marketing'] },
  { key: 'duproprio', name: 'DuProprio', domain: 'duproprio.com', url: 'https://duproprio.com', category: 'Prospection', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [],
    embed: L(NOEMBED), automation: { status: 'non', note: 'Aucune API; l’extraction automatisée (y compris via Apify) est interdite par les conditions d’utilisation.' }, impl: 'lien', implNote: 'Lien + guide; source « DuProprio » dans les contacts.', blockers: ['Conditions d’utilisation interdisant le moissonnage.'], docs: ['https://duproprio.com/fr/conditions-utilisation'], modes: [], modules: ['Contacts'] },
  { key: 'prospects', name: 'Prospects (CRM)', domain: 'prospects.com', url: 'https://qc.prospects.com/prospects/logon.do', category: 'Prospection', connector: 'csv', method: ['fichier', 'lien'],
    access: ['Compte Prospects'], read: ['Contacts exportés (CSV)'], write: [], stats: [], actions: [], embed: L(LOGIN_NOEMBED),
    automation: { status: 'import', note: 'Pas d’API publique pour les tiers; export CSV.' }, impl: 'import', implNote: 'Import CSV rapproché (courriel, téléphone) sans doublons.', blockers: ['API non offerte aux tiers.'], docs: ['https://www.prospects.com/fr/ca/a-propos/'], modes: ['user', 'agency'], modules: ['Contacts'] },
  { key: 'monprospecteur', name: 'Mon Prospecteur', domain: 'monprospecteur.com', url: 'https://www.monprospecteur.com/', category: 'Prospection', connector: 'csv', method: ['fichier', 'lien'],
    access: ['Abonnement'], read: ['Listes d’opportunités exportées (CSV)'], write: [], stats: [], actions: [], embed: L(LOGIN_NOEMBED),
    automation: { status: 'import', note: 'Export CSV.' }, impl: 'import', implNote: 'Import CSV dans Contacts (source Mon Prospecteur).', blockers: [], docs: ['https://www.monprospecteur.com/'], modes: ['user', 'agency'], modules: ['Contacts'] },

  // ---------- Marketing ----------
  { key: 'activepipe', name: 'ActivePipe', domain: 'activepipe.com', url: 'https://auth.activepipe.com/sso/openid/google', category: 'Marketing', connector: 'csv', method: ['fichier', 'webhook', 'lien'],
    access: ['Compte ActivePipe'], read: ['Contacts « chauds » exportés (CSV) ou poussés par Zapier'], write: [], stats: [], actions: [], embed: L(LOGIN_NOEMBED),
    automation: { status: 'import', note: 'API réservée aux intégrations CRM partenaires.' }, impl: 'import', implNote: 'Import CSV / webhook entrant.', blockers: ['API partenaire ActivePipe.'], docs: ['https://activepipe.com/'], modes: ['user', 'agency'], modules: ['Contacts', 'Marketing'] },
  { key: 'mailchimp', name: 'Mailchimp', domain: 'mailchimp.com', url: 'https://login.mailchimp.com', category: 'Marketing', connector: 'mailchimp', method: ['oauth2', 'webhook'],
    access: ['Compte Mailchimp (connexion OAuth)'], read: ['Audiences, abonnés (courriel, nom, statut)', 'Campagnes envoyées'], write: ['Ajout d’un contact ImmoPilot à une audience (double confirmation d’abonnement)'],
    stats: ['Taux d’ouverture', 'Taux de clics', 'Désabonnements', 'Taille des audiences'],
    actions: [{ key: 'addMember', label: 'Ajouter un contact à l’audience', risk: 'confirmation', detail: 'Envoie une demande de confirmation d’abonnement (LCAP).' }, { key: 'sendCampaign', label: 'Envoyer une campagne prête', risk: 'confirmation', detail: 'Envoi irréversible.' }],
    embed: L(LOGIN_NOEMBED), automation: { status: 'api_webhook', note: 'API Marketing v3 + webhooks d’audience.' }, impl: 'connecteur', implNote: 'Connecteur OAuth complet.', blockers: [], docs: ['https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/', 'https://mailchimp.com/developer/marketing/api/'], modes: ['agency', 'user'], modules: ['Contacts', 'Marketing', 'Statistiques'] },
  { key: 'canva', name: 'Canva', domain: 'canva.com', url: 'https://www.canva.com/fr_fr/', category: 'Marketing', connector: 'canva', method: ['oauth2'],
    access: ['Compte Canva (OAuth Canva Connect)'], read: ['Designs : titre, miniature, liens de modification et d’affichage, dates'], write: [], stats: ['Designs créés/modifiés'], actions: [],
    embed: L('Canva interdit l’affichage de son éditeur dans un cadre hors de son SDK (Apps SDK); ouverture du design dans une fenêtre à côté.'), automation: { status: 'api', note: 'API Canva Connect (OAuth + PKCE).' },
    impl: 'connecteur_approbation', implNote: 'Connecteur fonctionnel pour l’équipe qui a créé l’intégration; ouverture publique après revue Canva.', blockers: ['Revue Canva requise pour une intégration « publique » (utilisable par d’autres équipes Canva).'], docs: ['https://www.canva.dev/docs/connect/'], modes: ['user'], modules: ['Marketing'] },
  { key: 'artlist', name: 'Artlist.io', domain: 'artlist.io', url: 'https://artlist.io', category: 'Marketing', method: ['lien'], access: ['Abonnement'], read: [], write: [], stats: [], actions: [], embed: L(NOEMBED), automation: { status: 'non', note: 'Aucune API publique.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Aucune API.'], docs: ['https://artlist.io'], modes: [], modules: ['Marketing'] },
  { key: 'fiverr', name: 'Fiverr', domain: 'fiverr.com', url: 'https://www.fiverr.com', category: 'Marketing', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [], embed: L(NOEMBED), automation: { status: 'non', note: 'Pas d’API acheteur publique.' }, impl: 'lien', implNote: 'Lien + guide; dépenses saisies en comptabilité.', blockers: ['Aucune API acheteur.'], docs: ['https://www.fiverr.com'], modes: [], modules: ['Comptabilité'] },
  { key: 'vistaprint', name: 'Vistaprint', domain: 'vistaprint.ca', url: 'https://www.vistaprint.ca', category: 'Marketing', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [], embed: L(NOEMBED), automation: { status: 'non', note: 'Pas d’API client publique.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Aucune API.'], docs: ['https://www.vistaprint.ca'], modes: [], modules: ['Comptabilité'] },
  { key: 'napart', name: 'Nap-Art', domain: 'nap-art.com', url: 'https://www.nap-art.com/', category: 'Marketing', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [], embed: L(NOEMBED), automation: { status: 'non', note: 'Aucune API.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Aucune API.'], docs: ['https://www.nap-art.com/'], modes: [], modules: ['Comptabilité'] },
  { key: 'pancarte', name: 'Pancarte Express', domain: 'pancarteexpress.com', url: 'https://pancarteexpress.com/mon-compte/', category: 'Marketing', method: ['lien'], access: ['Compte client'], read: [], write: [], stats: [], actions: [], embed: L(LOGIN_NOEMBED), automation: { status: 'non', note: 'Aucune API; commandes sur le site.' }, impl: 'lien', implNote: 'Étape suivie dans le processus vendeur.', blockers: ['Aucune API.'], docs: ['https://pancarteexpress.com/'], modes: [], modules: ['Dossiers'] },

  // ---------- Réseaux sociaux ----------
  { key: 'facebook', name: 'Facebook', domain: 'facebook.com', url: 'https://www.facebook.com', category: 'Réseaux sociaux', connector: 'meta', services: ['pages', 'leads', 'publish'], method: ['oauth2', 'webhook'],
    access: ['Rôle administrateur de la Page', 'Application Meta approuvée (revue)'], read: ['Pages gérées, abonnés', 'Demandes Lead Ads (nom, courriel, téléphone, formulaire, date)'], write: ['Publication sur la Page (confirmation)'],
    stats: ['Abonnés de la Page', 'Nouvelles demandes Lead Ads'], actions: [{ key: 'publishPage', label: 'Publier sur la Page', risk: 'confirmation', detail: 'Publication publique.' }],
    embed: L(NOEMBED), automation: { status: 'api_webhook', note: 'API Graph + webhook « leadgen ».' }, impl: 'connecteur_approbation', implNote: 'Code complet; utilisable par les comptes de test de l’application jusqu’à l’approbation Meta.', blockers: ['Revue d’application Meta (leads_retrieval, pages_read_engagement, pages_manage_posts) et vérification d’entreprise.'],
    docs: ['https://developers.facebook.com/docs/graph-api', 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving'], modes: ['agency', 'user'], modules: ['Contacts', 'Marketing', 'Statistiques'] },
  { key: 'instagram', name: 'Instagram', domain: 'instagram.com', url: 'https://www.instagram.com', category: 'Réseaux sociaux', connector: 'meta', services: ['instagram'], method: ['oauth2'],
    access: ['Compte Instagram professionnel relié à une Page Facebook'], read: ['Publications (légende, date, lien)'], write: [], stats: ['Abonnés', 'J’aime et commentaires par publication'], actions: [],
    embed: L(NOEMBED), automation: { status: 'api', note: 'Instagram Graph API (comptes professionnels seulement).' }, impl: 'connecteur_approbation', implNote: 'Même connexion que Facebook.', blockers: ['Revue d’application Meta.'], docs: ['https://developers.facebook.com/docs/instagram-platform'], modes: ['agency', 'user'], modules: ['Marketing', 'Statistiques'] },
  { key: 'tiktok', name: 'TikTok', domain: 'tiktok.com', url: 'https://www.tiktok.com', category: 'Réseaux sociaux', connector: 'tiktok', method: ['oauth2'],
    access: ['Compte TikTok'], read: ['Vidéos : titre, date, lien'], write: [], stats: ['Abonnés', 'Vues, j’aime, commentaires, partages'], actions: [],
    embed: L(NOEMBED), automation: { status: 'api', note: 'Login Kit + Display API.' }, impl: 'connecteur_approbation', implNote: 'Code complet; approbation TikTok requise pour les comptes hors bac à sable.', blockers: ['Revue de l’application TikTok; la publication (Content Posting API) exige un audit distinct, non activée.'], docs: ['https://developers.tiktok.com/doc/display-api-overview'], modes: ['user'], modules: ['Marketing', 'Statistiques'] },
  { key: 'linkedin', name: 'LinkedIn', domain: 'linkedin.com', url: 'https://www.linkedin.com', category: 'Réseaux sociaux', connector: 'linkedin', method: ['oauth2'],
    access: ['Compte LinkedIn'], read: ['Profil de base (nom)'], write: ['Publication en votre nom (confirmation)'], stats: [], actions: [{ key: 'publish', label: 'Publier sur LinkedIn', risk: 'confirmation', detail: 'Publication publique.' }],
    embed: L(NOEMBED), automation: { status: 'api', note: '« Share on LinkedIn » en libre-service; statistiques via Community Management API (partenaires).' }, impl: 'connecteur', implNote: 'Publication avec confirmation; pas de statistiques.', blockers: ['Statistiques et pages entreprise : programme partenaire LinkedIn.', 'Pas de jeton de renouvellement → reconnexion tous les 60 jours.'], docs: ['https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/share-on-linkedin'], modes: ['user'], modules: ['Marketing'] },
  { key: 'youtube', name: 'YouTube', domain: 'youtube.com', url: 'https://studio.youtube.com', category: 'Réseaux sociaux', connector: 'google', services: ['youtube'], method: ['oauth2'],
    access: ['Compte Google propriétaire de la chaîne'], read: ['Chaîne'], write: [], stats: ['Abonnés', 'Vues totales', 'Nombre de vidéos'], actions: [],
    embed: L('Les vidéos publiques s’intègrent (lecteur YouTube); YouTube Studio ne s’affiche pas dans un cadre.'), automation: { status: 'api', note: 'YouTube Data API v3.' }, impl: 'connecteur', implNote: 'Service optionnel de la connexion Google.', blockers: ['Portée sensible : vérification de l’application Google.'], docs: ['https://developers.google.com/youtube/v3'], modes: ['user'], modules: ['Statistiques'] },
  { key: 'gbp', name: 'Google Business Profile', domain: 'google.com', url: 'https://business.google.com', category: 'Réseaux sociaux', connector: 'google', services: ['gbp'], method: ['oauth2'],
    access: ['Propriétaire/gestionnaire de la fiche', 'Accès API Business Profile approuvé'], read: ['Avis (note, commentaire, date)'], write: [], stats: ['Note moyenne', 'Nombre d’avis'], actions: [],
    embed: L(NOEMBED), automation: { status: 'api', note: 'Business Profile APIs.' }, impl: 'connecteur_approbation', implNote: 'Service optionnel de la connexion Google.', blockers: ['Demande d’accès API Business Profile (quota à 0 avant approbation).'], docs: ['https://developers.google.com/my-business/content/prereqs'], modes: ['user'], modules: ['Statistiques'] },

  // ---------- Communication & administration ----------
  { key: 'google', name: 'Google Drive & Agenda', domain: 'drive.google.com', url: 'https://drive.google.com', category: 'Communication & administration', connector: 'google', services: ['drive', 'calendar', 'contacts'], method: ['oauth2', 'webhook'],
    access: ['Compte Google de l’utilisateur', 'Autorisation de l’administrateur de l’agence'], read: ['Événements d’agenda (fenêtre −30/+180 jours)', 'Fichiers des dossiers Drive créés par ImmoPilot', 'Contacts Google (optionnel)'],
    write: ['Création de dossiers Drive et téléversements', 'Envoi/mise à jour d’événements dans Google Agenda'], stats: ['Rendez-vous à venir', 'Documents par dossier'],
    actions: [{ key: 'pushEvents', label: 'Envoyer mes événements vers Google Agenda', risk: 'simple', detail: 'Crée ou met à jour les événements ImmoPilot dans votre agenda principal.' }],
    embed: L('Google Drive/Agenda refusent l’affichage dans un cadre; les fichiers s’ouvrent dans un nouvel onglet, le sélecteur Google s’affiche dans ImmoPilot.'), automation: { status: 'api_webhook', note: 'Drive API, Calendar API (synchronisation incrémentale + notifications push), People API.' },
    impl: 'connecteur', implNote: 'Intégration existante conservée (jetons chiffrés, autorisations par l’admin) et branchée au moteur de synchronisation.', blockers: ['Portées sensibles (Contacts) : vérification Google avant la mise en production publique.'],
    docs: ['https://developers.google.com/calendar/api/guides/sync', 'https://developers.google.com/drive/api/guides/about-auth'], modes: ['user'], modules: ['Calendrier', 'Documents', 'Contacts'] },
  { key: 'gmail', name: 'Gmail (équipe)', domain: 'gmail.com', url: 'https://mail.google.com', category: 'Communication & administration', connector: 'google', services: ['gmail'], method: ['oauth2'],
    access: ['Compte Google', 'Portée gmail.metadata (restreinte)'], read: ['En-têtes des courriels échangés avec VOS contacts (sans le contenu)'], write: [], stats: ['Échanges par contact'], actions: [],
    embed: L(NOEMBED), automation: { status: 'api', note: 'Gmail API (historique incrémental).' }, impl: 'connecteur_approbation', implNote: 'Désactivé par défaut; les échanges restent privés à leur propriétaire.', blockers: ['Portée restreinte : vérification Google + évaluation CASA annuelle au-delà de 100 utilisateurs.'],
    docs: ['https://developers.google.com/gmail/api/auth/scopes'], modes: ['user'], modules: ['Contacts (historique)'] },
  { key: 'outlook', name: 'Outlook / Microsoft 365', domain: 'outlook.com', url: 'https://outlook.office.com', category: 'Communication & administration', connector: 'microsoft', method: ['oauth2', 'webhook'],
    access: ['Compte Microsoft (professionnel ou personnel)', 'Consentement de l’administrateur Microsoft 365 si l’organisation l’exige'], read: ['Calendrier', 'Contacts (optionnel)', 'Métadonnées des courriels avec vos contacts (optionnel)'], write: ['Événements du calendrier'], stats: ['Rendez-vous à venir', 'Échanges par contact'], actions: [],
    embed: L(NOEMBED), automation: { status: 'api_webhook', note: 'Microsoft Graph (requêtes delta + abonnements de notification).' }, impl: 'connecteur', implNote: 'Connecteur OAuth complet.', blockers: ['Certaines organisations exigent le consentement de leur administrateur Microsoft 365.'], docs: ['https://learn.microsoft.com/graph/delta-query-overview'], modes: ['user'], modules: ['Calendrier', 'Contacts'] },
  { key: 'calendly', name: 'Calendly', domain: 'calendly.com', url: 'https://calendly.com', category: 'Communication & administration', connector: 'calendly', method: ['oauth2', 'webhook'],
    access: ['Compte Calendly (webhooks : forfait payant)'], read: ['Rendez-vous planifiés, invités (nom, courriel, réponses)', 'Annulations'], write: [], stats: ['Rendez-vous pris par semaine'],
    actions: [{ key: 'cancel', label: 'Annuler un rendez-vous', risk: 'confirmation', detail: 'L’invité est avisé par Calendly.' }],
    embed: L('Les pages de réservation publiques s’intègrent (widget officiel); le tableau de bord Calendly non.'), automation: { status: 'api_webhook', note: 'API v2 + webhooks signés.' }, impl: 'connecteur', implNote: 'Connecteur OAuth complet; webhooks si le forfait le permet, sinon vérification périodique.', blockers: ['Webhooks réservés aux forfaits payants Calendly.'], docs: ['https://developer.calendly.com/'], modes: ['user'], modules: ['Calendrier', 'Contacts'] },
  { key: 'icloud', name: 'iCloud (tél. marketing)', domain: 'icloud.com', url: 'https://www.icloud.com', category: 'Communication & administration', connector: 'ics', method: ['ics', 'lien'],
    access: ['Calendrier iCloud partagé en « Calendrier public » (adresse webcal)'], read: ['Événements du calendrier partagé'], write: [], stats: [], actions: [],
    embed: L(NOEMBED), automation: { status: 'import', note: 'Photos iCloud : aucune API; calendrier : lien public .ics. CalDAV exigerait un mot de passe d’application → non retenu.' }, impl: 'import', implNote: 'Abonnement .ics (lecture seule).', blockers: ['Pas d’API Photos; CalDAV = mot de passe d’application (refusé par principe).'], docs: ['https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud'], modes: ['user'], modules: ['Calendrier'] },
  { key: 'godaddy', name: 'GoDaddy', domain: 'godaddy.com', url: 'https://www.godaddy.com', category: 'Communication & administration', method: ['lien'], access: [], read: [], write: [], stats: [], actions: [],
    embed: L(NOEMBED), automation: { status: 'non', note: 'API Domaines réservée aux comptes à fort volume depuis 2024.' }, impl: 'lien', implNote: 'Lien + guide.', blockers: ['Accès API restreint par GoDaddy.'], docs: ['https://developer.godaddy.com/'], modes: [], modules: [] },
  { key: 'paies', name: 'Paies — gestion externe', domain: '', url: '', category: 'Communication & administration', connector: 'csv', method: ['fichier'], access: [], read: [], write: [], stats: [], actions: [],
    embed: { status: 'non', note: 'Service externe sans site.' }, automation: { status: 'import', note: 'Export CSV des dépenses depuis ImmoPilot.' }, impl: 'import', implNote: 'Export/Import CSV.', blockers: [], docs: [], modes: ['agency'], modules: ['Comptabilité'] },
  { key: 'chatgpt', name: 'ChatGPT → Assistant IA ImmoPilot', domain: 'openai.com', url: 'https://chatgpt.com', category: 'Communication & administration', method: ['lien'],
    access: ['Aucun compte ChatGPT requis : l’IA passe par l’API OpenAI configurée côté serveur par la plateforme'], read: ['Données de l’agence autorisées par l’administrateur (avec source et date)'], write: ['Propositions (tâches, résumés) validées par un humain'], stats: [], actions: [],
    embed: L('ChatGPT ne s’affiche pas dans un cadre; l’assistant est intégré directement dans ImmoPilot.'), automation: { status: 'api', note: 'OpenAI ne propose pas (sept. 2026) de connexion « Se connecter avec ChatGPT » pour les applications tierces; un abonnement ChatGPT ne donne pas accès à l’API.' },
    impl: 'connecteur', implNote: 'Assistant IA intégré (API OpenAI plateforme, OPENAI_API_KEY côté serveur).', blockers: [], docs: ['https://platform.openai.com/docs/api-reference/responses'], modes: [], modules: ['Assistant IA'] },
  { key: 'streetview', name: 'Google Street View', domain: 'maps.google.com', url: 'https://www.google.com/maps', category: 'Communication & administration', method: ['cle_api'],
    access: ['Clé Maps Embed API (plateforme)'], read: [], write: [], stats: [], actions: [],
    embed: { status: 'oui', note: 'Maps Embed API conçue pour l’affichage intégré : carte et vue satellite directement dans la fiche d’inscription (Street View s’ouvre par lien, le mode intégré exigeant des coordonnées).' }, automation: { status: 'non', note: 'Affichage seulement.' }, impl: 'connecteur', implNote: 'Carte et vue satellite intégrées si GOOGLE_MAPS_EMBED_KEY est configurée; Street View par lien.', blockers: [], docs: ['https://developers.google.com/maps/documentation/embed/get-started'], modes: [], modules: ['Inscriptions'] },

  // ---------- Connecteurs génériques ----------
  { key: 'ics', name: 'Autre agenda (.ics)', domain: '', url: '', category: 'Connecteurs génériques', connector: 'ics', method: ['ics'],
    access: ['Adresse privée d’abonnement .ics / webcal fournie par le service'], read: ['Événements (lecture seule)'], write: [], stats: [], actions: [], embed: { status: 'non', note: 'Flux de données.' },
    automation: { status: 'import', note: 'Vérification périodique; suppression détectée quand un événement disparaît du flux.' }, impl: 'connecteur', implNote: 'Connecteur fonctionnel.', blockers: [], docs: ['https://www.rfc-editor.org/rfc/rfc5545'], modes: ['user', 'agency'], modules: ['Calendrier'] },
  { key: 'webhook', name: 'Webhook entrant (Zapier, Make, Apify…)', domain: '', url: '', category: 'Connecteurs génériques', connector: 'webhook', method: ['webhook'],
    access: ['Adresse secrète de l’agence (générée par l’administrateur)'], read: ['Contacts, demandes, rendez-vous, tâches, inscriptions, événements externes'], write: [], stats: [], actions: [], embed: { status: 'non', note: 'Flux de données.' },
    automation: { status: 'api_webhook', note: 'Tout outil autorisé (Zapier, Make, un acteur Apify que vous avez le droit d’exécuter, eZsign…) peut envoyer ses données; aucune « magie » : chaque scénario se configure dans l’outil source.' },
    impl: 'connecteur', implNote: 'Connecteur fonctionnel avec rapprochement et anti-doublons.', blockers: [], docs: [], modes: ['agency'], modules: ['Contacts', 'Calendrier', 'Tâches', 'Inscriptions'] },
  { key: 'csv', name: 'Import de fichier (CSV)', domain: '', url: '', category: 'Connecteurs génériques', connector: 'csv', method: ['fichier'],
    access: ['Fichier exporté par l’outil source'], read: ['Contacts, inscriptions, dépenses'], write: [], stats: [], actions: [], embed: { status: 'non', note: 'Import.' },
    automation: { status: 'import', note: 'Rapprochement automatique; réimporter le même fichier ne crée pas de doublons.' }, impl: 'connecteur', implNote: 'Connecteur fonctionnel.', blockers: [], docs: [], modes: ['user', 'agency'], modules: ['Contacts', 'Inscriptions', 'Comptabilité'] },
]

export const integration = (key: string) => INTEGRATIONS.find(i => i.key === key)
export const IMPL_LABEL: Record<Impl, string> = { connecteur: 'Connecteur disponible', connecteur_approbation: 'Connecteur — approbation du fournisseur requise', import: 'Import / webhook', lien: 'Lien et guide seulement' }
export const METHOD_LABEL: Record<Method, string> = { oauth2: 'OAuth 2.0', cle_api: 'Clé / identifiants API', ics: 'Abonnement .ics', webhook: 'Webhook', fichier: 'Import de fichier', lien: 'Lien externe' }
