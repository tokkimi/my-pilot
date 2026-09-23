import { tr } from '../lib/i18n'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Showing } from '../lib/types'
import { newShowing } from '../lib/seed'
import { Empty, Field, ListingSelect, Modal, PageHeader } from '../lib/ui'
import { fmtDate } from '../lib/utils'

const INTEREST = { faible: 'bg-slate-100 text-slate-600', moyen: 'bg-amber-100 text-amber-800', fort: 'bg-emerald-100 text-emerald-700' }

export default function Showings(_: PageProps) {
  const { db } = useStore()
  const [listing, setListing] = useState('')
  const [editing, setEditing] = useState<Showing | null>(null)
  const list = db.showings.filter(s => !listing || s.listingId === listing).sort((a, b) => b.date.localeCompare(a.date))
  const avg = list.length ? list.reduce((s, x) => s + x.rating, 0) / list.length : 0

  return (
    <div>
      <PageHeader title={tr("Visites & rétroactions")} subtitle="Suivi des visiteurs et compte-rendu au vendeur après chaque visite"
        actions={<>
          <div className="w-64"><ListingSelect value={listing} onChange={setListing} /></div>
          <button className="btn-primary" onClick={() => setEditing(newShowing({ listingId: listing }))}><Plus size={16} /> Nouvelle visite</button>
        </>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3 text-center"><div className="text-2xl font-bold">{list.length}</div><div className="text-xs text-slate-500">visites</div></div>
        <div className="card p-3 text-center"><div className="text-2xl font-bold">{avg.toFixed(1)} ★</div><div className="text-xs text-slate-500">appréciation moyenne</div></div>
        <div className="card p-3 text-center"><div className="text-2xl font-bold">{list.filter(s => s.interest === 'fort').length}</div><div className="text-xs text-slate-500">intérêts forts</div></div>
      </div>
      {list.length === 0 ? <Empty>Aucune visite consignée.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">{tr("Date")}</th><th className="th">Propriété</th><th className="th">Courtier / acheteur</th><th className="th">Intérêt</th><th className="th">Prix</th><th className="th">Commentaires</th></tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(s)}>
                  <td className="td whitespace-nowrap text-xs">{fmtDate(s.date, true)}</td>
                  <td className="td text-sm">{db.listings.find(l => l.id === s.listingId)?.address ?? '—'}</td>
                  <td className="td text-sm">{s.broker}<div className="text-xs text-slate-500">{s.buyer}</div></td>
                  <td className="td"><span className={`badge ${INTEREST[s.interest]}`}>{s.interest}</span> <span className="text-xs">{'★'.repeat(s.rating)}</span></td>
                  <td className="td text-xs">{s.priceOpinion}</td>
                  <td className="td max-w-xs text-xs">{s.feedback}{s.followUp && <div className="text-brand-600">↻ suivi requis</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ShowingForm showing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export function ShowingForm({ showing, onClose }: { showing: Showing; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [s, setS] = useState(showing)
  const set = <K extends keyof Showing>(k: K, v: Showing[K]) => setS(x => ({ ...x, [k]: v }))
  const exists = db.showings.some(x => x.id === s.id)
  return (
    <Modal title="Rétroaction de visite" onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('showings', s.id); onClose() }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>}
        <button className="btn-ghost" onClick={onClose}>{tr("Annuler")}</button>
        <button className="btn-primary" onClick={() => { upsert('showings', s); onClose() }}>{tr("Enregistrer")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Propriété"><ListingSelect value={s.listingId} onChange={v => set('listingId', v)} /></Field>
        <Field label="Date et heure"><input className="input" type="datetime-local" value={s.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Courtier visiteur"><input className="input" value={s.broker} onChange={e => set('broker', e.target.value)} /></Field>
        <Field label="Téléphone du courtier"><input className="input" value={s.brokerPhone} onChange={e => set('brokerPhone', e.target.value)} /></Field>
        <Field label="Profil de l’acheteur"><input className="input" value={s.buyer} onChange={e => set('buyer', e.target.value)} /></Field>
        <Field label="Opinion sur le prix"><select className="input" value={s.priceOpinion} onChange={e => set('priceOpinion', e.target.value)}><option value="">—</option><option>Bas</option><option>Juste</option><option>Élevé</option><option>Trop élevé</option></select></Field>
        <Field label="Intérêt"><select className="input" value={s.interest} onChange={e => set('interest', e.target.value as Showing['interest'])}><option value="faible">Faible</option><option value="moyen">Moyen</option><option value="fort">Fort</option></select></Field>
        <Field label="Appréciation (1-5)"><input className="input" type="range" min={1} max={5} value={s.rating} onChange={e => set('rating', +e.target.value)} /><div className="text-center text-amber-500">{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</div></Field>
        <Field label="Commentaires et objections" className="sm:col-span-2"><textarea className="input min-h-24" value={s.feedback} onChange={e => set('feedback', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={s.followUp} onChange={e => set('followUp', e.target.checked)} /> Suivi requis avec le courtier</label>
      </div>
    </Modal>
  )
}
