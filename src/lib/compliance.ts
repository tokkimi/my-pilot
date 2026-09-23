// Conformité des dossiers : documents requis selon le type de dossier et la situation.
// Modèle construit à partir des pratiques de tenue de dossiers du courtage au Québec
// (dossier de contrat de courtage + dossier de transaction, vérification d'identité, consentement,
// fidéicommis). La liste s'adapte : copropriété, compagnie, succession, fosse septique, etc.
import type { Deal, DocStatus } from './types'

export type DocType = 'vente_residentielle' | 'vente_terrain' | 'achat' | 'location_bailleur' | 'location_locataire' | 'commercial_vente' | 'commercial_location' | 'vente_entreprise'

export const DOC_TYPES: Record<DocType, { label: string; side: 'vente' | 'achat'; desc: string }> = {
  vente_residentielle: { label: 'Vente résidentielle (inscription)', side: 'vente', desc: 'Maison, condo, plex — représentation du vendeur' },
  vente_terrain: { label: 'Vente de terrain (inscription)', side: 'vente', desc: 'Terrain vacant ou lot' },
  achat: { label: 'Achat (promesse d’achat)', side: 'achat', desc: 'Représentation ou collaboration côté acheteur' },
  location_bailleur: { label: 'Location — inscription (bailleur)', side: 'vente', desc: 'Mise en location d’un logement' },
  location_locataire: { label: 'Location — promesse de location', side: 'achat', desc: 'Représentation du locataire' },
  commercial_vente: { label: 'Commercial — vente d’immeuble', side: 'vente', desc: 'Industriel, centre commercial, immeuble locatif' },
  commercial_location: { label: 'Commercial — location de local', side: 'vente', desc: 'Bureaux, industriel, commercial' },
  vente_entreprise: { label: 'Vente d’entreprise', side: 'vente', desc: 'Fonds de commerce, franchise' },
}

/** Questions de situation : elles déterminent les documents supplémentaires. */
export const SITUATION: { key: string; label: string; types?: DocType[] }[] = [
  { key: 'condo_divise', label: 'Copropriété divise', types: ['vente_residentielle', 'achat', 'location_bailleur'] },
  { key: 'condo_indivise', label: 'Copropriété indivise', types: ['vente_residentielle', 'achat'] },
  { key: 'compagnie', label: 'Une partie est une compagnie' },
  { key: 'succession', label: 'Succession (transmission)', types: ['vente_residentielle', 'vente_terrain', 'commercial_vente'] },
  { key: 'procuration', label: 'Un signataire agit par procuration' },
  { key: 'fiducie', label: 'Propriété détenue en fiducie', types: ['vente_residentielle', 'vente_terrain', 'commercial_vente', 'achat'] },
  { key: 'septique', label: 'Installation septique / puits', types: ['vente_residentielle', 'vente_terrain', 'achat'] },
  { key: 'locatif', label: 'Logements ou locaux loués (baux)', types: ['vente_residentielle', 'commercial_vente', 'achat'] },
  { key: 'location_appareils', label: 'Appareils en location (chauffe-eau, alarme…)', types: ['vente_residentielle', 'achat'] },
  { key: 'sans_contrat', label: 'Client non lié par un contrat de courtage (collaboration)', types: ['achat', 'location_locataire'] },
  { key: 'financement', label: 'Achat conditionnel à un financement', types: ['achat'] },
  { key: 'inspection', label: 'Achat conditionnel à une inspection', types: ['achat'] },
  { key: 'depot', label: 'Dépôt / acompte en fidéicommis' },
  { key: 'partage', label: 'Entente de référencement ou partage de rétribution' },
  { key: 'franchise', label: 'Franchise', types: ['vente_entreprise'] },
  { key: 'environnement', label: 'Enjeu environnemental (étude requise)', types: ['vente_terrain', 'commercial_vente'] },
]

export const GROUPS = ['Contrat et mandat', 'Identification et conformité', 'Propriété', 'Copropriété', 'Promesse et conditions', 'Fidéicommis', 'Autres'] as const
export type Group = (typeof GROUPS)[number]
/** Sous-dossiers Drive proposés (un par groupe). */
export const DRIVE_SUBFOLDERS = GROUPS.map((g, i) => `${String(i + 1).padStart(2, '0')} ${g}`)

interface DocDef { id: string; label: string; group: Group; types: DocType[] | 'all'; when?: (s: Record<string, boolean>) => boolean }
const V: DocType[] = ['vente_residentielle', 'vente_terrain']
const ALL_SALE: DocType[] = ['vente_residentielle', 'vente_terrain', 'commercial_vente']

const DOCS: DocDef[] = [
  // Contrat et mandat
  { id: 'contrat', label: 'Contrat de courtage signé par le client et le courtier', group: 'Contrat et mandat', types: ['vente_residentielle', 'vente_terrain', 'location_bailleur', 'vente_entreprise'] },
  { id: 'contrat_achat', label: 'Contrat de courtage achat', group: 'Contrat et mandat', types: ['achat'], when: s => !s.sans_contrat },
  { id: 'contrat_location', label: 'Contrat de courtage location (locataire)', group: 'Contrat et mandat', types: ['location_locataire'], when: s => !s.sans_contrat },
  { id: 'avis_sans_contrat', label: 'Avis du courtier au client non lié par un contrat', group: 'Contrat et mandat', types: ['achat', 'location_locataire'], when: s => !!s.sans_contrat },
  { id: 'contrat_service', label: 'Contrat de service, entente de rétribution ou lettre d’intention', group: 'Contrat et mandat', types: ['commercial_vente', 'commercial_location'] },
  { id: 'modifications', label: 'Modifications au contrat (prix, prolongation) — s’il y a lieu', group: 'Contrat et mandat', types: 'all' },
  { id: 'fiche', label: 'Fiche descriptive / fiche d’inscription', group: 'Contrat et mandat', types: ['vente_residentielle', 'vente_terrain', 'location_bailleur', 'commercial_vente', 'vente_entreprise'] },
  { id: 'fiche_vendue', label: 'Fiche de l’inscription vendue / louée', group: 'Contrat et mandat', types: ['achat', 'location_locataire'] },
  // Identification et conformité
  { id: 'identite', label: 'Preuve de vérification d’identité du client', group: 'Identification et conformité', types: 'all' },
  { id: 'canafe', label: 'Formulaire de vérification CANAFE (recyclage des produits de la criminalité)', group: 'Identification et conformité', types: 'all' },
  { id: 'loi25', label: 'Consentement du client à la collecte des renseignements (Loi 25)', group: 'Identification et conformité', types: 'all' },
  { id: 'req', label: 'Immatriculation au Registraire des entreprises (REQ)', group: 'Identification et conformité', types: 'all', when: s => !!s.compagnie },
  { id: 'resolution', label: 'Résolution de la compagnie autorisant le signataire', group: 'Identification et conformité', types: 'all', when: s => !!s.compagnie },
  { id: 'procuration', label: 'Procuration (mandat) du signataire', group: 'Identification et conformité', types: 'all', when: s => !!s.procuration },
  { id: 'fiducie', label: 'Acte ou certificat de fiducie', group: 'Identification et conformité', types: 'all', when: s => !!s.fiducie },
  { id: 'transmission', label: 'Déclaration de transmission (succession)', group: 'Identification et conformité', types: ALL_SALE, when: s => !!s.succession },
  // Propriété
  { id: 'dv', label: 'Déclarations du vendeur', group: 'Propriété', types: ['vente_residentielle', 'vente_terrain'] },
  { id: 'certificat', label: 'Certificat de localisation (ou de bornage pour un terrain)', group: 'Propriété', types: [...ALL_SALE] },
  { id: 'taxes_mun', label: 'Compte de taxes municipales (année en cours)', group: 'Propriété', types: ALL_SALE },
  { id: 'taxes_scol', label: 'Compte de taxes scolaires (année en cours)', group: 'Propriété', types: ALL_SALE },
  { id: 'index', label: 'Index des immeubles (registre foncier)', group: 'Propriété', types: [...ALL_SALE, 'achat', 'location_bailleur'] },
  { id: 'acte_vente', label: 'Copie de l’acte de vente (titres)', group: 'Propriété', types: ALL_SALE },
  { id: 'acte_pret', label: 'Acte de prêt hypothécaire', group: 'Propriété', types: V },
  { id: 'servitudes', label: 'Actes de servitude ou de cession — s’il y a lieu', group: 'Propriété', types: V },
  { id: 'hydro', label: 'Factures d’électricité et de chauffage (gaz / mazout)', group: 'Propriété', types: ['vente_residentielle'] },
  { id: 'renovations', label: 'Factures de rénovations et réparations (toiture, etc.)', group: 'Propriété', types: ['vente_residentielle', 'commercial_vente'] },
  { id: 'location_appareils', label: 'Contrats des appareils en location', group: 'Propriété', types: ['vente_residentielle', 'achat'], when: s => !!s.location_appareils },
  { id: 'septique', label: 'Attestation d’installation et facture de vidange de la fosse septique', group: 'Propriété', types: ['vente_residentielle', 'vente_terrain', 'achat'], when: s => !!s.septique },
  { id: 'baux', label: 'Baux en vigueur ou liste détaillée des baux', group: 'Propriété', types: ['vente_residentielle', 'commercial_vente', 'achat'], when: s => !!s.locatif },
  { id: 'plan_locaux', label: 'Plan des locaux', group: 'Propriété', types: ['commercial_vente', 'commercial_location'] },
  { id: 'comparables', label: 'Rapport analytique / comparables', group: 'Propriété', types: ['commercial_vente'] },
  { id: 'environnement', label: 'Test ou étude environnementale', group: 'Propriété', types: ['vente_terrain', 'commercial_vente'], when: s => !!s.environnement },
  { id: 'inspection_existante', label: 'Rapport d’inspection existant — s’il y a lieu', group: 'Propriété', types: ['vente_residentielle', 'vente_terrain'] },
  { id: 'preemption', label: 'Renonciation au droit de préemption — s’il y a lieu', group: 'Propriété', types: ['vente_residentielle', 'vente_terrain'] },
  // Entreprise
  { id: 'etats_financiers_ent', label: 'État des revenus et dépenses, bilan', group: 'Propriété', types: ['vente_entreprise'] },
  { id: 'inventaire', label: 'Inventaire des stocks et liste des équipements', group: 'Propriété', types: ['vente_entreprise'] },
  { id: 'permis', label: 'Permis d’exploitation', group: 'Propriété', types: ['vente_entreprise'] },
  { id: 'bail_entreprise', label: 'Bail commercial de l’entreprise', group: 'Propriété', types: ['vente_entreprise'] },
  { id: 'franchise', label: 'Contrat de franchise', group: 'Propriété', types: ['vente_entreprise'], when: s => !!s.franchise },
  // Copropriété
  { id: 'decl_copro', label: 'Déclaration de copropriété', group: 'Copropriété', types: ['vente_residentielle', 'achat', 'location_bailleur'], when: s => !!s.condo_divise },
  { id: 'convention_indivision', label: 'Convention d’indivision', group: 'Copropriété', types: ['vente_residentielle', 'achat'], when: s => !!s.condo_indivise },
  { id: 'reglements', label: 'Règlements de l’immeuble', group: 'Copropriété', types: ['vente_residentielle', 'location_bailleur'], when: s => !!(s.condo_divise || s.condo_indivise) },
  { id: 'etats_financiers', label: 'États financiers, procès-verbaux et fonds de prévoyance (2 dernières années)', group: 'Copropriété', types: ['vente_residentielle'], when: s => !!(s.condo_divise || s.condo_indivise) },
  { id: 'attestation_syndicat', label: 'Attestation du syndicat (état de la copropriété)', group: 'Copropriété', types: ['vente_residentielle', 'achat'], when: s => !!s.condo_divise },
  { id: 'carnet', label: 'Carnet d’entretien', group: 'Copropriété', types: ['vente_residentielle', 'achat'], when: s => !!s.condo_divise },
  { id: 'frais_condo', label: 'Frais de copropriété mensuels et assurances', group: 'Copropriété', types: ['vente_residentielle'], when: s => !!(s.condo_divise || s.condo_indivise) },
  { id: 'req_gestion', label: 'REQ de l’entreprise de gestion de la copropriété', group: 'Copropriété', types: ['vente_residentielle', 'achat'], when: s => !!(s.condo_divise || s.condo_indivise) },
  // Promesse et conditions
  { id: 'pa', label: 'Promesse d’achat acceptée (ou offre de location / convention de bail)', group: 'Promesse et conditions', types: ['achat', 'location_locataire', 'commercial_vente', 'commercial_location', 'vente_entreprise'] },
  { id: 'contre_propositions', label: 'Contre-propositions et modifications — s’il y a lieu', group: 'Promesse et conditions', types: ['achat', 'commercial_vente', 'vente_entreprise'] },
  { id: 'pa_refusees', label: 'Propositions de transaction refusées', group: 'Promesse et conditions', types: ['commercial_vente', 'commercial_location', 'vente_entreprise'] },
  { id: 'accuse_dv', label: 'Accusé de réception des déclarations du vendeur par l’acheteur', group: 'Promesse et conditions', types: ['achat'] },
  { id: 'financement', label: 'Acceptation hypothécaire avec accusé de réception', group: 'Promesse et conditions', types: ['achat'], when: s => !!s.financement },
  { id: 'inspection', label: 'Rapport d’inspection', group: 'Promesse et conditions', types: ['achat'], when: s => !!s.inspection },
  { id: 'avis_conditions', label: 'Avis et suivi de la réalisation des conditions', group: 'Promesse et conditions', types: ['achat', 'commercial_vente'] },
  { id: 'verif_diligente', label: 'Documents de vérification diligente', group: 'Promesse et conditions', types: ['commercial_vente'] },
  { id: 'bail_signe', label: 'Copie du bail signé par toutes les parties', group: 'Promesse et conditions', types: ['location_locataire', 'location_bailleur'] },
  { id: 'credit', label: 'Preuve de vérification de crédit — s’il y a lieu', group: 'Promesse et conditions', types: ['location_locataire', 'location_bailleur'] },
  { id: 'divulgation', label: 'Avis de divulgation (intérêt, lien avec une partie) — s’il y a lieu', group: 'Promesse et conditions', types: 'all' },
  // Fidéicommis
  { id: 'cheque_depot', label: 'Copie du chèque d’acompte déposé en fidéicommis', group: 'Fidéicommis', types: 'all', when: s => !!s.depot },
  { id: 'recu_depot', label: 'Reçu remis au déposant', group: 'Fidéicommis', types: 'all', when: s => !!s.depot },
  { id: 'retrait', label: 'Preuve de retrait du compte en fidéicommis (chèque ou virement)', group: 'Fidéicommis', types: 'all', when: s => !!s.depot },
  // Autres
  { id: 'partage', label: 'Entente de référencement / divulgation du partage de rétribution', group: 'Autres', types: 'all', when: s => !!s.partage },
  { id: 'correspondance', label: 'Correspondance et documents afférents (facturation, confidentialité…)', group: 'Autres', types: ['commercial_vente', 'commercial_location', 'vente_entreprise'] },
]

export const defaultDocType = (d: Deal): DocType => (d.docType as DocType) || (d.kind === 'achat' ? 'achat' : 'vente_residentielle')

export function requiredDocs(d: Deal) {
  const type = defaultDocType(d)
  const s = d.situation ?? {}
  return DOCS.filter(x => (x.types === 'all' || x.types.includes(type)) && (!x.when || x.when(s)))
}

export function docProgress(d: Deal) {
  const req = requiredDocs(d)
  const st = d.docs ?? {}
  const done = req.filter(x => st[x.id] === 'inclus' || st[x.id] === 'na')
  const missing = req.filter(x => !(st[x.id] === 'inclus' || st[x.id] === 'na'))
  return { total: req.length, done: done.length, pct: req.length ? Math.round((done.length / req.length) * 100) : 100, missing, pending: req.filter(x => st[x.id] === 'a_venir') }
}

export const STATUS_LABEL: Record<DocStatus, string> = { inclus: 'Inclus', a_venir: 'À venir', na: 'N/A', manquant: 'Manquant' }

/** Rappel des obligations de tenue de dossier (paraphrasé) joint aux avis. */
export const RECORD_KEEPING_NOTE = 'Rappel : le courtier doit transmettre sans délai à l’agence tous les documents servant à l’exécution du contrat de courtage et à la réalisation de la transaction, ainsi que ceux démontrant l’exactitude des renseignements fournis (Règlement sur les dossiers, livres et registres; Règlement sur la déontologie des courtiers — OACIQ).'

// ---------- Fiche de suivi ----------
export interface TrackField { key: string; label: string; type?: 'text' | 'date' | 'check' | 'select' | 'money'; options?: string[]; side?: 'vente' | 'achat' }
export const TRACKING: { section: string; fields: TrackField[] }[] = [
  { section: 'Références', fields: [
    { key: 'mls', label: 'No Centris / MLS' }, { key: 'backoffice', label: 'No de dossier (logiciel de l’agence)' }, { key: 'esign', label: 'No de dossier de signature électronique' },
    { key: 'cadastre', label: 'Numéro de lot (cadastre)' }, { key: 'req', label: 'No d’entreprise (REQ)' },
  ] },
  { section: 'Mandat', fields: [
    { key: 'mandat_signe', label: 'Contrat signé le', type: 'date' }, { key: 'mandat_fin', label: 'Échéance du contrat', type: 'date' },
    { key: 'garantie', label: 'Garantie légale', type: 'select', options: ['Avec garantie légale', 'Sans garantie légale', 'Aux risques et périls de l’acheteur'], side: 'vente' },
    { key: 'occupation', label: 'Occupation', type: 'select', options: ['Propriétaire occupant', 'Locataire(s)', 'Vacant'], side: 'vente' },
    { key: 'retrib_inscripteur', label: 'Rétribution inscripteur (%)' }, { key: 'retrib_collab', label: 'Rétribution collaborateur (%)' },
  ] },
  { section: 'Conformité', fields: [
    { key: 'identite_date', label: 'Identité vérifiée le', type: 'date' }, { key: 'identite_mode', label: 'Méthode de vérification', type: 'select', options: ['En personne (pièce d’identité)', 'À distance (vérification électronique)', 'Par un mandataire'] },
    { key: 'canafe', label: 'Formulaire CANAFE complété', type: 'check' }, { key: 'loi25', label: 'Consentement Loi 25 obtenu', type: 'check' },
  ] },
  { section: 'Mise en marché', fields: [
    { key: 'photographe', label: 'Photographe', side: 'vente' }, { key: 'photos_date', label: 'Séance photo le', type: 'date', side: 'vente' },
    { key: 'pancarte', label: 'No de commande pancarte', side: 'vente' }, { key: 'boite_cle', label: 'Boîte à clé installée', type: 'check', side: 'vente' },
    { key: 'video', label: 'Lien de la visite vidéo', side: 'vente' }, { key: 'portail', label: 'Portail de recherche client actif', type: 'check', side: 'achat' },
  ] },
  { section: 'Notaire et clôture', fields: [
    { key: 'notaire_nom', label: 'Notaire' }, { key: 'notaire_courriel', label: 'Courriel du notaire' }, { key: 'notaire_date', label: 'Date prévue de l’acte', type: 'date' },
    { key: 'dossier_transmis', label: 'Dossier transmis au notaire', type: 'check' }, { key: 'confirmation_notaire', label: 'Réception confirmée par le notaire', type: 'check' },
    { key: 'facture_agence', label: 'Facture de l’agence envoyée au notaire', type: 'check' },
    { key: 'retrib_recue', label: 'Rétribution reçue le', type: 'date' }, { key: 'retrib_montant', label: 'Montant reçu', type: 'money' },
    { key: 'tableau_ventes', label: 'Tableau des ventes mis à jour', type: 'check' },
  ] },
]
