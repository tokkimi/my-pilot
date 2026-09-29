# ImmoPilot — espace de travail connecté : architecture, sécurité et configuration

La matrice exhaustive, application par application, est dans **[MATRICE.md](MATRICE.md)** (générée depuis le code,
`src/lib/integrations/catalog.ts`, et vérifiée par les tests). Elle est aussi consultable dans l’application :
*Plateformes & connexions → Matrice des intégrations*.

## 1. Ce que vit l’agent

1. Il s’inscrit (`/inscription`) ou reçoit un accès de son administrateur (*Équipe*).
2. À la première ouverture, l’accueil présente l’assistant IA (ce qu’il fait, ce qu’il ne fait pas, aucun compte
   ChatGPT requis) puis les applications que son rôle peut connecter.
3. Il relie chaque outil **une fois**, chez le fournisseur (OAuth). ImmoPilot ne voit jamais ses mots de passe.
4. Sur le tableau de bord, **Actualiser** lance la collecte de tous ses outils connectés (et des comptes partagés de
   l’agence), le rapprochement avec les fiches ImmoPilot, puis recharge cartes, listes et statistiques. L’heure de
   dernière actualisation, le nombre d’outils à jour et les outils en erreur sont affichés — jamais « tout est à jour »
   si un connecteur a échoué.
5. La même synchronisation tourne en arrière-plan (webhooks + vérifications périodiques). Les écarts importants
   arrivent discrètement dans **À vérifier** (deux valeurs, deux sources, deux dates) : accepter, garder, fusionner.

## 2. Architecture

| Élément | Fichier | Rôle |
|---|---|---|
| Catalogue / matrice | `src/lib/integrations/catalog.ts` | Source unique : méthode, accès, données, actions, affichage intégré, blocages |
| Coffre de secrets | `server/vault.ts` | AES-256-GCM (`SECRETS_KEY`); fichiers `secrets/<agence>/<connexion>.json`, jamais envoyés au navigateur, aux journaux ni à l’IA |
| Connexions | `server/connections.ts` | Fiches sans secret : état, compte, curseurs, webhooks, dernières réussites |
| OAuth générique | `server/connectors/oauth.ts` | État signé HMAC + nonce en cookie chiffré + PKCE, échange, renouvellement automatique |
| Connecteurs | `server/connectors/*.ts` | Google, Microsoft 365, Mailchimp, Calendly, Meta, LinkedIn, TikTok, Canva, CREA DDF, .ics, webhook entrant, CSV |
| Moteur | `server/sync/engine.ts` | File de travaux par agence, bail anti-concurrence, découpage 30 s, reprises, historique |
| Rapprochement | `server/sync/merge.ts` | Correspondance, fusion à trois voies, champs sensibles, suppressions, doublons, tâches générées |
| Cohérence | `server/sync/rules.ts` | Doublons, dossiers incohérents (sans IA, sans coût) |
| Politiques | `server/policy.ts` | Offre plateforme × politique d’agence × rôle — vérifiées à chaque lecture et action |
| Audit | `server/audit.ts` | Journal mensuel chaîné (hachage) : imports, modifications auto, IA, validations, connexions |
| IA | `server/ai.ts`, `api/ai.ts` | API OpenAI côté serveur, contexte filtré et daté, propositions validées par un humain |
| API | `api/connect.ts`, `api/sync.ts`, `api/ai.ts` | Connexions/webhooks/actions/politiques, Actualiser/cron/À vérifier, assistant |
| Interface | `src/modules/Platforms.tsx`, `src/components/SyncBar.tsx`, `Assistant.tsx`, `Onboarding.tsx`, `src/site/Signup.tsx` | |

Le projet compte 11 fonctions Vercel (limite de 12 du forfait Hobby respectée). `/api/connect/*` est réécrit vers
`/api/connect?route=*` (vercel.json).

## 3. Modèle de données et règles de rapprochement

Chaque donnée importée porte :

- **identifiant externe** et **source** : `_src: [{ p: fournisseur, c: connexion, x: id externe, at: date de lecture, url }]`;
- **provenance par champ** : `_prov: { champ: { p: source, at: date } }` (une valeur validée porte « validé par … »);
- **propriétaire** : `ownerId` / `agentId` / `assigneeId` = membre dont la connexion a importé la donnée;
- **permissions** : les communications issues d’un compte personnel (`activities.private`) ne sont visibles que par
  leur propriétaire (filtré côté serveur dans `api/data.ts` et dans le contexte de l’IA);
- **valeur de base** (dernière valeur vue à la source) dans `agencies/<id>/sync/links.json` pour la fusion à trois voies.

| Donnée | Règle de rapprochement (dans l’ordre) | Champs sensibles → « À vérifier » | Suppression à la source |
|---|---|---|---|
| Contacts / prospects | id externe → courriel normalisé → téléphone (10 derniers chiffres). Même nom sans coordonnée commune → création + « doublon possible » | prénom, nom, date de naissance | jamais automatique : « À vérifier » |
| Rendez-vous | id externe → id ImmoPilot (événements envoyés depuis ImmoPilot) | — | retiré s’il n’a pas été modifié dans ImmoPilot et n’a pas d’autre source, sinon « À vérifier » |
| Inscriptions | id externe → n° Centris/MLS → adresse normalisée | prix, superficie, terrain, prix vendu, adresse, ville, commission, n° Centris | « À vérifier » |
| Dossiers | liens contact/inscription | prix, commission, dates | — |
| Communications | rattachées à un contact **existant** seulement (aucun contact créé depuis un courriel) | — | — |
| Tâches générées | clé déterministe (`lead:<contact>`, `ai:<proposition>`) — jamais recréées, même supprimées | — | — |
| Campagnes / statistiques | id `fournisseur:id` — mises à jour à chaque lecture, datées | — | retirées |
| Documents externes | liste par fiche et par fournisseur, datée | — | liste remplacée |

Fusion à trois voies (champ par champ) : si la source n’a pas changé, la valeur ImmoPilot est gardée; si seule la source
a changé, le changement ordinaire est appliqué (réglable); si les deux ont changé → « À vérifier ». Un champ absent de la
source n’est jamais modifié : **aucune donnée n’est inventée**.

Reprises sans duplication : les données collectées sont enregistrées (même en cas d’échec partiel) puis les curseurs
sont avancés. Relire les mêmes données ne crée rien (id externe + `_src`). Les écritures utilisent la concurrence
optimiste (etag) : les modifications des membres faites en même temps ne sont jamais perdues.

## 4. Synchronisation

- **Actualiser** (`POST /api/sync {action:"refresh"}`) : rejoint l’exécution en cours s’il y en a une (un seul travailleur
  par agence grâce à un bail), traite ~15 s, puis le navigateur poursuit par étapes (`step`) en affichant la progression.
- **Automatique** : `GET /api/sync?action=cron` (en-tête `Authorization: Bearer <CRON_SECRET>`) synchronise les connexions
  dues selon la fréquence réglée par l’agence (15 min à 1 jour), agence par agence, en ordre tournant.
  - `vercel.json` déclare un cron **quotidien** (seul intervalle permis sur le forfait Hobby);
  - `.github/workflows/sync-cron.yml` l’appelle **toutes les 15 min** dès que les secrets du dépôt sont définis;
  - sur Vercel Pro, vous pouvez remplacer le cron quotidien par `*/15 * * * *`.
- **Webhooks** : Google Agenda (canal *watch*), Microsoft Graph (abonnements), Calendly (signés), Mailchimp (audience),
  Meta (leadgen signé), webhook entrant (jeton). Un webhook ne fait que **déclencher** une lecture auprès du fournisseur
  (sauf le webhook entrant, authentifié par jeton) : une charge utile falsifiée ne peut pas injecter de données.
- **Limitation de débit / reprises** : seau à jetons par fournisseur, respect de `Retry-After`, reprises exponentielles
  (1, 5, 30, 120, 360 min), historique des 60 dernières exécutions, statut honnête par outil.
- **Coûts** : fréquences réglables par l’agence; IA uniquement sur demande ou (option) un résumé après synchronisation,
  plafonné par un budget mensuel de jetons, avec 20 % réservés aux questions des agents.

## 5. Connexion durable et reconnexion

Jetons de renouvellement chiffrés, renouvelés automatiquement. Une révocation, un mot de passe changé, une MFA exigée ou
un jeton expiré (`invalid_grant`, 401) passent la connexion en **« À reconnecter »** : les données déjà importées restent
en place avec leur date, le bouton **Reconnecter** relance l’autorisation sur la même fiche (historique conservé).
**Déconnecter** révoque/détruit les jetons; les données importées restent. LinkedIn (sans jeton de renouvellement hors
partenaires) demande une reconnexion tous les 60 jours; ImmoPilot affiche les jours restants.

Mots de passe : jamais stockés. Les services qui n’offrent qu’un identifiant/mot de passe (Centris, JLR, NexOne,
Registre foncier, Pancarte Express…) restent en **lien + guide**, ouverts dans une fenêtre à côté d’ImmoPilot. Un coffre
dédié à mots de passe n’a pas été retenu : ces services interdisent l’accès automatisé par un tiers, et conserver le mot
de passe d’un courtier augmenterait le risque sans gain autorisé. Recommandation : gestionnaire de mots de passe
d’équipe (1Password, Bitwarden) côté navigateur.

## 6. Affichage intégré (« espace navigateur »)

Chaque fiche propose **Ouvrir** : ImmoPilot vérifie côté serveur les en-têtes `X-Frame-Options` et
`Content-Security-Policy: frame-ancestors` du site (résultat mis en cache 24 h). Si le fournisseur l’autorise, l’outil
s’affiche dans ImmoPilot; sinon il s’ouvre dans une **fenêtre à côté**. Aucun contournement n’est tenté. En pratique,
les pages de connexion (Google, Microsoft, Meta, Centris, NexOne…) interdisent l’affichage en cadre (anti-hameçonnage)
et les navigateurs bloquent les cookies tiers : une session de navigateur isolée pilotée à distance (Browserbase,
Apify…) n’a pas été mise en place, car les conditions de Centris, DuProprio, JLR et du Registre foncier interdisent
l’automatisation. Apify reste utilisable **uniquement** pour un acteur que l’agence a le droit d’exécuter, via le
webhook entrant. Les cartes (Maps Embed API) sont affichées directement dans la fiche d’inscription.

## 7. Permissions et sécurité (appliquées côté serveur)

- **Plateforme (super-admin)** : applications proposées à chaque agence (console `/admin` → Connecteurs & IA).
- **Agence (admin)** : application active, rôles qui la voient / l’utilisent, comptes individuels ou partagés,
  fréquence, services (ex. Gmail), actions automatiques, données accessibles à l’IA, rôles ayant l’IA, budget,
  « Demander de reconnecter ». Désactiver une application déconnecte les comptes et détruit les jetons.
- Chaque requête vérifie session, agence (isolation stricte : un membre ne voit que son agence), rôle et politique.
- Actions difficiles à annuler (envoi Mailchimp, publication Meta/LinkedIn, annulation Calendly) : aperçu →
  jeton de confirmation de 5 min lié à l’utilisateur, à la connexion, à l’action et aux paramètres → « Je confirme ».
- Journal chaîné consultable (Plateformes → Administration) avec vérification d’intégrité.

## 8. IA

OpenAI **n’offre pas** (septembre 2026) de connexion « Se connecter avec ChatGPT » pour les applications tierces, et un
abonnement ChatGPT ne donne pas accès à l’API. ImmoPilot utilise donc l’**API OpenAI** (Responses API, sortie JSON
structurée, `store: false`) avec la clé de la plateforme, côté serveur. Les agents n’ont besoin d’aucun compte ChatGPT
et ne donnent jamais leurs identifiants. Le contexte envoyé : données de l’agence de l’utilisateur uniquement, liste
blanche de champs, montants seulement si autorisés, communications privées d’autrui exclues, secrets retirés, source et
date de chaque fiche/champ. L’IA propose; un humain valide (tâches créées une seule fois, journalisées).

## 9. Variables d’environnement (Vercel → Project → Settings → Environment Variables)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SESSION_SECRET` | oui | Signature des sessions et des états OAuth (chaîne aléatoire ≥ 32 caractères) |
| `SECRETS_KEY` | fortement recommandé | Clé du coffre des jetons (chaîne aléatoire ≥ 32 caractères, distincte de `SESSION_SECRET`) |
| `APP_URL` | recommandé | URL publique (ex. `https://immopilot-crm.vercel.app`) pour les redirections OAuth et webhooks |
| `CRON_SECRET` | pour l’automatique | Protège `/api/sync?action=cron` (Vercel l’envoie automatiquement aux crons) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` (déf. `gpt-5-mini`), `OPENAI_BASE_URL` (optionnel) | pour l’IA | Assistant |
| `AGENCY_TIMEZONE` | non (déf. `America/Toronto`) | Fuseau des rendez-vous |
| `SIGNUP_ENABLED` | non (déf. ouvert) | `false` ferme l’inscription libre-service |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID` | Google | existant |
| `GOOGLE_MAPS_EMBED_KEY` | non | Carte intégrée dans les inscriptions |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT` (déf. `common`) | Outlook | |
| `MAILCHIMP_CLIENT_ID`, `MAILCHIMP_CLIENT_SECRET` | Mailchimp | |
| `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` | Calendly | |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION` (déf. `v23.0`) | Meta | |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_VERSION` | LinkedIn | |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok | |
| `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` | Canva | |

Aucune variable n’est nécessaire pour CREA DDF, les agendas .ics, le webhook entrant et l’import CSV : les identifiants
sont saisis par l’agence dans ImmoPilot et chiffrés. **Ne collez jamais un secret dans le dépôt ni dans une conversation.**

## 10. Réglages chez les fournisseurs (pas à pas)

Dans chaque cas, l’**adresse de redirection** est `https://<votre domaine>/api/connect/callback/<connecteur>` (affichée
dans la console `/admin` → Connecteurs & IA). Après avoir ajouté les variables dans Vercel, redéployez.

**Clés générales** — Générez `SESSION_SECRET`, `SECRETS_KEY` et `CRON_SECRET` sur votre ordinateur
(`openssl rand -base64 48`), puis collez-les dans Vercel → Settings → Environment Variables (Production).

**OpenAI** — platform.openai.com → Settings → Organization → Billing (ajoutez un moyen de paiement et une limite) →
API keys → *Create new secret key* (nom « ImmoPilot production », projet dédié) → copiez dans `OPENAI_API_KEY`.
Dans Limits, fixez un plafond mensuel.

**Google (portées supplémentaires)** — console.cloud.google.com → votre projet ImmoPilot → API et services →
Bibliothèque : activez *People API*, *Gmail API* (si Gmail), *YouTube Data API v3* (si YouTube). Écran de consentement →
Portées : ajoutez `contacts.readonly`, `gmail.metadata`, `youtube.readonly` selon les services activés. Gmail est une
portée **restreinte** : vérification Google + évaluation de sécurité CASA avant d’ouvrir au public. Business Profile :
remplissez le formulaire *Business Profile API access* (support.google.com/business → « Demande d’accès à l’API »),
puis activez les API *My Business Account Management*, *Business Information* et *My Business*. L’URI de redirection
existant (`/api/google-callback`) ne change pas. Les notifications Agenda nécessitent un domaine HTTPS public.

**Microsoft 365** — entra.microsoft.com → Applications → Inscriptions d’applications → *Nouvelle inscription* :
nom ImmoPilot, « Comptes dans un annuaire organisationnel et comptes Microsoft personnels », redirection *Web* :
`…/api/connect/callback/microsoft`. Certificats et secrets → *Nouveau secret client* → valeur dans
`MICROSOFT_CLIENT_SECRET`; l’*ID d’application (client)* dans `MICROSOFT_CLIENT_ID`. Autorisations d’API → Microsoft
Graph → Déléguées : `offline_access`, `User.Read`, `Calendars.ReadWrite`, `Contacts.Read`, `Mail.ReadBasic`.

**Mailchimp** — mailchimp.com → Profil → Extras → *Registered apps* → *Register an app* : redirection
`…/api/connect/callback/mailchimp` → `MAILCHIMP_CLIENT_ID` / `MAILCHIMP_CLIENT_SECRET`.

**Calendly** — developer.calendly.com → *Create a new app* (type Web, environnement Production) → redirection
`…/api/connect/callback/calendly` → identifiants dans `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET`. Les webhooks
exigent un forfait Calendly payant (sinon vérification périodique automatique).

**Meta** — developers.facebook.com → *Créer une app* (type Entreprise) → produits *Facebook Login for Business* et
*Webhooks*. Login → URI de redirection OAuth valides : `…/api/connect/callback/meta`. Webhooks → Page → URL de rappel
`…/api/connect/webhook/meta`, jeton de vérification = valeur de `META_WEBHOOK_VERIFY_TOKEN` (chaîne aléatoire que vous
choisissez), abonnez le champ `leadgen`. Paramètres → Général : `META_APP_ID`, `META_APP_SECRET`. Puis *Vérification de
l’entreprise* et *Examen de l’app* pour `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`,
`leads_retrieval`, `instagram_basic`, `instagram_manage_insights` (+ `pages_manage_posts` pour publier). En attendant,
seuls les comptes ajoutés comme testeurs de l’app peuvent se connecter.

**LinkedIn** — linkedin.com/developers → *Create app* (page entreprise requise) → Products : *Sign In with LinkedIn using
OpenID Connect* et *Share on LinkedIn* → Auth : redirection `…/api/connect/callback/linkedin` → identifiants.

**TikTok** — developers.tiktok.com → *Manage apps* → *Connect an app* → produits *Login Kit* et *Display API*, portées
`user.info.basic`, `user.info.stats`, `video.list`, redirection `…/api/connect/callback/tiktok` → soumettre à la revue.

**Canva** — canva.com/developers → *Your integrations* → *Create an integration* (Public) → Scopes `design:meta:read`,
`profile:read` → Authentication : redirection `…/api/connect/callback/canva` → *Generate secret* → identifiants →
soumettre à la revue pour l’ouvrir à d’autres équipes.

**CREA DDF®** (par agence ou courtier) — REALTOR Link® → *DDF®* → créez un flux « Mes inscriptions » ou « Mon bureau »
de type *Data feed (API)* → copiez *Client ID* et *Client Secret* → ImmoPilot → Plateformes → Realtor.ca → Connecter.

**Synchronisation toutes les 15 min** — GitHub → dépôt → Settings → Secrets and variables → Actions → *New repository
secret* : `IMMOPILOT_URL` (ex. `https://immopilot-crm.vercel.app`) et `CRON_SECRET` (même valeur que dans Vercel).

**eZsign** — console eZmax → Webhooks → ajoutez l’adresse entrante de l’agence (ImmoPilot → Plateformes →
Webhook entrant → Créer l’adresse) pour l’événement *DocumentCompleted*. Pour l’envoi de signatures depuis ImmoPilot,
demandez à eZmax des identifiants API (connecteur à brancher dès leur réception).

## 11. Tests

`npm test` (vitest) couvre : création sans doublon, reprise après échec partiel, fusion à trois voies, conflits, champs
sensibles, suppressions, doublons et fusion, tâches générées une seule fois, respect des réglages automatiques,
communications privées, file de synchro découpée, jonction d’une exécution en cours, bail anti-concurrence,
reconnexion requise, pause après erreur, journal chaîné, isolation des agences, permissions d’administration, webhook
entrant (jeton, idempotence), import CSV, confirmation obligatoire des actions, déconnexion, validation « À vérifier »,
cron protégé, coffre et masquage, contexte IA (liste blanche, provenance, finances, dossier ciblé), appel OpenAI simulé,
OAuth (état signé, PKCE), formats .ics/CSV/webhook, couverture complète du catalogue, et docs/MATRICE.md à jour.
