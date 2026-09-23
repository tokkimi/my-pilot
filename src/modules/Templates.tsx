import { tr } from '../lib/i18n'
import { useRef, useState } from 'react'
import { Copy, Plus, Send, Trash2 } from 'lucide-react'
import SendTemplate from '../components/SendTemplate'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Template } from '../lib/types'
import { Field, Modal, PageHeader } from '../lib/ui'
import { copy, fromFriendly, toFriendly, uid, VAR_LABELS } from '../lib/utils'

const CH = { courriel: '✉️ Courriel', texto: '💬 Texto', reseaux: '📣 Réseaux sociaux' }

export default function Templates(_: PageProps) {
  const { db } = useStore()
  const [editing, setEditing] = useState<Template | null>(null)
  const [ch, setCh] = useState('')
  const [using, setUsing] = useState<Template | null>(null)
  const cats = [...new Set(db.templates.map(t => t.category))]
  const list = db.templates.filter(t => !ch || t.channel === ch)
  return (
    <div>
      <PageHeader title={tr("Courriels & textos")} subtitle="Choisissez un modèle et un client : le message se remplit tout seul, vous le relisez et l’envoyez."
        actions={<>
          <select className="input w-auto" value={ch} onChange={e => setCh(e.target.value)}><option value="">Tous les canaux</option>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn-primary" onClick={() => setEditing({ id: uid(), name: '', channel: 'courriel', category: 'Général', subject: '', body: '' })}><Plus size={16} /> Modèle</button>
        </>} />
      {cats.map(cat => list.some(t => t.category === cat) && (
        <section key={cat} className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.filter(t => t.category === cat).map(t => (
              <div key={t.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left font-semibold hover:text-brand-700" onClick={() => setEditing(t)}>{t.name}</button>
                  <span className="badge shrink-0 bg-slate-100">{CH[t.channel]}</span>
                </div>
                {t.subject && <div className="mt-1 text-xs text-slate-500">Objet : {toFriendly(t.subject)}</div>}
                <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-slate-600">{toFriendly(t.body)}</p>
                <div className="mt-2 flex gap-1">
                  <button className="btn-primary text-xs" onClick={() => setUsing(t)}><Send size={13} /> {t.channel === 'courriel' ? 'Envoyer à un client' : t.channel === 'texto' ? 'Texter un client' : 'Personnaliser'}</button>
                  <button className="btn-ghost text-xs" onClick={() => copy(toFriendly(t.body))}><Copy size={13} /> Copier</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {using && <SendTemplate template={using} onClose={() => setUsing(null)} />}
      {editing && <TemplateForm tpl={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TemplateForm({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [t, setT] = useState({ ...tpl, subject: toFriendly(tpl.subject), body: toFriendly(tpl.body) })
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setT(x => ({ ...x, [k]: v }))
  const exists = db.templates.some(x => x.id === t.id)
  const area = useRef<HTMLTextAreaElement>(null)
  const insert = (txt: string) => {
    const el = area.current, pos = el?.selectionStart ?? t.body.length
    set('body', t.body.slice(0, pos) + txt + t.body.slice(el?.selectionEnd ?? pos))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + txt.length, pos + txt.length) })
  }
  return (
    <Modal title={exists ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('templates', t.id); onClose() }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>}
        <button className="btn-ghost" onClick={onClose}>{tr("Annuler")}</button>
        <button className="btn-primary" onClick={() => { if (t.name) { upsert('templates', { ...t, subject: fromFriendly(t.subject), body: fromFriendly(t.body) }); onClose() } }}>{tr("Enregistrer")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("Nom")}><input className="input" value={t.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label={tr("Catégorie")}><input className="input" value={t.category} onChange={e => set('category', e.target.value)} /></Field>
        <Field label="Canal"><select className="input" value={t.channel} onChange={e => set('channel', e.target.value as Template['channel'])}>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {t.channel === 'courriel' && <Field label="Objet"><input className="input" value={t.subject} onChange={e => set('subject', e.target.value)} /></Field>}
        <Field label={tr("Message")} className="sm:col-span-2"><textarea ref={area} className="input min-h-56 text-sm" value={t.body} onChange={e => set('body', e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs text-slate-500">Champs remplis automatiquement à l’envoi — cliquez pour insérer :</div>
          <div className="flex flex-wrap gap-1">{Object.values(VAR_LABELS).map(l => <button key={l} type="button" className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-violet-100" onClick={() => insert(`[${l}]`)}>+ {l}</button>)}</div>
        </div>
      </div>
    </Modal>
  )
}
