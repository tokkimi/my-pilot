import { tr } from '../lib/i18n'
import { useState } from 'react'
import { Camera, FileText, Pencil, Trash2, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import type { FileDoc, MediaRef } from '../lib/types'
import { deleteMedia, saveMedia } from '../lib/media'
import { PARTNER_CATS } from '../lib/ui'
import { fmtDate, today, uid } from '../lib/utils'
import MediaViewer from './MediaViewer'

export const DOC_CATEGORIES = ['Contrat', 'Promesse / offre', 'Déclarations du vendeur', 'Identité et conformité', 'Certificat de localisation', 'Plan', 'Photo', 'Inspection', 'Évaluation', 'Taxes et comptes', 'Acte notarié', 'Copropriété', 'Financement', 'Facture / reçu', 'Correspondance', 'Autre']
const ICON: Record<string, string> = { 'image/': '🖼', 'video/': '🎥', 'audio/': '🎙', 'application/pdf': '📕', 'text/': '📄' }
const icon = (m: MediaRef) => Object.entries(ICON).find(([k]) => m.mime.startsWith(k))?.[1] ?? '📎'

// Classeur de documents : téléversement (fichier, photo, PDF…), catégorie, prestataire d'origine,
// date de réception, notes. Utilisé dans les fiches clients, les inscriptions et les dossiers.
export default function DocumentsPanel({ docs, onChange, title = 'Documents', defaultCategory = 'Contrat' }: { docs: FileDoc[]; onChange: (d: FileDoc[]) => void; title?: string; defaultCategory?: string }) {
  const { db, me, mode } = useStore()
  const [cat, setCat] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<FileDoc | null>(null)
  const [view, setView] = useState<MediaRef | null>(null)
  const list = docs.filter(d => !cat || d.category === cat).sort((a, b) => b.date.localeCompare(a.date))
  const cats = [...new Set(docs.map(d => d.category))]

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setErr('')
    const added: FileDoc[] = []
    for (const f of Array.from(files)) {
      setBusy(`Envoi de ${f.name}…`)
      try {
        const media = await saveMedia(f, f.type.startsWith('image/') ? 'photo' : 'document', f.name, mode === 'remote', p => setBusy(`Envoi de ${f.name}… ${Math.round(p * 100)} %`))
        const category = f.type.startsWith('image/') && defaultCategory === 'Contrat' ? 'Photo' : /plan/i.test(f.name) ? 'Plan' : defaultCategory
        added.push({ id: uid(), media, category, providerId: '', provider: '', date: today(), notes: '', addedBy: me.id })
      } catch (e) { setErr((e as Error).message) }
    }
    setBusy('')
    if (added.length) { onChange([...added, ...docs]); if (added.length === 1) setEdit(added[0]) }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><FileText size={15} className="text-brand-600" /> {title} ({docs.length})</span>
        <div className="ml-auto flex gap-1.5">
          <label className="btn-primary cursor-pointer py-1.5 text-xs"><Upload size={13} /> Ajouter<input type="file" multiple hidden onChange={e => { void add(e.target.files); e.target.value = '' }} /></label>
          <label className="btn-outline cursor-pointer py-1.5 text-xs sm:hidden"><Camera size={13} /> Photo<input type="file" accept="image/*" capture="environment" hidden onChange={e => { void add(e.target.files); e.target.value = '' }} /></label>
        </div>
      </div>
      {cats.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1">
          <button onClick={() => setCat('')} className={`badge border px-2 py-0.5 ${!cat ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200'}`}>Tous</button>
          {cats.map(c => <button key={c} onClick={() => setCat(c)} className={`badge border px-2 py-0.5 ${cat === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200'}`}>{c}</button>)}
        </div>
      )}
      {busy && <p className="text-xs text-brand-700">{busy}</p>}
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {list.length === 0 ? <p className="text-xs text-slate-500">Aucun document. Ajoutez contrats reçus, plans, photos, pièces d’identité, rapports…</p> : (
        <ul className="divide-y divide-slate-100">
          {list.map(d => (
            <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
              <button onClick={() => setView(d.media)} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                {d.media.thumb ? <img src={d.media.thumb} alt="" className="h-full w-full object-cover" /> : <span>{icon(d.media)}</span>}
              </button>
              <button className="min-w-0 flex-1 text-left" onClick={() => setView(d.media)}>
                <div className="truncate font-medium">{d.media.name}</div>
                <div className="truncate text-xs text-slate-500">{d.category}{d.provider ? ` · ${d.provider}` : ''} · reçu le {fmtDate(d.date)}{d.notes ? ` · ${d.notes}` : ''}</div>
              </button>
              <button className="btn-ghost p-1" onClick={() => setEdit(d)} aria-label="Modifier"><Pencil size={14} /></button>
              <button className="btn-ghost p-1 text-rose-600" aria-label={tr("Supprimer")} onClick={() => { if (confirm(`Supprimer « ${d.media.name} »?`)) { void deleteMedia(d.media); onChange(docs.filter(x => x.id !== d.id)) } }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={() => setEdit(null)}>
          <div className="card w-full max-w-md space-y-3 p-5 max-sm:rounded-b-none" onClick={e => e.stopPropagation()}>
            <div className="font-semibold">{edit.media.name}</div>
            <label className="block text-sm"><span className="label">{tr("Catégorie")}</span><select className="input" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="block text-sm"><span className="label">Reçu de (prestataire)</span>
              <select className="input" value={edit.providerId} onChange={e => { const p = db.partners.find(x => x.id === e.target.value); setEdit({ ...edit, providerId: e.target.value, provider: p ? `${p.name} (${PARTNER_CATS[p.category]})` : edit.provider }) }}>
                <option value="">— Autre / saisir —</option>{db.partners.map(p => <option key={p.id} value={p.id}>{p.name} — {PARTNER_CATS[p.category]}</option>)}
              </select>
              {!edit.providerId && <input className="input mt-1" placeholder="Client, notaire, arpenteur, banque…" value={edit.provider} onChange={e => setEdit({ ...edit, provider: e.target.value })} />}
            </label>
            <label className="block text-sm"><span className="label">Date de réception</span><input className="input" type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></label>
            <label className="block text-sm"><span className="label">{tr("Notes")}</span><input className="input" value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEdit(null)}>{tr("Annuler")}</button><button className="btn-primary" onClick={() => { onChange(docs.map(x => (x.id === edit.id ? edit : x))); setEdit(null) }}>{tr("Enregistrer")}</button></div>
          </div>
        </div>
      )}
      {view && <MediaViewer media={view} onClose={() => setView(null)} />}
    </div>
  )
}
