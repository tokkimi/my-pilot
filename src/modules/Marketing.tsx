import { useState } from 'react'
import { ExternalLink, Plus, Trash2, Wand2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Post } from '../lib/types'
import { newPost } from '../lib/seed'
import { Empty, Field, ListingSelect, Modal, PageHeader } from '../lib/ui'
import { fillTemplate, fmtDate, money, copy } from '../lib/utils'

const NETWORKS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Google Business', 'Infolettre']
const STATUS: Record<Post['status'], [string, string]> = { idee: ['Idées', 'bg-slate-100'], planifie: ['Planifiés', 'bg-amber-50'], publie: ['Publiés', 'bg-emerald-50'] }
const KINDS = ['Nouveauté', 'Visite libre', 'Prix révisé', 'Vendu', 'Témoignage', 'Conseil / éducation', 'Quartier', 'Coulisses / personnel', 'Statistiques de marché']
const QUICK = [
  ['Canva', 'https://www.canva.com'], ['Meta Business', 'https://business.facebook.com'], ['Instagram', 'https://www.instagram.com'], ['TikTok Studio', 'https://www.tiktok.com/tiktokstudio'],
  ['LinkedIn', 'https://www.linkedin.com'], ['YouTube Studio', 'https://studio.youtube.com'], ['Mailchimp', 'https://login.mailchimp.com'], ['ActivePipe', 'https://live.activepipe.com/login'],
  ['Artlist', 'https://artlist.io'], ['Fiverr', 'https://www.fiverr.com'], ['Vistaprint', 'https://www.vistaprint.ca'], ['Pancarte Express', 'https://pancarteexpress.com/mon-compte/'],
]

export default function Marketing(_: PageProps) {
  const { db } = useStore()
  const [editing, setEditing] = useState<Post | null>(null)
  const posts = [...db.posts].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <div>
      <PageHeader title="Marketing & réseaux sociaux" subtitle="Calendrier de contenu, publications par inscription et outils marketing"
        actions={<button className="btn-primary" onClick={() => setEditing(newPost())}><Plus size={16} /> Publication</button>} />

      <div className="card mb-5 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Accès rapide</div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer" className="btn-outline py-1.5 text-xs"><ExternalLink size={12} /> {n}</a>)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(STATUS) as Post['status'][]).map(s => (
          <div key={s} className={`rounded-xl p-3 ${STATUS[s][1]}`}>
            <div className="mb-2 font-semibold">{STATUS[s][0]} <span className="text-slate-400">({posts.filter(p => p.status === s).length})</span></div>
            <div className="space-y-2">
              {posts.filter(p => p.status === s).map(p => (
                <button key={p.id} onClick={() => setEditing(p)} className="card block w-full p-3 text-left text-sm hover:border-brand-300">
                  <div className="flex justify-between text-xs text-slate-500"><span>{fmtDate(p.date)} · {p.format}</span><span>{p.kind}</span></div>
                  <div className="mt-1 line-clamp-3 whitespace-pre-wrap">{p.caption || <i className="text-slate-400">Sans texte</i>}</div>
                  <div className="mt-2 flex flex-wrap gap-1">{p.platforms.map(n => <span key={n} className="badge bg-brand-50 text-brand-700">{n}</span>)}</div>
                </button>
              ))}
              {posts.filter(p => p.status === s).length === 0 && <Empty>—</Empty>}
            </div>
          </div>
        ))}
      </div>
      {editing && <PostForm post={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PostForm({ post, onClose }: { post: Post; onClose: () => void }) {
  const { db, me, upsert, remove } = useStore()
  const [p, setP] = useState(post)
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setP(x => ({ ...x, [k]: v }))
  const exists = db.posts.some(x => x.id === p.id)
  const generate = () => {
    const l = db.listings.find(x => x.id === p.listingId)
    const tpl = db.templates.find(t => t.channel === 'reseaux' && t.name.toLowerCase().includes(p.kind === 'Vendu' ? 'vendu' : 'nouveauté'))
    if (!tpl) return
    set('caption', fillTemplate(tpl.body, { adresse: l?.address ?? '', ville: l?.city.replace(/\s/g, '') ?? '', chambres: String(l?.bedrooms ?? ''), sdb: String(l?.bathrooms ?? ''), prix: l ? money(l.price) : '', courtier: me.name }))
  }
  return (
    <Modal title={exists ? 'Modifier la publication' : 'Nouvelle publication'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('posts', p.id); onClose() }}><Trash2 size={15} /> Supprimer</button>}
        <button className="btn-ghost" onClick={() => copy(p.caption)}>Copier le texte</button>
        <button className="btn-primary" onClick={() => { upsert('posts', p); onClose() }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input className="input" type="date" value={p.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Statut"><select className="input" value={p.status} onChange={e => set('status', e.target.value as Post['status'])}><option value="idee">Idée</option><option value="planifie">Planifié</option><option value="publie">Publié</option></select></Field>
        <Field label="Format"><select className="input" value={p.format} onChange={e => set('format', e.target.value as Post['format'])}>{['publication', 'reel', 'story', 'video', 'infolettre'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Sujet"><select className="input" value={p.kind} onChange={e => set('kind', e.target.value)}>{KINDS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Inscription liée" className="sm:col-span-2"><ListingSelect value={p.listingId} onChange={v => set('listingId', v)} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Plateformes</span>
          <div className="flex flex-wrap gap-1.5">
            {NETWORKS.map(n => {
              const on = p.platforms.includes(n)
              return <button key={n} onClick={() => set('platforms', on ? p.platforms.filter(x => x !== n) : [...p.platforms, n])} className={`badge border px-2.5 py-1 ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200'}`}>{n}</button>
            })}
          </div>
        </div>
        <Field label="Texte / légende" className="sm:col-span-2"><textarea className="input min-h-36" value={p.caption} onChange={e => set('caption', e.target.value)} /></Field>
        <button className="btn-outline sm:col-span-2" onClick={generate}><Wand2 size={15} /> Générer depuis le modèle ({p.kind === 'Vendu' ? 'VENDU' : 'Nouveauté'})</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Rappel SOP : apporter un café au client et taguer LP dans une story; partager sur les comptes perso et pro.</p>
    </Modal>
  )
}
