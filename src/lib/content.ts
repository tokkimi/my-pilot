// Contenu métier extrait des documents de l'équipe : SOP vendeur, « Nouveau dossier vendeur »,
// Guide acheteur, Guide vendeur et Guide du courtier.

export interface Step { id: string; label: string; hint?: string; dateKey?: string }
export interface Phase { id: string; title: string; steps: Step[] }

export const SELL_WORKFLOW: Phase[] = [
  {
    id: 'mandat', title: '1. Prise de mandat', steps: [
      { id: 'm1', label: 'Rendez-vous vendeur préparé (comparables, attraits du secteur, Street View)', hint: 'Voir SOP rendez-vous vendeur' },
      { id: 'm2', label: 'Formulaire de préparation à la vente envoyé et reçu' },
      { id: 'm3', label: 'Analyse comparative du marché (ACM) remise' },
      { id: 'm4', label: 'Contrat de courtage vente signé (EZSign)', dateKey: 'mandat' },
      { id: 'm5', label: 'Déclaration du vendeur signée' },
      { id: 'm6', label: 'Documents requis récupérés (taxes, hypothèque, certificat, copropriété)' },
      { id: 'm7', label: 'Décision certificat de localisation (à refaire ? commandé par ?)' },
      { id: 'm8', label: 'Identité du vendeur vérifiée et formulaire CANAFE complété' },
      { id: 'm9', label: 'Consentement Loi 25 signé' },
      { id: 'm10', label: 'Dossier de signature électronique et dossier Drive créés', hint: 'Bouton « Créer le dossier » à droite' },
    ],
  },
  {
    id: 'nouveau', title: '2. Nouveau dossier vendeur', steps: [
      { id: 'n1', label: 'Entrer le client dans Prospects (ancien client : vérifier la fiche) — démarrer plan d’action : fête, Noël, etc.' },
      { id: 'n2', label: 'Faire l’inscription — saisie à la source' },
      { id: 'n3', label: 'Commander Pancarte Express + boîte à clé' },
      { id: 'n4', label: 'Envoyer le courriel contenant le lien de la fiche descriptive' },
      { id: 'n5', label: 'Réseaux sociaux : publication « nouveauté à vendre »' },
      { id: 'n6', label: 'Gérer Immocontact (demandes de visites)' },
      { id: 'n7', label: 'Envoyer la fiche au vendeur pour validation' },
      { id: 'n8', label: 'Ouvrir l’inscription dans le logiciel de l’agence (ex. NexOne) et y déposer les documents' },
      { id: 'n9', label: 'Mesures des pièces prises (visite terrain) ou reprises de l’ancienne fiche' },
    ],
  },
  {
    id: 'marche', title: '3. Mise en marché', steps: [
      { id: 'k1', label: 'Séance photo professionnelle (+ drone / visite virtuelle)', dateKey: 'photo' },
      { id: 'k2', label: 'Mise en ligne Centris / Realtor.ca', dateKey: 'enLigne' },
      { id: 'k3', label: 'Infolettre au réseau d’acheteurs (Mailchimp / ActivePipe)' },
      { id: 'k4', label: 'Présentation en primeur aux courtiers' },
      { id: 'k5', label: 'Visite libre planifiée' },
      { id: 'k6', label: 'Rapport de mise en marché envoyé au vendeur' },
      { id: 'k7', label: 'Visite vidéo publiée (lien Instagram / YouTube ajouté à la fiche)' },
      { id: 'k8', label: 'Modifications au contrat consignées (baisse de prix, prolongation)' },
    ],
  },
  {
    id: 'pa', title: '4. P.A. acceptée — vendeur', steps: [
      { id: 'p1', label: 'Mettre la PAC (promesse d’achat conditionnelle)', dateKey: 'paAcceptee' },
      { id: 'p2', label: 'Envoyer le courriel récapitulatif des délais' },
      { id: 'p3', label: 'Envoi de la P.A. acceptée pour son accusé de réception' },
      { id: 'p4', label: 'S’assurer que le dossier électronique est complet (GED)' },
      { id: 'p5', label: 'Accusé de réception du financement : faire signer le vendeur et renvoyer au courtier collaborateur' },
      { id: 'p6', label: 'Inscrire la transaction au tableau blanc et suivre les délais' },
      { id: 'p7', label: 'Informer l’arpenteur de la date de l’acte de vente + coordonnées du notaire' },
      { id: 'p8', label: 'Commander Pancarte Express « VENDU »' },
      { id: 'p9', label: 'Ouvrir la transaction dans le logiciel de l’agence' },
      { id: 'p10', label: 'Accusés de réception reçus (P.A. par l’acheteur, D.V., acceptation hypothécaire)' },
    ],
  },
  {
    id: 'cond', title: '5. Conditions réalisées', steps: [
      { id: 'c1', label: 'Faire l’avis de vente dans la saisie à la source', dateKey: 'conditions' },
      { id: 'c2', label: 'Envoyer le courriel de félicitations au vendeur' },
      { id: 'c3', label: 'Envoyer le dossier au notaire' },
      { id: 'c4', label: 'Prendre rendez-vous vendeur + courtière pour la photo « vendu »' },
      { id: 'c5', label: 'Créer post / reel RS de la vente' },
      { id: 'c6', label: 'Préparer les cartons de déménagement à apporter au vendeur (x10)' },
    ],
  },
  {
    id: 'notaire', title: '6. Notaire & après-vente', steps: [
      { id: 'z1', label: 'Documents transmis au notaire, derniers formulaires complétés' },
      { id: 'z2', label: 'Signature de l’acte de vente', dateKey: 'acte' },
      { id: 'z3', label: 'Retirer pancarte et boîte à clé' },
      { id: 'z4', label: 'Demander un avis Google / témoignage' },
      { id: 'z5', label: 'Plan d’action après-vente (anniversaire d’achat, fête, Noël)' },
      { id: 'z6', label: 'Réception du dossier confirmée par le notaire' },
      { id: 'z7', label: 'Facture de l’agence acheminée au notaire' },
      { id: 'z8', label: 'Rétribution reçue et tableau des ventes mis à jour' },
    ],
  },
]

export const BUY_WORKFLOW: Phase[] = [
  {
    id: 'demarrage', title: '1. Démarrage', steps: [
      { id: 'a1', label: 'Portail de recherche mis en place' },
      { id: 'a2', label: 'Formulaire acheteur complété (identité, documents)' },
      { id: 'a3', label: 'Contrat de courtage achat signé (EZSign) — exclusif 6 mois', dateKey: 'mandat' },
      { id: 'a4', label: 'Mise en lien avec un courtier hypothécaire partenaire' },
      { id: 'a5', label: 'Préapprobation hypothécaire reçue' },
      { id: 'a6', label: 'Alertes immobilières activées (critères validés)' },
      { id: 'a7', label: 'Identité vérifiée, formulaire CANAFE et consentement Loi 25' },
    ],
  },
  {
    id: 'recherche', title: '2. Recherche', steps: [
      { id: 'r1', label: 'Veille active — propriétés ciblées envoyées (fiche + documents + analyse)' },
      { id: 'r2', label: 'Visites effectuées' },
      { id: 'r3', label: 'Vérification disponibilité (# Centris) de la propriété choisie' },
    ],
  },
  {
    id: 'offre', title: '3. Offre d’achat', steps: [
      { id: 'o1', label: 'Rédaction de la promesse d’achat + annexes, clauses expliquées' },
      { id: 'o2', label: 'Offre présentée au courtier du vendeur' },
      { id: 'o3', label: 'Négociation / contre-offres' },
      { id: 'o4', label: 'Offre acceptée', dateKey: 'paAcceptee' },
      { id: 'o5', label: 'Courriel récapitulatif des délais envoyé à l’acheteur' },
      { id: 'o6', label: 'Accusés de réception signés (D.V., P.A., contre-propositions)' },
      { id: 'o7', label: 'Entente de référencement / partage de rétribution (s’il y a lieu)' },
    ],
  },
  {
    id: 'verif', title: '4. Vérification diligente', steps: [
      { id: 'v1', label: 'Analyse des documents (déclaration du vendeur, certificat, baux…)' },
      { id: 'v2', label: 'Inspection préachat réalisée', dateKey: 'inspection' },
      { id: 'v3', label: 'Autres vérifications (environnement, zonage…)' },
      { id: 'v4', label: 'Évaluation agréée (si nécessaire)' },
      { id: 'v5', label: 'Financement final confirmé', dateKey: 'financement' },
      { id: 'v6', label: 'Documents transmis au courtier hypothécaire' },
      { id: 'v7', label: 'Accusé de réception du vendeur pour l’acceptation hypothécaire' },
    ],
  },
  {
    id: 'notaire', title: '5. Notaire & après-achat', steps: [
      { id: 'n1', label: 'Dossier envoyé au notaire' },
      { id: 'n2', label: 'Signature de l’acte de vente', dateKey: 'acte' },
      { id: 'n3', label: 'Remise des clés / cadeau', dateKey: 'occupation' },
      { id: 'n4', label: 'Références professionnels (entrepreneurs, fiscalistes…)' },
      { id: 'n5', label: 'Demander un avis / témoignage' },
      { id: 'n6', label: 'Désactiver le portail de recherche du client' },
      { id: 'n7', label: 'Ouvrir la transaction dans le logiciel de l’agence et y déposer les documents' },
      { id: 'n8', label: 'Rétribution reçue et tableau des ventes mis à jour' },
    ],
  },
]

export const DEAL_DATES: { key: string; label: string }[] = [
  { key: 'mandat', label: 'Signature du mandat' },
  { key: 'photo', label: 'Séance photo' },
  { key: 'enLigne', label: 'Mise en ligne' },
  { key: 'paAcceptee', label: 'P.A. acceptée' },
  { key: 'inspection', label: 'Limite inspection' },
  { key: 'financement', label: 'Limite financement' },
  { key: 'autres', label: 'Autres conditions' },
  { key: 'conditions', label: 'Conditions réalisées' },
  { key: 'acte', label: 'Acte de vente (notaire)' },
  { key: 'occupation', label: 'Occupation / remise des clés' },
]

export const MARKETING_PLAN: { group: string; items: string[] }[] = [
  { group: 'Présentation professionnelle', items: ['Photographies professionnelles (correction lumière)', 'Photographie par drone', 'Visite virtuelle', 'Virtual staging', 'Home staging', 'Vidéo de présentation', 'Vidéo animation 2D/3D', 'Plans de la propriété'] },
  { group: 'Diffusion', items: ['Centris', 'Realtor.ca', 'DuProprio / plateformes partenaires', 'Site Web de l’équipe', 'Pancarte + boîte à clé', 'Pancarte virtuelle'] },
  { group: 'Visibilité numérique', items: ['Publicité Facebook', 'Publicité Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Partage comptes perso et pro', 'Infolettre acheteurs (Mailchimp / ActivePipe)'] },
  { group: 'Visibilité traditionnelle', items: ['Envois postaux / publicité imprimée (Vistaprint)', 'Dépliants aux portes du secteur', 'Journal local', 'Porte-à-porte', 'Appels à la base de données'] },
  { group: 'Réseau', items: ['Présentation privée en primeur aux courtiers', 'Réseau de courtiers avec acheteurs', 'Visite libre à grand déploiement', 'Partenariats entreprises locales'] },
]

export const LISTING_DOCS: { group: string; items: string[] }[] = [
  { group: 'Lors de la prise du contrat', items: ['Contrat de courtage', 'Déclaration du vendeur', 'Fiches d’attraits remplies', 'Compte de taxes municipales', 'Compte de taxes scolaires', 'Acte d’hypothèque', 'Certificat de localisation (à jour et original)', 'Factures de travaux'] },
  { group: 'Copropriété', items: ['Déclaration de copropriété', 'Procès-verbaux des 2 dernières années', 'États financiers des 2 dernières années', 'État du fonds de prévoyance', 'Frais de copropriété mensuels', 'Coordonnées du représentant du syndicat'] },
  { group: 'Plex / locatif', items: ['Baux en vigueur', 'Liste des loyers', 'Dépenses d’exploitation', 'Avis de modification de bail'] },
]

export const VISIT_INFO: string[] = ['Mise en ligne possible en 5 jours ?', 'Rendez-vous photos pris ?', 'Boîte à clé ?', 'Fermeture de la maison ?', 'Présentation des offres']
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Fiche d'inscription — Guide du courtier
export const PROPERTY_FEATURES: Record<string, string[]> = {
  'Genre de propriété': ['Plain-pied', 'À étages', 'À paliers multiples', 'À un étage et demi', 'Maison mobile', 'Modulaire', 'Autre'],
  'Type de bâtiment': ['Isolé', 'Jumelé', 'En rangée', 'En rangée sur coin', 'Quadrex', 'Inter. à l’étage', 'Inter. côte-à-côte', 'Inter. sous-sol'],
  'Système d’égouts': ['Municipalité', 'Fosse septique', 'Champ d’épuration', 'Biofiltre', 'Puisard', 'Autre'],
  'Approvisionnement en eau': ['Municipalité', 'Puits artésien', 'Puits de surface', 'Aqueduc privé', 'Eau du lac', 'Avec compteur'],
  'Fondation': ['Béton coulé', 'Blocs de béton', 'Dalle de béton', 'Bois', 'Pierre', 'Pilotis'],
  'Revêtement de la toiture': ['Bardeaux d’asphalte', 'Bitume et gravier', 'Membrane élastomère', 'Tôle', 'Bardeaux de cèdre', 'Autre'],
  'Revêtement': ['Brique', 'Pierre', 'Vinyle', 'Aluminium', 'Stucco', 'Clin de cèdre', 'Bois', 'Acier', 'Fibre pressée', 'Agrégat', 'Pierre de béton', 'Similipierre', 'Similibrique', 'Papier brique', 'Autre'],
  'Fenestration': ['Aluminium', 'Bois', 'PVC', 'Autre'],
  'Type de fenestration': ['Coulissante', 'Guillotine', 'Manivelle (battant)', 'Porte-fenêtre', 'Oscillo-battant', 'Autre'],
  'Mode de chauffage': ['Plinthes électriques', 'Air soufflé (pulsé)', 'Plinthes à convection', 'Eau chaude', 'Radiant', 'Autre'],
  'Énergie pour le chauffage': ['Électricité', 'Bois', 'Mazout', 'Propane', 'Gaz naturel', 'Énergie solaire', 'Bi-énergie', 'Autre'],
  'Sous-sol': ['6 pieds et +', 'Bas (- de 6 pieds)', 'Aucun', 'Entrée extérieure', 'Non aménagé', 'Partiellement aménagé', 'Totalement aménagé', 'Vide sanitaire'],
  'Salle de bain': ['Douche indépendante', 'SDB attenante à la CCP', 'Baignoire à remous', 'Baignoire thermomasseur', 'Salle d’eau attenante à la CCP'],
  'Armoires de cuisine': ['Bois', 'Mélamine', 'Polyester', 'Stratifié', 'Thermoplastique', 'Autre'],
  'Foyer / Poêle': ['Foyer au bois', 'Foyer au gaz', 'Foyer aux granules', 'Poêle au bois', 'Poêle au gaz', 'Poêle aux granules'],
  'Climatisation': ['Climatiseur mural', 'Climatiseur central', 'Thermopompe murale', 'Thermopompe centrale', 'Échangeur d’air'],
  'Équipements / services': ['Adoucisseur d’eau', 'Système d’alarme', 'Aspirateur central', 'Interphone', 'Ouvre-porte garage', 'Ascenseur', 'Mobilité réduite', 'Buanderie', 'Détecteur d’incendie', 'Spa commun'],
  'Appareils en location': ['Chauffe-eau', 'Réservoir au propane', 'Appareil de chauffage', 'Autre'],
  'Piscine': ['Creusée', 'Hors terre', 'Intérieure', 'Chauffée', 'Spa'],
  'Stationnement': ['Allée', 'Garage', 'Abri d’auto'],
  'Allée': ['Asphalte', 'Béton', 'Pavé uni', 'Gravier', 'Non pavé', 'Double largeur +', 'Tandem'],
  'Garage': ['Attaché', 'Détaché', 'Intégré', 'Chauffé', 'Simple', 'Double ou +'],
  'Terrain': ['Boisé', 'Paysager', 'Clôturé', 'Bordé de haies de cèdres', 'Aucun voisin à l’arrière'],
  'Topographie': ['Plat', 'Accidenté', 'En pente', 'Escarpé', 'Ravin'],
  'Particularités du site': ['Coin de rue', 'Cul-de-sac', 'Enclavé', 'Villégiature', 'Accès saisonnier'],
  'Eau (accès)': ['Accès', 'Navigable', 'Non navigable', 'Bordée par l’eau'],
  'Vue': ['Panoramique', 'Sur la montagne', 'Sur l’eau', 'Sur la ville'],
  'Restrictions (condos)': ['Fumeurs', 'Animaux', 'Âge minimum', 'Personnes autonomes'],
}

export const ROOM_PRESETS = [
  ['Hall d’entrée', 'RDC'], ['Salon', 'RDC'], ['Cuisine', 'RDC'], ['Salle à manger', 'RDC'], ['Salle de bain', 'RDC'], ['Salle d’eau', 'RDC'], ['Salle de lavage', 'RDC'],
  ['CCP', '2e étage'], ['Walk-in', '2e étage'], ['CAC #1', '2e étage'], ['CAC #2', '2e étage'], ['Salle de bain', '2e étage'],
  ['Salle familiale', 'Sous-sol'], ['Salle de jeux', 'Sous-sol'], ['CAC #3', 'Sous-sol'], ['Rangement', 'Sous-sol'], ['Atelier', 'Sous-sol'],
  ['Balcon', 'Extérieur'], ['Terrasse', 'Extérieur'], ['Garage', 'Extérieur'],
]
export const FLOORINGS = ['Bois', 'Céramique', 'Parqueterie', 'Flottant', 'Vinyle', 'Béton', 'Prélart', 'Bois traité', 'Composite', 'Fibre de verre']

// SOP — Rendez-vous vendeur
export interface SopSection { id: string; title: string; bullets?: string[]; quotes?: string[]; note?: string }
export const SOP_SELLER: { objective: string; goldenRule: string; sections: SopSection[]; memorize: string[] } = {
  objective: 'Créer une expérience professionnelle, rassurante et structurée qui permet de comprendre les besoins du vendeur, de démontrer une expertise locale solide et de l’accompagner vers une décision éclairée.',
  goldenRule: 'La présentation doit être apprise, mais ne doit jamais donner l’impression d’être récitée. La maîtrise du processus permet de rester entièrement attentive au vendeur, à ses réactions et à ses besoins.',
  sections: [
    { id: 's1', title: '1. Avant le rendez-vous — Préparation', bullets: ['Créer, mettre à jour et maîtriser la présentation et le plan stratégique vendeur.', 'Pratiquer la présentation jusqu’à pouvoir la livrer naturellement.', 'Analyser la propriété, les comparables, les ventes récentes et la réalité du marché.', 'Préparer la liste des attraits du secteur : écoles, parcs, commerces, services et particularités du quartier.', 'Parcourir le quartier et les rues avec Google Street View au besoin.', 'Préparer les documents, le cahier de présentation et le cadeau ou l’attention à remettre au vendeur.', 'Maîtriser la technique du caméléon afin d’adapter l’approche au profil du client.', 'Expérience distinctive dès l’arrivée — lorsque pertinent, apporter un café au client et taguer LP dans une story.', 'Maintenir une image professionnelle cohérente (site Web, cellulaire, réseaux sociaux).'] },
    { id: 's2', title: '2. Arrivée et mise en confiance', bullets: ['Avant d’entrer, se recentrer sur le client et sur l’objectif du rendez-vous.', 'Remettre le document, le cadeau ou l’attention préparée.', 'Utiliser le framing pour expliquer simplement le déroulement de la rencontre.', 'Observer le vendeur et appliquer la technique du caméléon : adapter rythme, niveau de détail, vocabulaire, énergie et réactions.'] },
    { id: 's3', title: '3. Visite de la propriété et découverte', quotes: ['Qu’est-ce qui vous a amené à déménager dans cette maison?', 'Selon vous, quel est le plus gros « wow » de votre propriété?', 'Si vous deviez acheter cette maison aujourd’hui, quel élément changeriez-vous?', 'Quelle est la raison principale pour laquelle vous désirez vendre votre propriété?', 'Quel est votre rêve ou votre projet après la vente?'], note: 'Écouter activement, prendre des notes et repérer les éléments distinctifs, les améliorations, les objections possibles et les priorités du vendeur.' },
    { id: 's4', title: '4. Démontrer son expertise locale', bullets: ['Le quartier et ses attraits', 'Les propriétés comparables et les ventes récentes', 'Le profil des acheteurs actifs', 'La stratégie de prix', 'Les délais de vente et la réalité actuelle du marché', 'Écoles, parcs, commerces et services de proximité', 'Preuves de notoriété : avis et témoignages, nombre d’inscriptions, % vendues, délai de vente moyen, expertise par type (unifamiliale, multiplex, prestige), présence Web et réseaux sociaux'], note: 'Le vendeur doit sentir que la courtière connaît réellement le secteur et ne se limite pas à réciter des statistiques.' },
    { id: 's5', title: '5. Présenter le plan de mise en marché', bullets: ['Expliquer comment la propriété sera préparée, positionnée, diffusée et promue, et comment les visites, suivis, offres et la négociation seront gérés.', 'Voir le plan marketing détaillé (photos, drone, visite virtuelle, staging, vidéos, pubs RS, envois postaux, primeur courtiers, visite libre, partenariats, porte-à-porte).', 'Valeur ajoutée : résultats prouvés, compétences en négociation, communication claire, rapide et constante.'], note: 'À personnaliser avant chaque rendez-vous : remplacer les chiffres génériques par les données réelles (acheteurs qualifiés, portée des comptes, taille du réseau, secteurs visés).' },
    { id: 's6', title: '6. Présenter et conclure le prix', bullets: ['Présenter les trois stratégies de positionnement : Juste prix · Chance · Boxing Day', 'Closing — Roi/Stratège'], quotes: ['En fonction de ces trois choix, avec lequel vous sentez-vous le plus à l’aise?', 'En fonction de tout ce que je vous ai présenté, qu’aimez-vous le plus? (phrase clé cruciale)'] },
    { id: 's7', title: '7. Présenter la commission — Technique FBI', quotes: ['J’imagine que vous le savez déjà, mais je préfère vous l’expliquer clairement. La commission proposée pour le courtier inscripteur, celui qui prend en charge la mise en marché de la propriété, est de [X] %.', 'Pour le courtier qui représente l’acheteur, nous pouvons offrir [X] %. Souhaitez-vous bonifier cette rémunération afin de rendre la propriété encore plus attrayante auprès des courtiers collaborateurs, ou préférez-vous conserver l’option standard?'], note: 'Une rémunération attrayante pour le courtier collaborateur peut soutenir la mobilisation du réseau. Valider les pourcentages, pratiques et formulations avec les règles de l’agence et les obligations professionnelles (OACIQ).' },
    { id: 's8', title: '8. Closing — Technique des trois « oui »', quotes: ['Oui no 1 — Préparation : Est-ce que je peux compter sur vous, lors du passage du photographe, pour épurer au maximum les pièces?', 'Oui no 2 — Communications : Certains éléments peuvent exiger une réponse dans les 24 heures. Puis-je compter sur vous pour consulter vos courriels ou messages texte au moins une fois par jour?', 'Oui no 3 — Références : Lorsque votre propriété sera vendue et que vous serez pleinement satisfait de mon travail, serez-vous à l’aise de me recommander à vos amis, votre famille et vos collègues?'], note: 'Attendre le oui après chaque question.' },
    { id: 's9', title: '9. Présenter le plan d’action', bullets: ['Obtenir l’autorisation de vendre et compléter les documents requis.', 'Choisir la date de la séance photo.', 'Préparer et mettre la propriété sur le marché.', 'Déployer le plan marketing.', 'Recevoir, analyser et négocier les promesses d’achat.', 'Finaliser la transaction et la vente chez le notaire.'] },
    { id: 's10', title: '10. Après le rendez-vous', bullets: ['Effectuer rapidement tous les suivis promis.', 'Noter les renseignements importants : motivations et échéancier du vendeur.', 'Respecter les délais annoncés.', 'Maintenir une communication régulière et proactive.', 'Ajouter au SOP les objections, formulations et techniques qui fonctionnent bien.'] },
  ],
  memorize: ['Technique du caméléon', 'Approche avant d’entrer et framing', 'Cadeau ou document à remettre à l’arrivée', 'Visite de la propriété et questions de découverte', 'Positionnement pendant la présentation', 'Expertise locale et développement de la notoriété', 'Plan stratégique de mise en marché', 'Prix : Juste prix, Chance et Boxing Day', 'Closings : Roi/Stratège, Reine/Fou du Roi et Closing 2', 'Phrase finale, langage corporel et phrase clé cruciale', 'Plan d’action et commission', 'Technique FBI et close des trois oui', 'Réponses aux objections et transition vers la signature'],
}

export const REACTIVATION = {
  steps: ['Reprendre contact avec un message bref et personnel.', 'Attendre idéalement une réponse avant d’envoyer la suite.', 'Expliquer que plusieurs acheteurs sérieux recherchent activement une propriété.', 'Mentionner que plusieurs propriétaires sont surpris de la valeur actuelle de leur propriété.', 'Demander si une personne de leur entourage — ou eux-mêmes — pourrait envisager de vendre ou souhaiter une évaluation.', 'Terminer avec une demande de mise en contact simple et chaleureuse.'],
  scripts: [
    { name: 'Conversationnelle — message 1', body: 'Bon matin [Prénom] 😊 Ça fait un petit bout qu’on ne s’est pas parlé! J’aurais besoin de ton aide pour quelque chose.' },
    { name: 'Conversationnelle — message 2', body: 'Comme tu le sais peut-être, je suis maintenant courtière immobilière. J’ai présentement plusieurs acheteurs sérieux qui cherchent une propriété dans le secteur, mais qui ne trouvent pas exactement ce qu’ils recherchent. Je rencontre aussi plusieurs propriétaires qui sont surpris de découvrir la valeur actuelle de leur propriété.\n\nConnaîtrais-tu quelqu’un dans ton entourage qui pense vendre ou qui serait curieux de connaître la valeur de sa propriété — ou peut-être toi? Si quelqu’un te vient en tête, une petite mise en contact serait vraiment appréciée! ❤' },
    { name: 'Version courte', body: 'Allô [Prénom]! Ça fait longtemps 😊 J’aurais besoin de ton aide. J’ai présentement plusieurs acheteurs qui cherchent activement une propriété dans le secteur. Connaîtrais-tu un propriétaire qui envisage de vendre, maintenant ou prochainement? Ça peut être un ami, un membre de ta famille… ou même toi 😉 Une simple mise en contact serait vraiment appréciée!' },
    { name: 'Version douce', body: 'Allô [Prénom]! Ça fait un petit moment 😊 J’espère que tu vas bien! Je me permets de t’écrire parce que j’accompagne actuellement plusieurs acheteurs sérieux qui cherchent une propriété dans ton secteur. Si tu entends parler d’un ami, d’un voisin ou d’un membre de ta famille qui réfléchit à vendre, j’apprécierais beaucoup que tu penses à moi. Et si c’est une idée qui t’a déjà traversé l’esprit, je serai également heureuse d’en discuter avec toi, tout simplement et sans aucune pression.' },
  ],
  improvements: ['Créer une pancarte virtuelle.', 'Mettre à jour les chiffres de portée et de réseau.', 'Documenter les objections fréquentes et les meilleures réponses.', 'Pratiquer régulièrement la présentation complète.', 'Mettre à jour ce SOP après chaque apprentissage important.'],
}

export const BUYER_GUIDE: { title: string; body: string }[] = [
  { title: 'Mise en place de notre espace d’échange', body: 'Portail de recherche pour centraliser recherches et nouvelles opportunités. Appel privilégié; sinon courriel ou texto.' },
  { title: 'Comprendre votre projet', body: 'Formulaire rapide : vérifier l’identité, rassembler les premiers documents, adapter l’accompagnement.' },
  { title: 'Signature du mandat de collaboration', body: 'Contrat de courtage achat exclusif 6 mois (renouvelable), Grande-Région de Montréal, rémunération prise en charge par le vendeur (2,5 %) sauf mention contraire, signature via EZSign. Formulaire OACIQ « immeuble principalement résidentiel de moins de 5 logements ».' },
  { title: 'Mise en lien avec un courtier hypothécaire', body: 'Résidentiel : courtier payé par l’institution. Commercial : environ 1 % du prêt à la charge de l’acheteur.' },
  { title: 'Activation de vos alertes immobilières', body: 'Nouvelles inscriptions, changements de prix; critères ajustables en tout temps.' },
  { title: 'Recherche manuelle et opportunités ciblées', body: 'Fiche descriptive, documents importants, analyse succincte, avantages et points à surveiller.' },
  { title: 'Intérêt pour une propriété', body: 'Envoyer une capture avec l’adresse ou le numéro Centris (7 ou 8 chiffres).' },
  { title: 'Démarrage du processus d’achat', body: 'Promesse d’achat, négociation, analyse des documents, visite, inspection, vérifications, évaluation, financement, notaire.' },
  { title: 'Formaliser une offre d’achat', body: 'Préparation des documents, explication des clauses, transmission, gestion des contre-offres.' },
  { title: 'Période de vérifications et inspections', body: 'Documents légaux, visites, inspection par un professionnel certifié, expertises additionnelles.' },
  { title: 'Finalisation du financement', body: 'Transmission des documents, clauses et délais au courtier hypothécaire. Respecter les dates de l’offre.' },
  { title: 'Signature chez le notaire', body: 'Acte de vente, vérification des titres, distribution des fonds, inscription au Registre foncier du Québec.' },
  { title: 'Et après l’achat ?', body: 'Références (entrepreneurs, notaires, fiscalistes), questions post-achat, prochaine étape.' },
]

export const SELLER_GUIDE: { title: string; body: string }[] = [
  { title: 'Mise en place de notre espace d’échange', body: 'Portail collaboratif : documents, suivis, statistiques et rétroactions des visites.' },
  { title: 'Comprendre votre propriété et vos objectifs', body: 'Délai, prix, contraintes, historique, rénovations, situation (vente avec rachat, succession, indivision). Formulaire de préparation à la vente.' },
  { title: 'Signature du contrat de courtage', body: 'Mandat exclusif 6 mois (renouvelable), Grande-Région de Montréal, rémunération 5 % (partagée entre courtiers) sauf mention contraire, EZSign.' },
  { title: 'Analyse comparative du marché', body: 'Ventes comparables, concurrence directe, tendances locales, forces et limites de la propriété.' },
  { title: 'Préparation de la mise en marché', body: 'Documents (déclaration du vendeur, certificat de localisation, factures), ajustements, home staging, photos, visites virtuelles. Réseau de partenaires.' },
  { title: 'Lancement de la propriété', body: 'Centris, Realtor.ca, réseaux sociaux, plateformes partenaires, infolettres; rapport de mise en marché régulier.' },
  { title: 'Organisation et gestion des visites', body: 'Créneaux adaptés, suivi des visiteurs, contrôle d’accès, compte-rendu après chaque visite.' },
  { title: 'Réception et négociation des offres', body: 'Analyse (prix, conditions, délais, solidité financière), comparaison, négociation, contre-offres.' },
  { title: 'Période de conditions', body: 'Inspection, financement, autres vérifications; conseils en cas d’ajustement.' },
  { title: 'Préparation à la vente chez le notaire', body: 'Transmission des documents, respect des délais, derniers formulaires, aide au déménagement.' },
  { title: 'Signature de l’acte de vente', body: 'Produit net de la vente, copies des documents légaux.' },
  { title: 'Et après la vente ?', body: 'Prochain projet, références d’experts, questions post-vente.' },
]

export const TEMPLATES_SEED = [
  { name: 'Lien fiche descriptive (nouvelle inscription)', channel: 'courriel', category: 'Vendeur', subject: 'Votre propriété est en ligne — {adresse}', body: 'Bonjour {prenom},\n\nBonne nouvelle : votre propriété au {adresse} est maintenant en ligne!\n\nVoici le lien vers la fiche descriptive : {lien}\n\nN’hésitez pas à la partager dans votre entourage. Je vous tiens au courant des demandes de visites.\n\nAu plaisir,\n{courtier}' },
  { name: 'Récapitulatif des délais (P.A. acceptée)', channel: 'courriel', category: 'Transaction', subject: 'Promesse d’achat acceptée — récapitulatif des délais', body: 'Bonjour {prenom},\n\nFélicitations, la promesse d’achat pour le {adresse} est acceptée! Voici les délais importants à retenir :\n\n• Inspection : {inspection}\n• Financement : {financement}\n• Acte de vente chez le notaire : {acte}\n• Occupation : {occupation}\n\nCertains éléments peuvent exiger une réponse dans les 24 heures — merci de consulter vos courriels et textos au moins une fois par jour.\n\n{courtier}' },
  { name: 'Félicitations — conditions réalisées', channel: 'courriel', category: 'Transaction', subject: 'C’est vendu! 🎉', body: 'Bonjour {prenom},\n\nToutes les conditions sont maintenant réalisées : votre propriété est officiellement VENDUE! 🎉\n\nProchaine étape : la signature chez le notaire le {acte}. Je transmets votre dossier au notaire dès aujourd’hui.\n\nJ’aimerais aussi prendre avec vous une photo « Vendu » — quel moment vous conviendrait?\n\nMerci encore pour votre confiance,\n{courtier}' },
  { name: 'Bienvenue acheteur', channel: 'courriel', category: 'Acheteur', subject: 'Démarrons ensemble votre projet d’achat', body: 'Bonjour {prenom},\n\nMerci de votre confiance! Vous recevrez sous peu :\n1. Le lien vers votre portail de recherche\n2. Un formulaire rapide pour mieux comprendre votre projet\n3. Le contrat de courtage achat à signer via EZSign\n\nJe vous mettrai aussi en lien avec un courtier hypothécaire partenaire.\n\n{courtier}' },
  { name: 'Suivi après visite (vendeur)', channel: 'courriel', category: 'Vendeur', subject: 'Compte-rendu de la visite du {date}', body: 'Bonjour {prenom},\n\nVoici le compte-rendu de la visite d’aujourd’hui :\n\nIntérêt : \nCommentaires : \nObjections : \n\nMa recommandation : \n\n{courtier}' },
  { name: 'Bonne fête', channel: 'texto', category: 'Plan d’action', subject: '', body: 'Bonne fête {prenom}! 🎉 Je te souhaite une superbe journée entourée de ceux que tu aimes. — {courtier}' },
  { name: 'Joyeux Noël', channel: 'texto', category: 'Plan d’action', subject: '', body: 'Joyeuses Fêtes {prenom}! 🎄 Merci pour ta confiance cette année. Au plaisir de se revoir en {annee}! — {courtier}' },
  { name: 'Anniversaire d’achat', channel: 'texto', category: 'Plan d’action', subject: '', body: 'Allô {prenom}! Ça fait déjà un an que tu es dans ta propriété 🏡 J’espère que tu t’y plais toujours autant! Si jamais tu te demandes ce qu’elle vaut aujourd’hui, fais-moi signe. — {courtier}' },
  { name: 'Nouveauté à vendre (RS)', channel: 'reseaux', category: 'Marketing', subject: '', body: '🏡 NOUVEAUTÉ À VENDRE — {ville}\n\n{adresse}\n{chambres} CAC · {sdb} SDB · {prix}\n\n✨ Coup de cœur : \n\n📩 Écrivez-moi pour une visite privée!\n#immobilier #{ville} #aVendre' },
  { name: 'VENDU (RS)', channel: 'reseaux', category: 'Marketing', subject: '', body: '🎉 VENDU — {ville}!\n\nFélicitations à nos vendeurs pour cette belle transaction! Merci pour votre confiance 🙏\n\nVous pensez vendre? Plusieurs acheteurs sont toujours à la recherche dans le secteur. Écrivez-moi!\n#vendu #immobilier #{ville}' },
]

export const OBJECTIONS_SEED = [
  { category: 'Commission', objection: 'Votre commission est trop élevée.', response: 'Je comprends. Regardons ensemble ce que cette rémunération inclut concrètement : photos pro, drone, visite virtuelle, publicité ciblée, réseau de courtiers… L’objectif est de vous obtenir le meilleur prix net, pas seulement le coût le plus bas.' },
  { category: 'Prix', objection: 'Un autre courtier m’a dit un prix plus élevé.', response: 'C’est possible — voici les ventes réelles comparables du secteur. Mon rôle est de vous donner l’heure juste pour vendre au meilleur prix dans vos délais, pas de gagner le mandat avec un chiffre qui fera stagner la propriété.' },
  { category: 'Délai', objection: 'Je veux attendre le printemps.', response: 'Il y a moins d’inventaire en ce moment, donc moins de concurrence pour votre propriété. Les acheteurs actifs aujourd’hui sont souvent les plus motivés.' },
  { category: 'Mandat', objection: '6 mois, c’est trop long.', response: 'La durée protège la stratégie de mise en marché complète. Mon objectif est de vendre bien avant — et je m’engage à une communication régulière avec rapports.' },
]
