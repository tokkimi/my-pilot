import { useState } from 'react'
import { Plus, ArrowRight, Download, CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import type { Operation } from '../lib/types'
import { useStore } from '../lib/store'
import { Modal, Field, MemberSelect, PageHeader } from '../lib/ui'
import { uid, isoDate } from '../lib/utils'
import { language } from '../lib/i18n'
const t = (fr:string,en:string) => language === 'en' ? en : fr
const kinds = { document:['Documents & renouvellements','Documents & renewals'], goal:['Objectifs','Goals'], request:['Demandes internes','Internal requests'], process:['Procédures & projets','Procedures & projects'] } as const
const label = (k:keyof typeof kinds) => kinds[k][language === 'en' ? 1 : 0]
export default function Operations({go}:PageProps) {
 const {db,me,upsert,remove}=useStore()
 const [tab,setTab]=useState<'overview'|'start'|Operation['kind']>('overview')
 const [edit,setEdit]=useState<Operation|null>(null)
 const [query,setQuery]=useState('')
 const [mine,setMine]=useState(false)
 const records=db.operations??[]
 const today=isoDate(new Date())
 const open=records.filter(x=>x.status!=='done')
 const overdue=open.filter(x=>x.due && x.due<today)
 const active=records.filter(x=>x.kind===tab&&(!mine||x.ownerId===me.id)&&`${x.title} ${x.notes}`.toLowerCase().includes(query.toLowerCase()))
 const onboarding:[string,boolean,Parameters<typeof go>[0]][]=[
  [t('Configurer l’agence','Set up your agency'),!!db.agency.logo,'settings'],
  [t('Inviter votre équipe','Invite your team'),db.members.filter(x=>x.active).length>1,'team'],
  [t('Importer vos contacts','Import your contacts'),db.contacts.length>0,'contacts'],
  [t('Préparer votre première inscription','Prepare your first listing'),db.listings.length>0,'listings'],
  [t('Créer votre charte graphique','Create your brand guidelines'),(db.marketingItems??[]).some(x=>x.kind==='brand'),'marketing'],
  [t('Planifier vos tâches','Plan your tasks'),db.tasks.length>0,'tasks'],
 ]
 const fresh=(kind:Operation['kind'])=>setEdit({id:uid(),kind,title:'',ownerId:me.id,due:'',status:'open',priority:'normal',notes:'',url:'',target:100,current:0,unit:'%',checklist:[]})
 const exportData=()=>{ const blob=new Blob([JSON.stringify(records,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='immopilot-pilotage.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000) }
 return <>
 <PageHeader title={t('Pilotage de l’agence','Agency operations')} subtitle={t('Vos priorités, documents et objectifs dans un espace partagé.','Your priorities, documents and goals in one shared workspace.')} actions={<button className="btn-outline" onClick={exportData}><Download size={16}/>{t('Exporter','Export')}</button>}/>
 <nav className="mb-6 flex flex-wrap gap-2">{(['overview','start',...Object.keys(kinds)] as const).map(k=><button key={k} onClick={()=>setTab(k as typeof tab)} className={tab===k?'btn-primary':'btn-outline'}>{k==='overview'?t('Vue d’ensemble','Overview'):k==='start'?t('Démarrage guidé','Getting started'):label(k as Operation['kind'])}</button>)}</nav>
 {tab==='overview'&&<>
 <div className="grid gap-4 sm:grid-cols-3 mb-6">{[[t('Éléments ouverts','Open items'),open.length],[t('Échéances dépassées','Overdue'),overdue.length],[t('Objectifs suivis','Tracked goals'),records.filter(x=>x.kind==='goal').length]].map(([name,n])=><div className="card p-5" key={name}><p>{name}</p><strong className="text-3xl">{n}</strong></div>)}</div>
 <div className="grid gap-5 lg:grid-cols-2"><section className="card p-6"><h2 className="text-xl font-semibold mb-4">{t('À traiter en priorité','Next priorities')}</h2>{open.filter(x=>x.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,8).map(x=><button key={x.id} className="flex justify-between gap-3 w-full text-left py-3 border-b border-white/50" onClick={()=>setEdit(x)}><span>{x.title}</span><span className={x.due<today?'text-rose-700':'text-slate-600'}>{x.due}</span></button>)}{!open.some(x=>x.due)&&<p>{t('Ajoutez une échéance pour la retrouver ici.','Add a due date to see it here.')}</p>}<p className="mt-4 text-sm text-slate-600">{t('Alertes visibles dans cet espace. Aucun courriel automatique n’est envoyé.','Alerts appear in this workspace. No automatic email is sent.')}</p></section>
 <section className="card p-6"><h2 className="text-xl font-semibold mb-4">{t('Vos outils de travail','Your working tools')}</h2><div className="grid gap-3 sm:grid-cols-2">{([['tasks','Tâches','Tasks'],['calendar','Calendrier','Calendar'],['finance','Comptabilité','Accounting'],['marketing','Studio marketing','Marketing Studio'],['team','Équipe','Team'],['compliance','Conformité des dossiers','File compliance']] as const).map(([p,fr,en])=><button key={p} className="btn-outline justify-between" onClick={()=>go(p)}>{t(fr,en)}<ArrowRight size={16}/></button>)}</div></section></div>
 </>}
 {tab==='start'&&<section className="card p-6"><h2 className="text-xl font-semibold mb-4">{t('Préparer votre espace','Prepare your workspace')}</h2><p className="mb-4">{onboarding.filter(x=>x[1]).length} / {onboarding.length} {t('étapes renseignées','steps populated')}</p>{onboarding.map(([name,done,page])=><button key={name} onClick={()=>go(page)} className="flex items-center gap-4 py-4 border-t border-white/60 w-full text-left"><CheckCircle2 className={done?'text-emerald-700':'text-slate-400'}/><span className="flex-1">{name}</span><ArrowRight size={18}/></button>)}</section>}
 {tab!=='overview'&&tab!=='start'&&<>
 <div className="flex flex-wrap gap-3 mb-5"><input className="input flex-1" aria-label={t('Rechercher','Search')} placeholder={t('Rechercher…','Search…')} value={query} onChange={e=>setQuery(e.target.value)}/><label className="btn-outline"><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>{t('Mes éléments','My items')}</label><button className="btn-primary" onClick={()=>fresh(tab)}><Plus size={16}/>{t('Ajouter','Add')}</button></div>
 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(x=><button key={x.id} className="card p-6 text-left" onClick={()=>setEdit(x)}><p className="text-sm text-slate-600">{x.status==='done'?t('Terminé','Done'):x.status==='progress'?t('En cours','In progress'):t('À traiter','Open')} · {db.members.find(m=>m.id===x.ownerId)?.name}</p><h2 className="text-xl font-semibold mt-2">{x.title}</h2><p className="mt-3 line-clamp-3 text-slate-600">{x.notes}</p>{x.due&&<p className={`mt-4 ${x.due<today&&x.status!=='done'?'text-rose-700':''}`}>{t('Échéance','Due')}: {x.due}</p>}{x.kind==='goal'&&<div className="mt-4"><progress className="w-full" max={Math.max(1,x.target)} value={x.current}/><p>{x.current} / {x.target} {x.unit}</p></div>}{x.checklist.length>0&&<p className="mt-3">{x.checklist.filter(c=>c.done).length}/{x.checklist.length} {t('actions terminées','actions completed')}</p>}</button>)}</div>
 {!active.length&&<div className="card p-8">{t('Aucun élément. Ajoutez votre premier suivi pour le partager avec votre équipe.','No items yet. Add your first record to share it with your team.')}</div>}
 </>}
 {edit&&<Editor key={edit.id} item={edit} close={()=>setEdit(null)} save={x=>{upsert('operations',x);setEdit(null)}} remove={()=>{if(confirm(t('Supprimer cet élément ?','Delete this item?'))){remove('operations',edit.id);setEdit(null)}}}/>}
 </>
}
function Editor({item,save,close,remove}:{item:Operation;save:(x:Operation)=>void;close:()=>void;remove:()=>void}) {
 const [v,setV]=useState(item);const [action,setAction]=useState('')
 const patch=(p:Partial<Operation>)=>setV({...v,...p})
 return <Modal title={label(v.kind)} onClose={close}><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(v.title.trim())save({...v,title:v.title.trim()})}}>
 <Field label={t('Titre','Title')}><input className="input" required maxLength={200} value={v.title} onChange={e=>patch({title:e.target.value})}/></Field>
 <Field label={t('Responsable','Owner')}><MemberSelect value={v.ownerId} onChange={ownerId=>patch({ownerId})}/></Field>
 <div className="grid grid-cols-2 gap-3"><Field label={t('Échéance','Due date')}><input type="date" className="input" value={v.due} onChange={e=>patch({due:e.target.value})}/></Field><Field label={t('Statut','Status')}><select className="input" value={v.status} onChange={e=>patch({status:e.target.value as Operation['status']})}><option value="open">{t('À traiter','Open')}</option><option value="progress">{t('En cours','In progress')}</option><option value="done">{t('Terminé','Done')}</option></select></Field></div>
 <Field label={t('Priorité','Priority')}><select className="input" value={v.priority} onChange={e=>patch({priority:e.target.value as Operation['priority']})}><option value="normal">{t('Normale','Normal')}</option><option value="high">{t('Haute','High')}</option></select></Field>
 <Field label={t('Notes et instructions','Notes and instructions')}><textarea className="input min-h-24" value={v.notes} onChange={e=>patch({notes:e.target.value})}/></Field>
 <Field label={t('Lien du document ou de la ressource','Document or resource URL')}><input className="input" type="url" placeholder="https://" value={v.url} onChange={e=>patch({url:e.target.value})}/></Field>
 {/^https?:\/\//.test(v.url)&&<a className="btn-outline" href={v.url} target="_blank" rel="noopener noreferrer">{t('Ouvrir la ressource','Open resource')}</a>}
 {v.kind==='goal'&&<div className="grid grid-cols-3 gap-3">{(['current','target'] as const).map(k=><Field key={k} label={k==='current'?t('Réalisé','Actual'):t('Cible','Target')}><input type="number" min={0} className="input" value={v[k]} onChange={e=>patch({[k]:Number(e.target.value)})}/></Field>)}<Field label={t('Unité','Unit')}><input className="input" value={v.unit} onChange={e=>patch({unit:e.target.value})}/></Field></div>}
 <div>{v.checklist.map(c=><label key={c.id} className="flex gap-3 py-2"><input type="checkbox" checked={c.done} onChange={e=>patch({checklist:v.checklist.map(a=>a.id===c.id?{...a,done:e.target.checked}:a)})}/>{c.text}</label>)}<div className="flex gap-2"><input aria-label={t('Nouvelle action','New action')} placeholder={t('Nouvelle action','New action')} className="input" value={action} onChange={e=>setAction(e.target.value)}/><button className="btn-outline" type="button" onClick={()=>{if(action.trim()){patch({checklist:[...v.checklist,{id:uid(),text:action.trim(),done:false}]});setAction('')}}}>{t('Ajouter','Add')}</button></div></div>
 <div className="flex gap-3"><button className="btn-primary" type="submit">{t('Enregistrer','Save')}</button><button className="btn-ghost" type="button" onClick={close}>{t('Annuler','Cancel')}</button><button className="btn-ghost ml-auto text-rose-700" type="button" onClick={remove}>{t('Supprimer','Delete')}</button></div>
 </form></Modal>
}
