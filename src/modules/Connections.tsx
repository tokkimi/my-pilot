import PropertyImport from './PropertyImport'
import OAuthConnections from './OAuthConnections'
import CalendlyPanel from './CalendlyPanel'
import { useState } from 'react'
import { Link2, ExternalLink, Search } from 'lucide-react'
import { PageHeader, Modal } from '../lib/ui'
import { PLATFORM_CATALOG, logoUrl, type PlatformGuide } from '../lib/platforms'
import type { Page, PageProps } from '../App'
import { language } from '../lib/i18n'
const t=(fr:string,en:string)=>language==='en'?en:fr
export default function Connections({go}:PageProps){
 const [query,setQuery]=useState('')
 const [active,setActive]=useState<PlatformGuide|null>(null)
 const providerKeys=['facebook','instagram','canva','calendly','linkedin']
 const internalPage=(p:PlatformGuide):Page=>p.category==='Marketing'||p.category==='Réseaux sociaux'?'marketing':p.category==='Prospection'?'contacts':p.category==='Inscriptions & transactions'?'operations':'guides'
 const social=['facebook','instagram','linkedin','tiktok','youtube','pinterest','twitter','google business']
 const list=PLATFORM_CATALOG.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
 const native: [Page,string,string][] = [
  ['contacts',t('CRM & contacts','CRM & contacts'),t('Fiches clients, historique et import CSV.','Client records, history and CSV import.')],
  ['calendar',t('Agenda d’équipe','Team calendar'),t('Organisez les événements dans ImmoPilot.','Organize events in ImmoPilot.')],
  ['marketing',t('Studio marketing','Marketing Studio'),t('Brouillons, planning éditorial, validations, campagnes, médiathèque et charte graphique. La diffusion externe exige une connexion.','Drafts, editorial planning, approvals, campaigns, media and brand guidelines. External publishing requires a connection.')],
  ['operations',t('Pilotage de l’agence','Agency operations'),t('Objectifs, demandes, documents et listes de contrôle.','Goals, requests, documents and checklists.')],
  ['guides',t('Vos guides clients','Your client guides'),t('Ajoutez ou remplacez vos guides et fichiers à tout moment.','Add or replace your guides and files at any time.')],
  ['sop',t('Vos procédures & trames','Your procedures & scripts'),t('Personnalisez les méthodes de travail de votre agence.','Customize your agency’s working methods.')],
  ['finance',t('Suivi comptable','Accounting records'),t('Revenus, dépenses, devis et factures.','Income, expenses, quotes and invoices.')],
  ['visits',t('Visites terrain','Property visits'),t('Notes, médias et dossiers de visite.','Notes, media and visit records.')],
 ]
 return <>
 <PageHeader title={t('Centre de connexions','Connection center')} subtitle={t('Retrouvez les accès disponibles et l’état des intégrations.','Find available access and integration status.')}/>
 <section className="mb-8"><h2 className="text-xl font-semibold mb-2">{t('Travaillez directement dans ImmoPilot','Work directly in ImmoPilot')}</h2><p className="mb-4 text-slate-600">{t('Ces outils fonctionnent sans compte sur une autre plateforme.','These tools work without an account on another platform.')}</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{native.map(([page,name,description])=><button key={page} className="card p-4 text-left" onClick={()=>go(page)}><span className="font-semibold">{name}</span><span className="block mt-2 text-sm text-slate-600">{description}</span></button>)}</div></section>
 <PropertyImport/><OAuthConnections/><CalendlyPanel/><section className="card p-6 mb-6"><h2 className="text-xl font-semibold">{t('Comptes sociaux de votre agence','Your agency’s social accounts')}</h2><p className="mt-3 text-slate-600">{t('La connexion des réseaux, la publication directe et la programmation automatique nécessitent encore l’activation du service de publication par ImmoPilot. Vos brouillons et validations restent disponibles dans le Studio marketing.','Social connections, direct publishing and automatic scheduling still require ImmoPilot to activate the publishing service. Drafts and approvals remain available in Marketing Studio.')}</p><button className="btn-primary mt-4" onClick={()=>go('marketing')}>{t('Ouvrir le Studio marketing','Open Marketing Studio')}</button></section>
 <section className="card p-6 mb-6"><div className="flex items-center gap-3"><Link2/><h2 className="text-xl font-semibold">Google Drive & Agenda</h2></div><p className="my-3">{t('Connexion personnelle autorisée par votre agence. Consultez l’état réel de configuration et les permissions dans l’espace Google.','Personal connection authorized by your agency. View actual configuration status and permissions in the Google workspace.')}</p><button className="btn-outline" onClick={()=>go('google')}>{t('Gérer la connexion Google','Manage Google connection')}</button></section>
 <div className="relative mb-5"><Search className="absolute left-3 top-3" size={18}/><input className="input pl-10" aria-label={t('Rechercher une plateforme','Search platforms')} placeholder={t('Rechercher une plateforme','Search platforms')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map(p=><article key={p.key} className="card p-5"><div className="flex items-center gap-3"><img src={logoUrl(p.domain,64)} alt="" className="w-10 h-10 object-contain"/><h2 className="text-lg font-semibold">{p.name}</h2></div><p className="mt-4 text-sm font-medium">{social.some(s=>p.name.toLowerCase().includes(s))?t('Publication automatique non activée','Automatic publishing not activated'):t('Accès externe — connexion non intégrée','External access — connection not integrated')}</p><p className="mt-2 text-slate-600">{p.usage}</p><button className="btn-primary mt-4" onClick={()=>setActive(p)}>{t('Gérer dans ImmoPilot','Manage in ImmoPilot')}</button></article>)}</div>
 {active&&<Modal title={active.name} onClose={()=>setActive(null)} wide><div className="p-5 space-y-5"><p>{active.what}</p>{providerKeys.includes(active.key)?<section><h3 className="font-semibold">{t('Connexion personnelle','Personal connection')}</h3><p className="my-3">{t('Votre compte est autorisé pour votre profil et votre agence. Les fonctions accessibles dépendent des permissions accordées et de l’activation du fournisseur.','Your account is authorized for your profile and agency. Available actions depend on permissions and provider activation.')}</p><button className="btn-primary" onClick={()=>{setActive(null);document.getElementById('oauth-connections')?.scrollIntoView({behavior:'smooth'})}}>{t('Gérer ma connexion','Manage my connection')}</button></section>:<p className="rounded-xl bg-amber-50 p-3 text-amber-950">{t('Le raccordement direct de cette plateforme n’est pas encore disponible. Les outils ImmoPilot restent utilisables ci-dessous.','Direct integration with this platform is not available yet. ImmoPilot tools remain available below.')}</p>}<section><h3 className="font-semibold">{t('Travailler dans mon espace','Work in my workspace')}</h3><p className="my-3">{active.integration.text}</p><button className="btn-outline" onClick={()=>{go(internalPage(active));setActive(null)}}>{t('Ouvrir les outils ImmoPilot','Open ImmoPilot tools')}</button></section><section><h3 className="font-semibold">{t('Parcours de travail','Workflow')}</h3><ol className="list-decimal pl-5 space-y-2 mt-3">{active.how.map(step=><li key={step}>{step}</li>)}</ol></section>{active.url&&<a className="btn-ghost" href={active.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t('Site du fournisseur · nouvel onglet','Provider website · new tab')}</a>}</div></Modal>}
 </>
}


