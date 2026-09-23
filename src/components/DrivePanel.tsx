import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FolderPlus, HardDrive, Link2, Loader2, Paperclip, RefreshCw, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { addShortcut, createDossierFolder, googleStatus, listFolder, pickFromDrive, uploadToDrive, type DriveFile, type GoogleStatus } from '../lib/google'

// Dossier Google Drive rattaché à une inscription, un dossier de transaction, une visite ou un client.
// Sans Google : simple lien vers n'importe quel dossier (Drive, OneDrive, Dropbox…).
export default function DrivePanel({ category, name, folderId, url, subfolders = [], onLink, compact }: {
  category: string; name: string; folderId?: string; url?: string; subfolders?: string[]
  onLink: (folderId: string, url: string) => void; compact?: boolean
}) {
  const { mode } = useStore()
  const [st, setSt] = useState<GoogleStatus | null>(null)
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [manual, setManual] = useState(url ?? '')
  useEffect(() => { if (mode === 'remote') void googleStatus().then(setSt) }, [mode])
  const canDrive = !!st?.configured && st.allowed.drive && !!st.connected && st.connected.scopes.includes('drive.file')

  const load = useCallback(async () => {
    if (!folderId || !canDrive) return
    try { setFiles(await listFolder(folderId)) } catch (e) { setErr((e as Error).message) }
  }, [folderId, canDrive])
  useEffect(() => { void load() }, [load])

  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setErr(''); try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy('') } }
  const create = () => run('Création du dossier…', async () => { const f = await createDossierFolder(category, name || 'Sans titre', subfolders); onLink(f.id, f.webViewLink) })
  const upload = (list: FileList | null) => list && folderId && run('Envoi…', async () => { for (const f of Array.from(list)) await uploadToDrive(f, f.name, folderId, p => setBusy(`Envoi de ${f.name}… ${Math.round(p * 100)} %`)); await load() })
  const pick = () => folderId && run('Sélecteur Google…', async () => { const docs = await pickFromDrive(folderId); for (const d of docs) if (!d.uploaded) await addShortcut(d.id, d.name, folderId); await load() })

  const hint = mode === 'local' ? 'Mode démo : collez un lien de dossier. La connexion Google est offerte dans l’espace sécurisé.'
    : !st ? '' : !st.configured ? 'Connexion Google pas encore activée par la plateforme — collez un lien de dossier.'
    : !st.allowed.drive ? 'Google Drive n’est pas autorisé pour votre profil (voir l’administrateur de l’agence).'
    : !st.connected ? 'Reliez votre compte Google (menu Google Drive & Agenda) pour créer le dossier automatiquement.' : ''

  return (
    <div className={`rounded-lg border border-slate-200 ${compact ? 'p-2' : 'p-3'} text-sm`}>
      <div className="mb-2 flex items-center gap-2 font-semibold"><HardDrive size={15} className="text-emerald-600" /> Dossier Drive
        {folderId && canDrive && <button className="ml-auto text-slate-400 hover:text-slate-700" onClick={() => void load()} title="Actualiser"><RefreshCw size={13} /></button>}
      </div>
      {url && <a href={url} target="_blank" rel="noreferrer" className="btn-outline mb-2 w-full justify-center py-1.5 text-xs"><ExternalLink size={13} /> Ouvrir le dossier</a>}
      {canDrive && !folderId && <button className="btn-primary w-full justify-center py-1.5 text-xs" onClick={create} disabled={!!busy}><FolderPlus size={14} /> Créer le dossier dans mon Drive</button>}
      {canDrive && folderId && (
        <>
          <div className="flex gap-1.5">
            <label className="btn-outline flex-1 cursor-pointer justify-center py-1.5 text-xs"><Upload size={13} /> Téléverser<input type="file" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = '' }} /></label>
            {st?.picker && <button className="btn-outline flex-1 justify-center py-1.5 text-xs" onClick={pick}><Paperclip size={13} /> Depuis mon Drive</button>}
          </div>
          {files && (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
              {files.length === 0 && <li className="text-xs text-slate-500">Dossier vide.</li>}
              {files.map(f => (
                <li key={f.id}><a href={f.webViewLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-slate-50">
                  {f.iconLink ? <img src={f.iconLink} alt="" className="h-4 w-4" /> : <span>📄</span>}<span className="truncate">{f.name}</span>
                </a></li>
              ))}
            </ul>
          )}
        </>
      )}
      {!canDrive && (
        <div className="flex gap-1.5">
          <input className="input py-1 text-xs" placeholder="Lien du dossier (Drive, OneDrive, Dropbox…)" value={manual} onChange={e => setManual(e.target.value)} />
          <button className="btn-outline px-2 py-1 text-xs" disabled={!manual.startsWith('http')} onClick={() => onLink(folderId ?? '', manual)}><Link2 size={13} /></button>
        </div>
      )}
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
      {busy && <p className="mt-1.5 flex items-center gap-1 text-xs text-brand-700"><Loader2 size={12} className="animate-spin" /> {busy}</p>}
      {err && <p className="mt-1.5 text-xs text-rose-600">{err}</p>}
    </div>
  )
}
