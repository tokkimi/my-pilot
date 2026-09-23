# ImmoPilot — CRM tout-en-un pour agences et courtiers immobiliers

Plateforme unique qui regroupe les outils, les processus et les SOP d’une agence (une agence → plusieurs profils : courtiers, adjointes, membres d’équipe).

## Modules
- **Tableau de bord** : KPI, tableau blanc des délais, tâches, agenda 7 jours, plan d’action (fêtes, anniversaires d’achat, Noël), réactivation « All In ».
- **Contacts & prospects** : vendeurs, acheteurs, anciens clients, sphère, investisseurs; historique d’interactions, modèles courriel/texto, import/export CSV.
- **Pipeline** (kanban glisser-déposer), **Tâches**, **Calendrier** (export .ics / Google Agenda).
- **Inscriptions** : fiche complète du *Guide du courtier* (caractéristiques, mesure des pièces, documents requis, certificat de localisation, horaire des visites), plan marketing, rétroactions, fiche imprimable.
- **Dossiers & transactions** : processus vendeur (prise de mandat → Nouveau dossier vendeur → mise en marché → P.A. acceptée → conditions réalisées → notaire) et acheteur (13 étapes du *Guide acheteur*), délais, génération de tâches et d’événements, courriel récapitulatif des délais, rétribution.
- **Marketing & réseaux** (calendrier de contenu), **Courriels & textos** (modèles à variables).
- **SOP & scripts** : SOP rendez-vous vendeur, mode présentation, réactivation « All In », objections, éléments à maîtriser.
- **Guides clients** (acheteur / vendeur, imprimables), **Calculateurs** (bilan du vendeur, rétribution, taxe de bienvenue, hypothèque, rendement plex).
- **Plateformes** (Centris, JLR, Prospects, ActivePipe, EZSign, Pancarte Express, Canva, Mailchimp, réseaux sociaux…), **Partenaires**, **Commissions & dépenses**, **Équipe**, **Paramètres** (sauvegarde / restauration JSON).

## Pages
- `/` : page d’accueil commerciale (fonctionnalités, intégrations, forfaits, formation, formulaire de contact)
- `/connexion` : connexion des agences, courtiers et membres
- `/app` : espace sécurisé de l’agence (données partagées entre les membres)
- `/admin` : console des propriétaires de la plateforme (statistiques, agences, utilisateurs, demandes)
- `/demo` : démonstration sans compte (données dans le navigateur)

## Visites terrain
Démarrer une visite (évaluation, acheteur, visite libre, relevé, inspection), dictée vocale transcrite (fr-CA) avec détection des dimensions
(« salon 14 par 16 pieds »), vidéo par pièce, mesure assistée sur image (objet de référence) ou en réalité augmentée (WebXR, Android),
éditeur de plan 2D (généré depuis les mesures ou plan importé), rapport imprimable, copie des pièces dans l’inscription.

## Serveur (Vercel Functions)
`api/*.ts` : auth, data, media, leads, admin. Stockage : Vercel Blob privé (`BLOB_READ_WRITE_TOKEN`), système de fichiers `.data/` en développement.

Variables d’environnement : `SESSION_SECRET`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`,
`TEST_AGENT_EMAIL`, `TEST_AGENT_PASSWORD`. Les comptes sont créés automatiquement au premier appel.

## Développement
```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/
```
