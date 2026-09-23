import OAuthConnections from './OAuthConnections'
import CalendlyPanel from './CalendlyPanel'
import { useState } from 'react'
import { Link2, ExternalLink, Search } from 'lucide-react'
import { PageHeader } from '../lib/ui'
import { PLATFORM_CATALOG, logoUrl } from '../lib/platforms'
import type { PageProps } from '../App'
import { language } from '../lib/i18n'
const t=(fr:string,en:string)=>language==='en'?en:fr
export default function Connections({go}:PageProps){
 const [query,setQuery]=useState('')
 const social=['facebook','instagram','linkedin','tiktok','youtube','pinterest','twitter','google business']
 const list=PLATFORM_CATALOG.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
 return <>
 <PageHeader title={t('Centre de connexions','Connection center')} subtitle={t('Retrouvez les accès disponibles et l’état des intégrations.','Find available access and integration status.')}/>
 <OAuthConnections/><CalendlyPanel/><section className="card p-6 mb-6"><h2 className="text-xl font-semibold">{t('Comptes sociaux de votre agence','Your agency’s social accounts')}</h2><p className="mt-3 text-slate-600">{t('La connexion des réseaux, la publication directe et la programmation automatique nécessitent encore l’activation du service de publication par ImmoPilot. Vos brouillons et validations restent disponibles dans le Studio marketing.','Social connections, direct publishing and automatic scheduling still require ImmoPilot to activate the publishing service. Drafts and approvals remain available in Marketing Studio.')}</p><button className="btn-primary mt-4" onClick={()=>go('marketing')}>{t('Ouvrir le Studio marketing','Open Marketing Studio')}</button></section>
 <section className="card p-6 mb-6"><div className="flex items-center gap-3"><Link2/><h2 className="text-xl font-semibold">Google Drive & Agenda</h2></div><p className="my-3">{t('Connexion personnelle autorisée par votre agence. Consultez l’état réel de configuration et les permissions dans l’espace Google.','Personal connection authorized by your agency. View actual configuration status and permissions in the Google workspace.')}</p><button className="btn-outline" onClick={()=>go('google')}>{t('Gérer la connexion Google','Manage Google connection')}</button></section>
 <div className="relative mb-5"><Search className="absolute left-3 top-3" size={18}/><input className="input pl-10" aria-label={t('Rechercher une plateforme','Search platforms')} placeholder={t('Rechercher une plateforme','Search platforms')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map(p=><article key={p.key} className="card p-5"><div className="flex items-center gap-3"><img src={logoUrl(p.domain,64)} alt="" className="w-10 h-10 object-contain"/><h2 className="text-lg font-semibold">{p.name}</h2></div><p className="mt-4 text-sm font-medium">{social.some(s=>p.name.toLowerCase().includes(s))?t('Publication automatique non activée','Automatic publishing not activated'):t('Accès externe — connexion non intégrée','External access — connection not integrated')}</p><p className="mt-2 text-slate-600">{p.usage}</p><a className="btn-outline mt-4" href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t('Ouvrir la plateforme','Open platform')}</a></article>)}</div>
 </>
}


