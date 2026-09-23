import { useState } from 'react'
import { BookOpen, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { guideFor, logoUrl, type PlatformGuide } from '../lib/platforms'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Platform } from '../lib/types'
import { Field, Modal, PageHeader } from '../lib/ui'
import { uid } from '../lib/utils'

const favicon = (url: string) => { try { return logoUrl(new URL(url).hostname, 64) } catch { return '' } }

export default function Platforms(_: PageProps) {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Platform | null>(null)
  const [guide, setGuide] = useState<{ g: PlatformGuide; p: Platform } | null>(null)
  const list = db.platforms.filter(p => !q || `${p.name} ${p.usage} ${p.category} ${p.account}`.toLowerCase().includes(q.toLowerCase()))
  const cats = [...new Set(list.map(p => p.category))]
  return (
    <div>
      <PageHeader title="Plateformes" subtitle="Tous les outils de l’agence au même endroit — un clic pour ouvrir"
        actions={<button className="btn-primary" onClick={() => setEditing({ id: uid(), name: '', url: '', category: 'Autre', account: '', notes: '', usage: '' })}><Plus size={16} /> Plateforme</button>} />
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        🔐 Ne conservez <b>jamais de mots de passe</b> ici. Le champ « compte » sert à noter quel identifiant utiliser (ex. marketing@…). Utilisez un gestionnaire de mots de passe partagé (1Password, Bitwarden) pour l’équipe.
      </div>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="input pl-9" placeholder="Rechercher une plateforme…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {cats.map(cat => (
        <section key={cat} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.filter(p => p.category === cat).map(p => (
              <div key={p.id} className="card group flex items-start gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  {p.url ? <img src={favicon(p.url)} alt="" className="h-6 w-6" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span>🔗</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="truncate font-semibold hover:text-brand-700">{p.name}</a> : <span className="truncate font-semibold">{p.name}</span>}
                    {p.url && <ExternalLink size={12} className="shrink-0 text-slate-400" />}
                  </div>
                  <div className="text-xs text-slate-500">{p.usage}</div>
                  {guideFor(p) && <button className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => setGuide({ g: guideFor(p)!, p })}><BookOpen size={12} /> Guide d’utilisation</button>}
                  {p.account && <div className="mt-1 truncate text-xs"><span className="text-slate-400">Compte :</span> {p.account}</div>}
                </div>
                <button className="btn-ghost p-1 opacity-0 group-hover:opacity-100" onClick={() => setEditing(p)}><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {editing && <PlatformForm p={editing} onClose={() => setEditing(null)} />}
      {guide && <GuideModal g={guide.g} p={guide.p} onClose={() => setGuide(null)} onEdit={() => { setEditing(guide.p); setGuide(null) }} />}
    </div>
  )
}

const LEVEL: Record<PlatformGuide['integration']['level'], [string, string]> = { lien: ['Accès en un clic', 'bg-slate-100 text-slate-700'], export: ['Import / export CSV', 'bg-sky-100 text-sky-700'], api: ['Intégration API', 'bg-emerald-100 text-emerald-700'] }

function GuideModal({ g, p, onClose, onEdit }: { g: PlatformGuide; p: Platform; onClose: () => void; onEdit: () => void }) {
  return (
    <Modal title={`Guide — ${g.name}`} onClose={onClose} footer={<>
      <button className="btn-ghost mr-auto" onClick={onEdit}><Pencil size={14} /> Modifier le compte / les notes</button>
      {(p.url || g.url) && <a className="btn-primary" href={p.url || g.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ouvrir {g.name}</a>}
    </>}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          {g.domain && <img src={logoUrl(g.domain)} alt="" className="h-10 w-10 rounded" onError={e => { e.currentTarget.style.display = 'none' }} />}
          <div><div className="font-semibold">{g.category}</div><span className={`badge ${LEVEL[g.integration.level][1]}`}>{LEVEL[g.integration.level][0]}</span></div>
        </div>
        <div><h3 className="mb-1 font-semibold">C’est quoi?</h3><p className="text-slate-700">{g.what}</p></div>
        <div><h3 className="mb-1 font-semibold">Quand l’utiliser dans nos processus</h3><ul className="list-disc space-y-1 pl-5 text-slate-700">{g.when.map(x => <li key={x}>{x}</li>)}</ul></div>
        <div><h3 className="mb-1 font-semibold">Comment faire</h3><ol className="list-decimal space-y-1 pl-5 text-slate-700">{g.how.map(x => <li key={x}>{x}</li>)}</ol></div>
        {g.tips && <div className="rounded-lg bg-amber-50 p-3 text-amber-900">💡 {g.tips.join(' ')}</div>}
        <div className="rounded-lg bg-brand-50 p-3 text-brand-700"><b>Avec ImmoPilot :</b> {g.integration.text}</div>
        {p.account && <p className="text-slate-600">Compte utilisé : <b>{p.account}</b></p>}
        {p.notes && <p className="whitespace-pre-wrap text-slate-600">{p.notes}</p>}
        {g.source && <p className="text-xs text-slate-400">Source : <a className="underline" href={g.source} target="_blank" rel="noreferrer">{g.source}</a></p>}
      </div>
    </Modal>
  )
}

function PlatformForm({ p: init, onClose }: { p: Platform; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [p, setP] = useState(init)
  const set = <K extends keyof Platform>(k: K, v: Platform[K]) => setP(x => ({ ...x, [k]: v }))
  const exists = db.platforms.some(x => x.id === p.id)
  return (
    <Modal title={exists ? p.name : 'Nouvelle plateforme'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('platforms', p.id); onClose() }}><Trash2 size={15} /> Retirer</button>}
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { if (p.name) { upsert('platforms', p); onClose() } }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom"><input className="input" value={p.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Catégorie"><input className="input" list="pcats" value={p.category} onChange={e => set('category', e.target.value)} />
          <datalist id="pcats">{[...new Set(db.platforms.map(x => x.category))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="URL de connexion" className="sm:col-span-2"><input className="input" value={p.url} onChange={e => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Compte / identifiant utilisé (pas de mot de passe)" className="sm:col-span-2"><input className="input" value={p.account} onChange={e => set('account', e.target.value)} /></Field>
        <Field label="Utilisation" className="sm:col-span-2"><input className="input" value={p.usage} onChange={e => set('usage', e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" value={p.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
