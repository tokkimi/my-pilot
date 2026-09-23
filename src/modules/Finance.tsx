import { useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Expense } from '../lib/types'
import { newExpense } from '../lib/seed'
import { Avatar, Field, ListingSelect, MemberSelect, Modal, PageHeader, Stat } from '../lib/ui'
import { download, fmtDate, money, parseDate, toCSV } from '../lib/utils'

const EXP_CATS = ['Marketing', 'Publicité', 'Photographie', 'Pancartes', 'Impression', 'Cadeaux clients', 'Abonnements', 'Déplacements', 'Formation', 'Cotisations (OACIQ, APCIQ)', 'Autre']

export default function Finance({ go }: PageProps) {
  const { db, me } = useStore()
  const [year, setYear] = useState(new Date().getFullYear())
  const [editing, setEditing] = useState<Expense | null>(null)
  const inYear = (s: string) => parseDate(s)?.getFullYear() === year
  const closed = db.deals.filter(d => d.status === 'conclu' && inYear(d.dates.acte || d.createdAt))
  const open = db.deals.filter(d => d.status === 'ouvert')
  const expenses = db.expenses.filter(e => inYear(e.date))
  const gross = (list: typeof db.deals) => list.reduce((s, d) => s + d.price * d.commissionPct / 100, 0)
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)

  const rows = db.members.map(m => {
    const c = closed.filter(d => d.agentId === m.id), o = open.filter(d => d.agentId === m.id)
    const g = gross(c)
    const exp = expenses.filter(e => e.memberId === m.id).reduce((s, e) => s + e.amount, 0)
    return { m, n: c.length, vol: c.reduce((s, d) => s + d.price, 0), g, share: g * m.split / 100, proj: gross(o) * m.split / 100, exp }
  })

  return (
    <div>
      <PageHeader title="Commissions & dépenses" subtitle="Revenus par courtier, projections et dépenses marketing"
        actions={<>
          <select className="input w-auto" value={year} onChange={e => setYear(+e.target.value)}>{[0, 1, 2, 3].map(i => new Date().getFullYear() - i).map(y => <option key={y}>{y}</option>)}</select>
          <button className="btn-outline" onClick={() => download(`depenses-${year}.csv`, toCSV(expenses.map(e => ({ date: e.date, categorie: e.category, fournisseur: e.vendor, montant: e.amount, membre: db.members.find(m => m.id === e.memberId)?.name ?? '', notes: e.notes }))), 'text/csv')}><Download size={16} /> Dépenses CSV</button>
          <button className="btn-primary" onClick={() => setEditing(newExpense(me.id))}><Plus size={16} /> Dépense</button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Commissions brutes ${year}`} value={money(gross(closed))} sub={`${closed.length} transaction(s)`} tone="green" />
        <Stat label="Projection (dossiers ouverts)" value={money(gross(open))} sub={`${open.length} dossier(s)`} tone="sky" />
        <Stat label={`Dépenses ${year}`} value={money(totalExp)} tone="rose" />
        <Stat label="Net d’équipe (brut − dépenses)" value={money(gross(closed) - totalExp)} />
      </div>

      <section className="card mb-5 overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Par membre</h2>
        <table className="w-full">
          <thead><tr><th className="th">Membre</th><th className="th">Ventes</th><th className="th">Volume</th><th className="th">Brut</th><th className="th">Part courtier</th><th className="th">Projection</th><th className="th">Dépenses</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.m.id}><td className="td"><span className="flex items-center gap-2"><Avatar memberId={r.m.id} />{r.m.name}</span></td><td className="td">{r.n}</td><td className="td">{money(r.vol)}</td><td className="td">{money(r.g)}</td><td className="td font-semibold text-emerald-700">{money(r.share)}</td><td className="td text-sky-700">{money(r.proj)}</td><td className="td text-rose-600">{money(r.exp)}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-3 font-semibold">Transactions conclues {year}</h2>
          <table className="w-full"><tbody>{closed.map(d => (
            <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => go('deals', d.id)}><td className="td text-sm">{d.title}<div className="text-xs text-slate-500">{fmtDate(d.dates.acte)}</div></td><td className="td text-right text-sm">{money(d.price)}</td><td className="td text-right text-sm font-semibold">{money(d.price * d.commissionPct / 100)}</td></tr>
          ))}</tbody></table>
          {closed.length === 0 && <p className="p-4 text-sm text-slate-500">Aucune transaction conclue — marquez un dossier « Conclu ».</p>}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-3 font-semibold">Dépenses {year}</h2>
          <table className="w-full"><tbody>{expenses.map(e => (
            <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(e)}><td className="td text-xs">{fmtDate(e.date)}</td><td className="td text-sm">{e.category}<div className="text-xs text-slate-500">{e.vendor}</div></td><td className="td"><Avatar memberId={e.memberId} /></td><td className="td text-right text-sm">{money(e.amount, 2)}</td></tr>
          ))}</tbody></table>
        </section>
      </div>
      {editing && <ExpenseForm e={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExpenseForm({ e: init, onClose }: { e: Expense; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [e, setE] = useState(init)
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setE(x => ({ ...x, [k]: v }))
  const exists = db.expenses.some(x => x.id === e.id)
  return (
    <Modal title="Dépense" onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('expenses', e.id); onClose() }}><Trash2 size={15} /> Supprimer</button>}
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { upsert('expenses', e); onClose() }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input className="input" type="date" value={e.date} onChange={x => set('date', x.target.value)} /></Field>
        <Field label="Montant"><input className="input" type="number" step="0.01" value={e.amount || ''} onChange={x => set('amount', +x.target.value)} /></Field>
        <Field label="Catégorie"><select className="input" value={e.category} onChange={x => set('category', x.target.value)}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Fournisseur"><input className="input" value={e.vendor} onChange={x => set('vendor', x.target.value)} /></Field>
        <Field label="Membre"><MemberSelect value={e.memberId} onChange={v => set('memberId', v)} /></Field>
        <Field label="Inscription"><ListingSelect value={e.listingId} onChange={v => set('listingId', v)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={e.notes} onChange={x => set('notes', x.target.value)} /></Field>
      </div>
    </Modal>
  )
}
