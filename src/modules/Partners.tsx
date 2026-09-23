import { tr } from '../lib/i18n'
import { useState } from 'react'
import { Mail, Phone, Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Partner, PartnerCat } from '../lib/types'
import { newPartner } from '../lib/seed'
import { Empty, Field, Modal, PageHeader, PARTNER_CATS } from '../lib/ui'

export default function Partners(_: PageProps) {
  const { db } = useStore()
  const [cat, setCat] = useState<PartnerCat | ''>('')
  const [editing, setEditing] = useState<Partner | null>(null)
  const list = db.partners.filter(p => !cat || p.category === cat)
  return (
    <div>
      <PageHeader title={tr("Partenaires")} subtitle="Notaires, arpenteurs, inspecteurs, courtiers hypothécaires, photographes, home staging…"
        actions={<>
          <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value as PartnerCat)}><option value="">Toutes catégories</option>{Object.entries(PARTNER_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn-primary" onClick={() => setEditing(newPartner({ category: cat || 'notaire' }))}><Plus size={16} /> Partenaire</button>
        </>} />
      {list.length === 0 ? <Empty>Aucun partenaire.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(p => (
            <div key={p.id} className="card p-4">
              <span className="badge bg-brand-50 text-brand-700">{PARTNER_CATS[p.category]}</span>
              <button className="mt-2 block text-left font-semibold hover:text-brand-700" onClick={() => setEditing(p)}>{p.name}</button>
              <div className="text-sm text-slate-500">{p.company}</div>
              {p.rating > 0 && <div className="text-sm text-amber-500">{'★'.repeat(p.rating)}</div>}
              {p.notes && <p className="mt-1 text-xs text-slate-600">{p.notes}</p>}
              <div className="mt-2 flex gap-2">
                {p.phone && <a className="btn-outline py-1" href={`tel:${p.phone}`}><Phone size={13} /> {p.phone}</a>}
                {p.email && <a className="btn-outline py-1" href={`mailto:${p.email}`}><Mail size={13} /></a>}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <PartnerForm p={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PartnerForm({ p: init, onClose }: { p: Partner; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [p, setP] = useState(init)
  const set = <K extends keyof Partner>(k: K, v: Partner[K]) => setP(x => ({ ...x, [k]: v }))
  const exists = db.partners.some(x => x.id === p.id)
  return (
    <Modal title={exists ? p.name : 'Nouveau partenaire'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('partners', p.id); onClose() }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>}
        <button className="btn-ghost" onClick={onClose}>{tr("Annuler")}</button>
        <button className="btn-primary" onClick={() => { if (p.name) { upsert('partners', p); onClose() } }}>{tr("Enregistrer")}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("Catégorie")}><select className="input" value={p.category} onChange={e => set('category', e.target.value as PartnerCat)}>{Object.entries(PARTNER_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={tr("Nom")}><input className="input" value={p.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Entreprise"><input className="input" value={p.company} onChange={e => set('company', e.target.value)} /></Field>
        <Field label={tr("Téléphone")}><input className="input" value={p.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label={tr("Courriel")}><input className="input" value={p.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label={tr("Site Web")}><input className="input" value={p.website} onChange={e => set('website', e.target.value)} /></Field>
        <Field label="Évaluation (0-5)"><input className="input" type="number" min={0} max={5} value={p.rating} onChange={e => set('rating', Math.max(0, Math.min(5, +e.target.value)))} /></Field>
        <Field label={tr("Notes")} className="sm:col-span-2"><textarea className="input" value={p.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
