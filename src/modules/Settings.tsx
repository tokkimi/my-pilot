import { useRef } from 'react'
import { Download, RotateCcw, Upload, Eraser } from 'lucide-react'
import type { PageProps } from '../App'
import { resetDemo, useStore } from '../lib/store'
import type { DB } from '../lib/types'
import { PageHeader } from '../lib/ui'
import { download, today } from '../lib/utils'

export default function Settings(_: PageProps) {
  const { db, replace, mode } = useStore()
  const file = useRef<HTMLInputElement>(null)
  const counts: [string, number][] = [['Contacts', db.contacts.length], ['Inscriptions', db.listings.length], ['Dossiers', db.deals.length], ['Tâches', db.tasks.length], ['Événements', db.events.length], ['Visites', db.showings.length], ['Partenaires', db.partners.length], ['Plateformes', db.platforms.length], ['Modèles', db.templates.length]]

  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as DB
      if (!Array.isArray(data.contacts) || !Array.isArray(data.members)) throw new Error('format')
      if (confirm('Remplacer toutes les données actuelles par cette sauvegarde?')) replace({ ...db, ...data })
    } catch { alert('Fichier de sauvegarde invalide.') }
  }

  const wipe = () => {
    if (!confirm('Vider toutes les données de démonstration (contacts, inscriptions, dossiers, tâches…) ? Les plateformes, modèles, objections et l’équipe sont conservés.')) return
    replace({ ...db, contacts: [], activities: [], listings: [], deals: [], tasks: [], events: [], showings: [], posts: [], expenses: [] })
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Paramètres & données" />
      <section className="card mb-4 p-4">
        <h2 className="mb-2 font-semibold">Vos données</h2>
        <div className="mb-3 grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
          {counts.map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-2 text-center"><div className="font-bold">{v}</div><div className="text-xs text-slate-500">{k}</div></div>)}
        </div>
        <p className="mb-3 text-sm text-slate-600">
          {mode === 'local'
            ? <>Mode démonstration : les données sont enregistrées <b>dans ce navigateur</b>. Pour un espace partagé et sécurisé pour votre agence, <a className="font-semibold text-brand-700 underline" href="/connexion">connectez-vous</a>.</>
            : <>Vos données sont enregistrées de façon sécurisée dans l’espace de votre agence et synchronisées entre tous les membres. Vous pouvez en télécharger une copie en tout temps.</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => download(`immopilot-sauvegarde-${today()}.json`, JSON.stringify(db, null, 2))}><Download size={16} /> Télécharger une sauvegarde</button>
          {mode === 'local' && <><input ref={file} type="file" accept=".json" hidden onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className="btn-outline" onClick={() => file.current?.click()}><Upload size={16} /> Restaurer une sauvegarde</button></>}
        </div>
      </section>
      {mode === 'local' && <section className="card p-4">
        <h2 className="mb-2 font-semibold">Démarrer pour de vrai</h2>
        <p className="mb-3 text-sm text-slate-600">Les données incluses sont fictives (sauf l’équipe, les plateformes, les SOP et les modèles tirés de vos documents).</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={wipe}><Eraser size={16} /> Vider les données de démonstration</button>
          <button className="btn-ghost text-rose-600" onClick={() => confirm('Tout réinitialiser aux données de démonstration?') && resetDemo()}><RotateCcw size={16} /> Réinitialiser la démo</button>
        </div>
      </section>}
    </div>
  )
}
