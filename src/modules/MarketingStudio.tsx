import { useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, ExternalLink, Upload, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import type { MarketingItem, Post } from '../lib/types'
import { useStore } from '../lib/store'
import { Empty, Field, MemberSelect, Modal, PageHeader } from '../lib/ui'
import { saveMedia, useMediaUrl } from '../lib/media'
import { uid, isoDate, money } from '../lib/utils'
import { newPost } from '../lib/seed'
import MarketingPosts, { PostForm } from './MarketingPosts'

const SECTIONS = [['overview', 'Vue d’ensemble'], ['calendar', 'Planning éditorial'], ['posts', 'Publications'], ['campaign', 'Campagnes & publicité'], ['asset', 'Médiathèque'], ['brand', 'Charte graphique'], ['account', 'Réseaux sociaux'], ['event', 'Événements']] as const
type Section = typeof SECTIONS[number][0]
const TITLES = { campaign: 'Campagne', asset: 'Visuel ou document', brand: 'Charte graphique', account: 'Compte social', event: 'Événement' }
const CHANNELS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Google Business', 'Infolettre', 'Imprimé']
const PROVIDERS = [['Meta Business Suite', 'https://business.facebook.com/'], ['LinkedIn', 'https://www.linkedin.com/'], ['TikTok Studio', 'https://www.tiktok.com/tiktokstudio'], ['YouTube Studio', 'https://studio.youtube.com/'], ['Google Business', 'https://business.google.com/'], ['Canva', 'https://www.canva.com/']]
const STATUS = { brouillon: 'Brouillon', en_cours: 'En cours', termine: 'Terminé' }
const safeUrl = (url: string) => { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : '' } catch { return '' } }
const fresh = (kind: MarketingItem['kind'], ownerId: string): MarketingItem => ({ id: uid(), kind, title: '', ownerId, notes: '', status: 'brouillon', start: isoDate(new Date()), end: '', channels: [], budget: 0, spent: 0, objective: '', audience: '', url: '', location: '', impressions: 0, clicks: 0, leads: 0, attendees: 0, checklist: '', colors: '#2563eb, #0f172a, #ffffff', typography: '', voice: '', rights: '', expires: '' })

export default function Marketing(props: PageProps) {
  const { db, me } = useStore()
  const [section, setSection] = useState<Section>('overview')
  const [editing, setEditing] = useState<MarketingItem | null>(null)
  const [post, setPost] = useState<Post | null>(null)
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('')
  const items = db.marketingItems ?? []
  const matches = (title: string, ownerId?: string) => (!owner || ownerId === owner) && title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  const campaigns = items.filter(i => i.kind === 'campaign')
  const pending = db.posts.filter(p => p.approval === 'a_valider')
  const today = isoDate(new Date())
  const upcoming = db.posts.filter(p => p.date >= today && p.status !== 'publie').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  const collection = ['campaign', 'asset', 'brand', 'account', 'event'].includes(section) ? section as MarketingItem['kind'] : null
  return <div className="marketing-studio">
    <PageHeader title="Studio marketing" subtitle={`${db.agency.name} · Préparez et coordonnez votre communication`}
      actions={<button className="btn-primary" onClick={() => collection ? setEditing(fresh(collection, me.id)) : setPost(newPost({ ownerId: me.id }))}><Plus size={17} /> {collection ? TITLES[collection] : 'Publication'}</button>} />
    <nav aria-label="Studio marketing" className="mb-6 flex flex-wrap gap-2">{SECTIONS.map(([k, label]) => <button key={k} aria-current={section === k ? 'page' : undefined} className={section === k ? 'btn-primary' : 'btn-outline'} onClick={() => { setSection(k); setQuery(''); setOwner('') }}>{label}</button>)}</nav>
    {section === 'overview' && <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        ['À valider', pending.length], ['Publications planifiées', db.posts.filter(p => p.status === 'planifie').length], ['Budget des campagnes', money(campaigns.reduce((s, c) => s + c.budget, 0))], ['Dépenses déclarées', money(campaigns.reduce((s, c) => s + c.spent, 0))],
      ].map(([label, value]) => <div key={label} className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="card p-5"><h2 className="mb-4 text-xl font-semibold">Prochaines publications</h2>{upcoming.length ? upcoming.map(p => <button key={p.id} className="block w-full border-b border-slate-100 py-3 text-left" onClick={() => setPost(p)}><span className="text-sm text-slate-500">{p.date} {p.time} · {p.platforms.join(', ')}</span><p className="line-clamp-2">{p.caption || p.kind}</p></button>) : <Empty>Aucune publication à venir. Préparez votre premier contenu.</Empty>}</section>
      <section className="card p-5"><h2 className="mb-4 text-xl font-semibold">Validation de l’équipe</h2>{pending.length ? pending.map(p => <button key={p.id} className="block w-full border-b border-slate-100 py-3 text-left" onClick={() => setPost(p)}>{p.caption || p.kind}<p className="text-sm text-slate-500">{db.members.find(m => m.id === p.ownerId)?.name || 'Sans responsable'}</p></button>) : <Empty>Aucun contenu en attente de validation.</Empty>}</section></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.filter(i => i.kind === 'event' && i.start >= today && i.status !== 'termine').slice(0, 3).map(i => <ItemCard key={i.id} item={i} onEdit={() => setEditing(i)} />)}</div>
    </>}
    {section === 'posts' && <MarketingPosts {...props} />}
    {section === 'calendar' && <EditorialCalendar posts={db.posts} events={items.filter(i => i.kind === 'event')} onPost={setPost} onEvent={setEditing} />}
    {collection && <>
      {section === 'account' && <section className="card mb-5 p-5"><h2 className="text-xl font-semibold">Vos comptes et outils de publication</h2><p className="my-3 text-slate-600">Référencez les comptes de l’agence et leur responsable. La connexion OAuth, la publication automatique et la synchronisation des statistiques ne sont pas encore activées. Les liens ouvrent les outils officiels.</p><div className="flex flex-wrap gap-2">{PROVIDERS.map(([name, url]) => <a key={name} className="btn-outline" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{name}</a>)}</div></section>}
      {section === 'campaign' && <p className="mb-4 text-slate-600">Préparez vos briefs, audiences, budgets et créations. Les résultats sont saisis par l’équipe ; aucune dépense publicitaire n’est engagée ici.</p>}
      <div className="mb-4 flex flex-wrap gap-3"><input aria-label="Rechercher dans le studio" className="input max-w-md" placeholder="Rechercher…" value={query} onChange={e => setQuery(e.target.value)} /><select className="input max-w-xs" aria-label="Filtrer par responsable" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Tous les responsables</option>{db.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.filter(i => i.kind === collection && matches(i.title, i.ownerId)).map(i => <ItemCard key={i.id} item={i} onEdit={() => setEditing(i)} />)}</div>
      {!items.some(i => i.kind === collection && matches(i.title, i.ownerId)) && <Empty>Aucun élément{query || owner ? ' ne correspond à ces filtres' : ' pour le moment'}. Utilisez « {TITLES[collection]} » pour commencer.</Empty>}
    </>}
    {editing && <ItemForm item={editing} onClose={() => setEditing(null)} />}
    {post && <PostForm post={post} onClose={() => setPost(null)} />}
  </div>
}

function ItemCard({ item: i, onEdit }: { item: MarketingItem; onEdit: () => void }) {
  const { db } = useStore()
  const mediaUrl = useMediaUrl(i.media)
  return <article className="card overflow-hidden">
    {i.media?.mime.startsWith('image/') && mediaUrl && <img src={mediaUrl} alt={i.title} className="h-44 w-full object-cover" loading="lazy" />}
    <div className="p-5"><button onClick={onEdit} className="text-left text-lg font-semibold hover:text-brand-600">{i.title}</button><p className="mt-1 text-sm text-slate-500">{i.kind === 'account' ? 'Référencé · connexion API inactive' : STATUS[i.status]} · {db.members.find(m => m.id === i.ownerId)?.name || 'Sans responsable'}</p>
      {i.kind === 'campaign' && <><p className="mt-3">{i.objective}</p><p className="my-2 text-sm">{money(i.spent)} dépensés / {money(i.budget)} prévus</p><progress className="w-full accent-blue-600" max={Math.max(i.budget, i.spent, 1)} value={i.spent} aria-label="Budget consommé" /><p className="mt-2 text-sm">{i.impressions} impressions · {i.clicks} clics · {i.leads} prospects</p><p className="text-sm text-slate-500">CTR : {i.impressions ? (i.clicks / i.impressions * 100).toFixed(2) + ' %' : '—'} · Coût / prospect : {i.leads ? money(i.spent / i.leads) : '—'}</p></>}
      {i.kind === 'brand' && <><div className="my-4 flex flex-wrap gap-2">{i.colors.split(',').map(c => c.trim()).filter(c => /^#[0-9a-f]{6}$/i.test(c)).map((c, ix) => <div key={ix}><div className="h-10 w-14 rounded-lg border border-slate-200" style={{ background: c }} /><span className="text-sm">{c}</span></div>)}</div><p>{i.typography}</p><p className="mt-2 text-sm text-slate-600">{i.voice}</p></>}
      {i.kind === 'event' && <><p className="mt-3">{i.start} {i.end && `— ${i.end}`}</p><p>{i.location}</p><p className="text-sm text-slate-500">{i.attendees} participants · {money(i.budget)} de budget</p></>}
      {i.kind === 'asset' && <><p className="mt-3 text-sm">{i.rights || 'Droits d’utilisation à préciser'}</p>{i.expires && <p className={i.expires < isoDate(new Date()) ? 'text-rose-700' : 'text-slate-500'}>Droits jusqu’au {i.expires}</p>}</>}
      <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{i.notes}</p>
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-outline" onClick={onEdit}>Ouvrir</button>{safeUrl(i.url) && <a className="btn-outline" href={safeUrl(i.url)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Lien</a>}{mediaUrl && <a className="btn-outline" href={mediaUrl} target="_blank" rel="noreferrer">Fichier</a>}</div>
    </div>
  </article>
}

function EditorialCalendar({ posts, events, onPost, onEvent }: { posts: Post[]; events: MarketingItem[]; onPost: (p: Post) => void; onEvent: (i: MarketingItem) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [channel, setChannel] = useState('')
  const offset = (month.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return <section className="card p-4 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold capitalize">{month.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })}</h2><div className="flex items-center gap-2"><select aria-label="Filtrer le planning par réseau" className="input" value={channel} onChange={e => setChannel(e.target.value)}><option value="">Tous les réseaux</option>{CHANNELS.map(c => <option key={c}>{c}</option>)}</select><button className="btn-outline" aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button><button className="btn-outline" aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button></div></div>
    <div className="overflow-x-auto"><div className="grid min-w-[700px] grid-cols-7 gap-1">{['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(d => <div className="p-2 text-sm text-slate-500" key={d}>{d}</div>)}{Array.from({ length: offset }, (_, n) => <div key={`blank${n}`} />)}{Array.from({ length: days }, (_, n) => {
      const date = isoDate(new Date(month.getFullYear(), month.getMonth(), n + 1))
      return <div key={date} className={`min-h-32 rounded-xl border p-2 ${date === isoDate(new Date()) ? 'border-blue-400 bg-blue-50/50' : 'border-slate-100'}`}><button className="mb-2 flex w-full justify-between text-sm" aria-label={`Créer une publication le ${date}`} onClick={() => onPost(newPost({ date }))}>{n + 1}<Plus size={14} /></button>{posts.filter(p => p.date === date && (!channel || p.platforms.includes(channel))).map(p => <button key={p.id} className={`mb-1 block w-full rounded-lg p-2 text-left text-sm ${p.status === 'publie' ? 'bg-emerald-50 text-emerald-900' : 'bg-blue-50 text-blue-900'}`} onClick={() => onPost(p)}><span className="line-clamp-2">{p.time} {p.caption || p.kind}</span><span className="text-xs">{p.platforms.join(', ')}</span></button>)}{events.filter(i => i.start.slice(0, 10) === date && (!channel || i.channels.includes(channel))).map(i => <button key={i.id} className="mb-1 block w-full rounded-lg bg-amber-50 p-2 text-left text-sm" onClick={() => onEvent(i)}>Événement · {i.title}</button>)}</div>
    })}</div></div><p className="mt-4 text-sm text-slate-500">Cliquez sur un jour pour préparer un contenu. La mise en ligne reste manuelle.</p>
  </section>
}

function ItemForm({ item, onClose }: { item: MarketingItem; onClose: () => void }) {
  const { db, mode, upsert, remove } = useStore()
  const [i, setI] = useState(item)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof MarketingItem>(k: K, v: MarketingItem[K]) => setI(old => ({ ...old, [k]: v }))
  const exists = (db.marketingItems ?? []).some(x => x.id === i.id)
  const text = (key: 'title' | 'objective' | 'audience' | 'url' | 'location' | 'colors' | 'typography' | 'voice' | 'rights' | 'checklist' | 'notes', label: string, multiline = false) => <Field label={label}>{multiline ? <textarea className="input min-h-28" value={i[key]} onChange={e => set(key, e.target.value)} /> : <input className="input" type={key === 'url' ? 'url' : 'text'} value={i[key]} onChange={e => set(key, e.target.value)} />}</Field>
  const num = (key: 'budget' | 'spent' | 'impressions' | 'clicks' | 'leads' | 'attendees', label: string) => <Field label={label}><input className="input" min="0" type="number" step={key === 'budget' || key === 'spent' ? '0.01' : '1'} value={i[key]} onChange={e => set(key, Math.max(0, Number(e.target.value)))} /></Field>
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true); setError('')
    try { const media = await saveMedia(file, file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'document', file.name, mode === 'remote'); setI(old => ({ ...old, title: old.title || file.name, media })) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Modal title={TITLES[i.kind]} onClose={onClose} wide footer={<>
    {exists && <button className="btn-ghost mr-auto text-rose-700" onClick={() => { if (confirm('Retirer cet élément du studio ? Le fichier source sera conservé.')) { remove('marketingItems', i.id); onClose() } }}><Trash2 size={16} /> Retirer</button>}
    <button className="btn-outline" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy || !i.title.trim()} onClick={() => { if (i.url && !safeUrl(i.url)) { setError('Utilisez un lien http ou https valide.'); return } if (i.end && i.end < i.start) { setError('La fin doit être après le début.'); return } upsert('marketingItems', i); onClose() }}>Enregistrer</button>
  </>}><div className="grid gap-4 sm:grid-cols-2">{text('title', i.kind === 'account' ? 'Nom du compte / identifiant public' : 'Nom')}
    <Field label="Responsable"><MemberSelect value={i.ownerId} onChange={v => set('ownerId', v)} allowEmpty /></Field>
    {i.kind !== 'account' && <Field label="Statut"><select className="input" value={i.status} onChange={e => set('status', e.target.value as MarketingItem['status'])}>{Object.entries(STATUS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></Field>}
    {['campaign', 'event'].includes(i.kind) && <><Field label="Début"><input className="input" type="date" value={i.start} onChange={e => set('start', e.target.value)} /></Field><Field label="Fin"><input className="input" type="date" min={i.start} value={i.end} onChange={e => set('end', e.target.value)} /></Field>{text('objective', 'Objectif', true)}{text('audience', 'Audience / public', true)}{num('budget', 'Budget prévu ($ CA)')}{num('spent', 'Dépenses engagées ($ CA)')}{text('checklist', 'Plan d’action et checklist', true)}</>}
    {i.kind === 'campaign' && <>{num('impressions', 'Impressions (saisie manuelle)')}{num('clicks', 'Clics (saisie manuelle)')}{num('leads', 'Prospects générés (saisie manuelle)')}</>}
    {i.kind === 'event' && <>{text('location', 'Lieu et horaire')}{num('attendees', 'Nombre de participants')}</>}
    {i.kind === 'brand' && <>{text('colors', 'Couleurs hexadécimales séparées par une virgule')}{text('typography', 'Polices et règles typographiques')}{text('voice', 'Ton de voix et messages clés', true)}{text('rights', 'Règles d’utilisation du logo', true)}</>}
    {i.kind === 'asset' && <>{text('rights', 'Crédit, licence et autorisations', true)}<Field label="Expiration des droits"><input className="input" type="date" value={i.expires} onChange={e => set('expires', e.target.value)} /></Field></>}
    {['asset', 'brand'].includes(i.kind) && <Field label="Fichier / logo"><div className="rounded-xl border border-dashed p-4"><Upload size={20} className="mb-2" /><input aria-label="Ajouter un fichier au studio" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf" onChange={e => void upload(e.target.files?.[0])} /><p className="mt-2 text-sm">{busy ? 'Téléversement…' : i.media?.name || 'Photos, vidéos, logos ou PDF'}</p></div></Field>}
    {text('url', i.kind === 'account' ? 'Lien public du profil ou de la page' : 'Lien du brief, modèle Canva ou ressource')}
    {i.kind !== 'brand' && <fieldset className="sm:col-span-2"><legend className="label">Canaux</legend><div className="flex flex-wrap gap-3">{CHANNELS.map(c => <label key={c} className="text-sm"><input type="checkbox" checked={i.channels.includes(c)} onChange={e => set('channels', e.target.checked ? [...i.channels, c] : i.channels.filter(x => x !== c))} /> {c}</label>)}</div></fieldset>}
    <div className="sm:col-span-2">{text('notes', i.kind === 'account' ? 'Consignes d’accès (aucun mot de passe ni jeton)' : 'Brief, notes et retours', true)}</div>
  </div>{error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}</Modal>
}
