import { useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { saveMedia, useMediaUrl } from '../lib/media'
import type { AgencyResource } from '../lib/types'
import { uid } from '../lib/utils'
import { language } from '../lib/i18n'

const t = (fr: string, en: string) => language === 'en' ? en : fr

/** An agency can replace each built-in section, or add its own documents. */
export default function AgencyResources({ area, slot, title, initial = '', children }: { area: AgencyResource['area']; slot: string; title: string; initial?: string; children: ReactNode }) {
  const { db, isAdmin, mode, upsert, remove, sync } = useStore()
  const id = `resource_${area}_${slot}`
  const [selected, setSelected] = useState(id)
  const [draft, setDraft] = useState<AgencyResource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const list = (db.resources ?? []).filter(r => r.area === area)
  const current = list.find(r => r.id === selected)
  const url = useMediaUrl(current?.attachment)
  const edit = () => setDraft(current ?? { id: selected, area, title, body: initial, updatedAt: '' })
  return <section className="mb-6">
    <div className="card no-print mb-4 flex flex-wrap items-center gap-2 p-3">
      <select className="input min-w-0 flex-1" aria-label={t('Document de l’agence', 'Agency document')} value={selected} onChange={e => { setSelected(e.target.value); setDraft(null) }}>
        <option value={id}>{list.find(r => r.id === id)?.title ?? title}</option>
        {list.filter(r => r.id !== id && !r.id.startsWith('resource_')).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
      </select>
      {isAdmin && <><button className="btn-outline" onClick={edit}>{t('Personnaliser / remplacer', 'Customize / replace')}</button><button className="btn-primary" onClick={() => setDraft({ id: uid(), area, title: '', body: '', updatedAt: '' })}>{t('Ajouter un document', 'Add document')}</button></>}
      <span className="text-xs text-slate-500">{sync === 'saving' ? t('Enregistrement…', 'Saving…') : t('Bibliothèque privée de votre agence', 'Your agency’s private library')}</span>
    </div>
    {draft && <form className="card no-print mb-4 space-y-3 p-4" onSubmit={e => { e.preventDefault(); upsert('resources', { ...draft, updatedAt: new Date().toISOString() }); setSelected(draft.id); setDraft(null) }}>
      <label className="label">{t('Titre', 'Title')}<input className="input" required maxLength={180} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="label">{t('Votre guide, procédure ou trame', 'Your guide, procedure or script')}<textarea className="input min-h-64" maxLength={200000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
      <label className="label">{t('Importer ou remplacer un fichier (PDF, Word ou texte)', 'Upload or replace a file (PDF, Word or text)')}<input type="file" accept=".pdf,.doc,.docx,.txt" disabled={busy} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); setError(''); try { if (f.size > 20 * 1024 * 1024) throw new Error(t('Limite : 20 Mo.', 'Limit: 20 MB.')); const attachment = await saveMedia(f, 'document', f.name, mode === 'remote'); const body = f.name.endsWith('.txt') ? await f.text() : draft.body; setDraft({ ...draft, attachment, body }); } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }} /></label>
      {draft.attachment && <p>{draft.attachment.name} <button type="button" className="btn-ghost" onClick={() => setDraft({ ...draft, attachment: undefined })}>{t('Retirer', 'Remove')}</button></p>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy}>{busy ? t('Import…', 'Uploading…') : t('Enregistrer', 'Save')}</button><button type="button" className="btn-outline" onClick={() => setDraft(null)}>{t('Annuler', 'Cancel')}</button>
      {current && <button type="button" className="btn-ghost" onClick={() => { if (confirm(t('Supprimer cette version ? Le modèle initial sera réaffiché si disponible.', 'Delete this version? The original template will be restored if available.'))) { remove('resources', current.id); setDraft(null); setSelected(id) } }}>{t('Supprimer cette version', 'Delete this version')}</button>}</div>
    </form>}
    {current ? <article className="card mx-auto max-w-3xl p-6"><h2 className="mb-4 text-2xl font-semibold">{current.title}</h2><p className="whitespace-pre-wrap">{current.body}</p>{url && <a className="btn-outline mt-4" href={url} target="_blank" rel="noreferrer">{t('Ouvrir le document', 'Open document')} · {current.attachment?.name}</a>}</article> : children}
  </section>
}
