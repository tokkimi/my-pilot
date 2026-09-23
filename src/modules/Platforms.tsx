import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Platform } from '../lib/types'
import { Field, Modal, PageHeader } from '../lib/ui'
import { uid } from '../lib/utils'

const favicon = (url: string) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64` } catch { return '' } }

export default function Platforms(_: PageProps) {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Platform | null>(null)
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
                  {p.account && <div className="mt-1 truncate text-xs"><span className="text-slate-400">Compte :</span> {p.account}</div>}
                </div>
                <button className="btn-ghost p-1 opacity-0 group-hover:opacity-100" onClick={() => setEditing(p)}><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {editing && <PlatformForm p={editing} onClose={() => setEditing(null)} />}
    </div>
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
