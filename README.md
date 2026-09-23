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

## Stockage
Version actuelle : données enregistrées dans le navigateur (localStorage) avec sauvegarde/restauration JSON.
Prochaine étape : base de données infonuagique + authentification pour la synchronisation multi-utilisateurs.

## Développement
```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/
```
