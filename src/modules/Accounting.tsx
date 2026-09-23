import { useMemo, useState } from 'react'
import { Camera, Car, Download, FileArchive, FileSpreadsheet, FileText, Mail, Paperclip, Plus, Printer, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Invoice, InvoiceLine, LedgerEntry, Owner, Trip } from '../lib/types'
import { EXPENSE_CATS, INVOICE_STATUS, PAYMENT_METHODS, REVENUE_CATS, catOf, declaration, invoiceTotals, newEntry, nextNumber, paid, periods, round2, taxesFor } from '../lib/accounting'
import { deleteMedia, mediaBlob, saveMedia } from '../lib/media'
import { sendEmail } from '../lib/email'
import { Avatar, ContactSelect, Empty, Field, Letterhead, Modal, PageHeader, Stat, Tabs } from '../lib/ui'
import { download, fmtDate, fullName, money, printElement, toCSV, today, uid } from '../lib/utils'
import MediaViewer from '../components/MediaViewer'

type Tab = 'tableau' | 'ecritures' | 'factures' | 'km' | 'declarations'

export default function Accounting({ go }: PageProps) {
  const { db, me, isAdmin, mode } = useStore()
  const [owner, setOwner] = useState<Owner>(me.id)
  const [tab, setTab] = useState<Tab>('tableau')
  const [year, setYear] = useState(new Date().getFullYear())
  const ownerName = owner === 'agence' ? db.agency.name : db.members.find(m => m.id === owner)?.name ?? me.name
  const entries = (db.ledger ?? []).filter(e => e.ownerId === owner)
  const inYear = entries.filter(e => e.date.startsWith(String(year)))

  return (
    <div>
      <PageHeader title="Comptabilité" subtitle={`Panneau comptable — ${ownerName}`}
        actions={<>
          {isAdmin && (
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              <button onClick={() => setOwner(me.id)} className={`rounded-md px-3 py-1.5 font-medium ${owner === me.id ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>Mon panneau</button>
              <button onClick={() => setOwner('agence')} className={`rounded-md px-3 py-1.5 font-medium ${owner === 'agence' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>Agence</button>
            </div>
          )}
          <select className="input w-auto" value={year} onChange={e => setYear(+e.target.value)}>{[0, 1, 2, 3].map(i => new Date().getFullYear() - i).map(y => <option key={y}>{y}</option>)}</select>
        </>} />
      {mode === 'remote' && <p className="mb-3 text-xs text-slate-500">🔒 {owner === 'agence' ? 'Visible uniquement par les administrateurs de l’agence.' : 'Votre comptabilité est personnelle : les autres membres ne la voient pas.'}</p>}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[['tableau', 'Tableau de bord'], ['ecritures', 'Revenus & dépenses'], ['factures', 'Devis & factures'], ['km', 'Kilométrage'], ['declarations', 'Déclarations']]} />
      {tab === 'tableau' && <Overview owner={owner} year={year} entries={inYear} go={go} onTab={setTab} />}
      {tab === 'ecritures' && <Entries owner={owner} entries={inYear} />}
      {tab === 'factures' && <Invoices owner={owner} />}
      {tab === 'km' && <Mileage owner={owner} year={year} />}
      {tab === 'declarations' && <Declarations owner={owner} year={year} ownerName={ownerName} />}
    </div>
  )
}

// ---------------------------------------------------------------- Tableau de bord
function Overview({ owner, year, entries, go, onTab }: { owner: Owner; year: number; entries: LedgerEntry[]; go: PageProps['go']; onTab: (t: Tab) => void }) {
  const { db } = useStore()
  const trips = (db.trips ?? []).filter(t => t.ownerId === owner)
  const y = (db.acctYears ?? []).find(a => a.ownerId === owner && a.year === year)
  const dcl = declaration(entries, trips, y, periods(year)[0])
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`
    const list = entries.filter(e => e.date.startsWith(m))
    return { m: new Date(year, i, 1).toLocaleDateString('fr-CA', { month: 'short' }), rev: list.filter(e => e.kind === 'revenu').reduce((s, e) => s + e.amount, 0), dep: list.filter(e => e.kind === 'depense').reduce((s, e) => s + e.amount, 0) }
  })
  const max = Math.max(1, ...months.flatMap(m => [m.rev, m.dep]))
  const unpaid = (db.invoices ?? []).filter(i => i.ownerId === owner && i.kind === 'facture' && !['paye', 'annule'].includes(i.status))
  const closedDeals = db.deals.filter(d => d.status === 'conclu' && (owner === 'agence' || d.agentId === owner) && !(db.ledger ?? []).some(e => e.dealId === d.id && e.ownerId === owner))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Revenus ${year}`} value={money(dcl.totalRevenue)} icon={<TrendingUp size={20} />} tone="green" />
        <Stat label="Dépenses déductibles" value={money(dcl.totalDeductible)} icon={<TrendingDown size={20} />} tone="rose" />
        <Stat label="Revenu net estimé" value={money(dcl.netIncome)} icon={<Wallet size={20} />} />
        <Stat label="TPS + TVQ à remettre" value={money(dcl.remit.tps + dcl.remit.tvq)} sub={`TPS ${money(dcl.remit.tps, 2)} · TVQ ${money(dcl.remit.tvq, 2)}`} icon={<Receipt size={20} />} tone="amber" />
      </div>
      {(dcl.missingReceipts.length > 0 || unpaid.length > 0 || closedDeals.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {dcl.missingReceipts.length > 0 && <button onClick={() => onTab('ecritures')} className="card border-amber-200 p-3 text-left text-sm hover:shadow"><b className="text-amber-700">{dcl.missingReceipts.length} dépense(s) sans justificatif</b><div className="text-xs text-slate-500">Photographiez les reçus pour vos déclarations.</div></button>}
          {unpaid.length > 0 && <button onClick={() => onTab('factures')} className="card border-sky-200 p-3 text-left text-sm hover:shadow"><b className="text-sky-700">{unpaid.length} facture(s) à encaisser</b><div className="text-xs text-slate-500">{money(unpaid.reduce((s, i) => s + invoiceTotals(i).total - paid(i), 0))} en attente</div></button>}
          {closedDeals.length > 0 && <button onClick={() => onTab('ecritures')} className="card border-emerald-200 p-3 text-left text-sm hover:shadow"><b className="text-emerald-700">{closedDeals.length} vente(s) conclue(s) à comptabiliser</b><div className="text-xs text-slate-500">Importez les commissions en un clic.</div></button>}
        </div>
      )}
      <section className="card p-4">
        <h2 className="font-semibold">Revenus et dépenses par mois — {year}</h2>
        <div className="mb-2 mt-1 flex gap-4 text-xs text-slate-600"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Revenus</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />Dépenses</span></div>
        <div className="flex h-44 items-end gap-2 border-b border-slate-200">
          {months.map(m => (
            <div key={m.m} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={`${m.m} — revenus ${money(m.rev)} · dépenses ${money(m.dep)}`}>
              <div className="w-1/2 max-w-4 rounded-t bg-emerald-500" style={{ height: `${(m.rev / max) * 100}%` }} />
              <div className="w-1/2 max-w-4 rounded-t bg-rose-400" style={{ height: `${(m.dep / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-center text-[10px] text-slate-500">{months.map(m => <span key={m.m} className="flex-1">{m.m}</span>)}</div>
      </section>
      {owner === 'agence' && <AgentCommissions year={year} go={go} />}
    </div>
  )
}

function AgentCommissions({ year, go }: { year: number; go: PageProps['go'] }) {
  const { db } = useStore()
  const closed = db.deals.filter(d => d.status === 'conclu' && (d.dates.acte || d.createdAt).startsWith(String(year)))
  const open = db.deals.filter(d => d.status === 'ouvert')
  const gross = (l: typeof db.deals) => l.reduce((s, d) => s + d.price * d.commissionPct / 100, 0)
  return (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-3 font-semibold">Commissions par courtier — {year}</h2>
      <table className="w-full">
        <thead><tr><th className="th">Courtier</th><th className="th">Ventes</th><th className="th">Brut</th><th className="th">Part courtier</th><th className="th">Part agence</th><th className="th">Projection</th></tr></thead>
        <tbody>{db.members.filter(m => m.active).map(m => {
          const c = closed.filter(d => d.agentId === m.id); const g = gross(c)
          return <tr key={m.id} className="cursor-pointer hover:bg-slate-50" onClick={() => go('deals')}><td className="td"><span className="flex items-center gap-2"><Avatar memberId={m.id} />{m.name}</span></td><td className="td">{c.length}</td><td className="td">{money(g)}</td><td className="td text-emerald-700">{money(g * m.split / 100)}</td><td className="td">{money(g * (100 - m.split) / 100)}</td><td className="td text-sky-700">{money(gross(open.filter(d => d.agentId === m.id)))}</td></tr>
        })}</tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------- Écritures
function Entries({ owner, entries }: { owner: Owner; entries: LedgerEntry[] }) {
  const { db, me, upsert } = useStore()
  const [kind, setKind] = useState<'' | LedgerEntry['kind']>('')
  const [cat, setCat] = useState('')
  const [noReceipt, setNoReceipt] = useState(false)
  const [edit, setEdit] = useState<LedgerEntry | null>(null)
  const list = entries.filter(e => !kind || e.kind === kind).filter(e => !cat || e.category === cat).filter(e => !noReceipt || (e.kind === 'depense' && !e.receipts.length)).sort((a, b) => b.date.localeCompare(a.date))
  const toImport = db.deals.filter(d => d.status === 'conclu' && (owner === 'agence' || d.agentId === owner) && !(db.ledger ?? []).some(e => e.dealId === d.id && e.ownerId === owner))
  const importDeals = () => {
    for (const d of toImport) {
      const agent = db.members.find(m => m.id === d.agentId)
      const gross = d.price * d.commissionPct / 100
      const amount = round2(owner === 'agence' ? gross * (100 - (agent?.split ?? 70)) / 100 : gross * (agent?.split ?? 70) / 100)
      upsert('ledger', newEntry(owner, me.id, { kind: 'revenu', category: owner === 'agence' ? 'redevances' : 'commission', date: d.dates.acte || today(), description: `Rétribution — ${d.title}`, counterpart: owner === 'agence' ? agent?.name ?? '' : db.agency.name, amount, ...taxesFor(amount), paymentMethod: 'Virement', dealId: d.id }))
    }
    alert(`${toImport.length} commission(s) importée(s). Vérifiez les montants reçus.`)
  }
  const newOf = (k: LedgerEntry['kind'], scan = false) => { const e = newEntry(owner, me.id, { kind: k, category: k === 'revenu' ? 'commission' : 'publicite' }); setEdit(e); if (scan) setTimeout(() => document.getElementById('receipt-input')?.click(), 300) }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => newOf('depense', true)}><Camera size={15} /> Photographier un reçu</button>
        <button className="btn-outline" onClick={() => newOf('depense')}><Plus size={15} /> Dépense</button>
        <button className="btn-outline" onClick={() => newOf('revenu')}><Plus size={15} /> Revenu</button>
        {toImport.length > 0 && <button className="btn-outline" onClick={importDeals}><TrendingUp size={15} /> Importer {toImport.length} commission(s)</button>}
        <button className="btn-ghost ml-auto" onClick={() => download(`ecritures-${owner}.csv`, toCSV(list.map(e => ({ date: e.date, type: e.kind, categorie: catOf(e)?.label ?? e.category, ligne: catOf(e)?.line ?? '', description: e.description, tiers: e.counterpart, montant: e.amount, tps: e.tps, tvq: e.tvq, total: round2(e.amount + e.tps + e.tvq), deductible_pct: e.deductiblePct, paiement: e.paymentMethod, justificatifs: e.receipts.length }))), 'text/csv')}><FileSpreadsheet size={15} /> CSV</button>
      </div>
      <div className="card mb-3 flex flex-wrap gap-2 p-3">
        <select className="input w-auto" value={kind} onChange={e => { setKind(e.target.value as LedgerEntry['kind']); setCat('') }}><option value="">Revenus et dépenses</option><option value="revenu">Revenus</option><option value="depense">Dépenses</option></select>
        <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value)}><option value="">Toutes catégories</option>{[...(kind !== 'depense' ? REVENUE_CATS : []), ...(kind !== 'revenu' ? EXPENSE_CATS : [])].map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={noReceipt} onChange={e => setNoReceipt(e.target.checked)} /> Sans justificatif</label>
      </div>
      {list.length === 0 ? <Empty>Aucune écriture.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Catégorie</th><th className="th text-right">Montant</th><th className="th text-right">Taxes</th><th className="th">Justif.</th></tr></thead>
            <tbody>{list.map(e => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEdit(e)}>
                <td className="td whitespace-nowrap text-xs">{fmtDate(e.date)}</td>
                <td className="td text-sm">{e.description || '—'}<div className="text-xs text-slate-500">{e.counterpart}</div></td>
                <td className="td text-xs">{catOf(e)?.label}<div className="text-slate-400">ligne {catOf(e)?.line}{e.deductiblePct < 100 && e.kind === 'depense' ? ` · ${e.deductiblePct} %` : ''}</div></td>
                <td className={`td whitespace-nowrap text-right text-sm font-semibold ${e.kind === 'revenu' ? 'text-emerald-700' : 'text-rose-600'}`}>{e.kind === 'revenu' ? '+' : '−'} {money(e.amount, 2)}</td>
                <td className="td whitespace-nowrap text-right text-xs text-slate-500">{money(e.tps + e.tvq, 2)}</td>
                <td className="td">{e.receipts.length ? <span className="badge bg-emerald-100 text-emerald-700"><Paperclip size={11} /> {e.receipts.length}</span> : e.kind === 'depense' ? <span className="badge bg-amber-100 text-amber-800">manquant</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <EntryForm key={edit.id} entry={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function EntryForm({ entry, onClose }: { entry: LedgerEntry; onClose: () => void }) {
  const { db, mode, upsert, remove } = useStore()
  const [e, setE] = useState(entry)
  const [autoTax, setAutoTax] = useState(true)
  const [busy, setBusy] = useState('')
  const [view, setView] = useState<LedgerEntry['receipts'][number] | null>(null)
  const exists = (db.ledger ?? []).some(x => x.id === e.id)
  const cats = e.kind === 'revenu' ? REVENUE_CATS : EXPENSE_CATS
  const set = (p: Partial<LedgerEntry>) => setE(x => {
    const n = { ...x, ...p }
    const c = cats.find(k => k.id === n.category)
    if ('category' in p && c) n.deductiblePct = c.pct ?? 100
    if (autoTax && ('amount' in p || 'category' in p)) Object.assign(n, taxesFor(n.amount, c?.taxable ?? true))
    return n
  })
  const addReceipts = async (files: FileList | null) => {
    if (!files?.length) return
    const refs: LedgerEntry['receipts'] = []
    for (const f of Array.from(files)) {
      setBusy(`Envoi de ${f.name}…`)
      try { refs.push(await saveMedia(f, f.type.startsWith('image/') ? 'photo' : 'document', f.name, mode === 'remote')) } catch (x) { alert((x as Error).message) }
    }
    setBusy('')
    setE(x => ({ ...x, receipts: [...x.receipts, ...refs] }))
  }
  const total = round2(e.amount + e.tps + e.tvq)
  return (
    <Modal title={`${exists ? 'Modifier' : 'Nouveau'} ${e.kind === 'revenu' ? 'revenu' : 'dépense'}`} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { if (confirm('Supprimer cette écriture et ses justificatifs?')) { e.receipts.forEach(r => void deleteMedia(r)); remove('ledger', e.id); onClose() } }}><Trash2 size={15} /> Supprimer</button>}
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { upsert('ledger', e); onClose() }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="label">Justificatifs (reçus, factures)</span>
          <div className="flex flex-wrap gap-2">
            {e.receipts.map(r => (
              <div key={r.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <button className="h-full w-full" onClick={() => setView(r)}>{r.thumb ? <img src={r.thumb} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">📄</span>}</button>
                <button className="absolute right-0.5 top-0.5 rounded bg-white/90 p-0.5 text-rose-600" onClick={() => { void deleteMedia(r); setE(x => ({ ...x, receipts: x.receipts.filter(y => y.id !== r.id) })) }}><Trash2 size={11} /></button>
              </div>
            ))}
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand-300 text-xs text-brand-700">
              <Camera size={18} /> Ajouter
              <input id="receipt-input" type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={x => { void addReceipts(x.target.files); x.target.value = '' }} />
            </label>
          </div>
          {busy && <p className="mt-1 text-xs text-brand-700">{busy}</p>}
        </div>
        <Field label="Date"><input className="input" type="date" value={e.date} onChange={x => set({ date: x.target.value })} /></Field>
        <Field label="Catégorie"><select className="input" value={e.category} onChange={x => set({ category: x.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.label} (ligne {c.line})</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><input className="input" value={e.description} onChange={x => set({ description: x.target.value })} /></Field>
        <Field label={e.kind === 'revenu' ? 'Payeur' : 'Fournisseur'}><input className="input" value={e.counterpart} onChange={x => set({ counterpart: x.target.value })} /></Field>
        <Field label="Mode de paiement"><select className="input" value={e.paymentMethod} onChange={x => set({ paymentMethod: x.target.value })}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Montant avant taxes"><input className="input" type="number" step="0.01" inputMode="decimal" value={e.amount || ''} onChange={x => set({ amount: +x.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={autoTax} onChange={x => setAutoTax(x.target.checked)} /> Calculer TPS/TVQ automatiquement</label>
        <Field label="TPS (5 %)"><input className="input" type="number" step="0.01" value={e.tps || ''} onChange={x => { setAutoTax(false); setE({ ...e, tps: +x.target.value }) }} /></Field>
        <Field label="TVQ (9,975 %)"><input className="input" type="number" step="0.01" value={e.tvq || ''} onChange={x => { setAutoTax(false); setE({ ...e, tvq: +x.target.value }) }} /></Field>
        {e.kind === 'depense' && <Field label="Portion déductible (%)"><input className="input" type="number" min={0} max={100} value={e.deductiblePct} onChange={x => set({ deductiblePct: Math.max(0, Math.min(100, +x.target.value)) })} /></Field>}
        <Field label="Dossier lié"><select className="input" value={e.dealId} onChange={x => set({ dealId: x.target.value })}><option value="">— Aucun —</option>{db.deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
        <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">Total payé : <b>{money(total, 2)}</b>{e.kind === 'depense' && catOf(e)?.vehicle && <span className="block text-xs text-slate-500">Frais de véhicule : la portion déductible est calculée selon le kilométrage d’affaires (onglet Kilométrage).</span>}</div>
      </div>
      {view && <MediaViewer media={view} onClose={() => setView(null)} />}
    </Modal>
  )
}

// ---------------------------------------------------------------- Devis et factures
function Invoices({ owner }: { owner: Owner }) {
  const { db, me } = useStore()
  const [kind, setKind] = useState<'' | Invoice['kind']>('')
  const [edit, setEdit] = useState<Invoice | null>(null)
  const list = (db.invoices ?? []).filter(i => i.ownerId === owner).filter(i => !kind || i.kind === kind).sort((a, b) => b.date.localeCompare(a.date))
  const create = (k: Invoice['kind']) => setEdit({
    id: uid(), kind: k, number: nextNumber(db.invoices ?? [], k, owner), date: today(), due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), ownerId: owner,
    contactId: '', client: { name: '', email: '', address: '', phone: '' }, lines: [{ desc: '', qty: 1, unit: 'forfait', price: 0 }], discountPct: 0, taxable: true,
    notes: '', terms: k === 'devis' ? 'Devis valable 30 jours.' : 'Payable à réception.', status: 'brouillon', payments: [], sentAt: '', fromQuoteId: '', dealId: '', createdBy: me.id,
  })
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => create('devis')}><Plus size={15} /> Nouveau devis</button>
        <button className="btn-outline" onClick={() => create('facture')}><Plus size={15} /> Nouvelle facture</button>
        <select className="input ml-auto w-auto" value={kind} onChange={e => setKind(e.target.value as Invoice['kind'])}><option value="">Devis et factures</option><option value="devis">Devis</option><option value="facture">Factures</option></select>
      </div>
      {list.length === 0 ? <Empty>Aucun devis ni facture. Créez votre premier devis : il reprendra le logo et les coordonnées de l’agence.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">No</th><th className="th">Client</th><th className="th">Date</th><th className="th text-right">Total</th><th className="th">Statut</th></tr></thead>
            <tbody>{list.map(i => (
              <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEdit(i)}>
                <td className="td text-sm font-medium">{i.number}<div className="text-xs text-slate-500">{i.kind === 'devis' ? 'Devis' : 'Facture'}</div></td>
                <td className="td text-sm">{i.client.name || '—'}</td>
                <td className="td text-xs">{fmtDate(i.date)}</td>
                <td className="td text-right text-sm font-semibold">{money(invoiceTotals(i).total, 2)}{i.kind === 'facture' && paid(i) > 0 && <div className="text-xs font-normal text-emerald-700">payé {money(paid(i), 2)}</div>}</td>
                <td className="td"><span className={`badge ${INVOICE_STATUS[i.status][1]}`}>{INVOICE_STATUS[i.status][0]}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <InvoiceEditor key={edit.id} inv={edit} onClose={() => setEdit(null)} onOpen={setEdit} />}
    </div>
  )
}

function InvoiceEditor({ inv, onClose, onOpen }: { inv: Invoice; onClose: () => void; onOpen: (i: Invoice) => void }) {
  const { db, me, upsert, remove } = useStore()
  const [i, setI] = useState(inv)
  const [view, setView] = useState<'edit' | 'apercu'>(inv.status === 'brouillon' ? 'edit' : 'apercu')
  const [pay, setPay] = useState({ amount: 0, date: today(), method: 'Virement' })
  const set = (p: Partial<Invoice>) => setI(x => ({ ...x, ...p }))
  const setLine = (n: number, p: Partial<InvoiceLine>) => set({ lines: i.lines.map((l, k) => (k === n ? { ...l, ...p } : l)) })
  const t = invoiceTotals(i)
  const exists = (db.invoices ?? []).some(x => x.id === i.id)
  const save = (p: Partial<Invoice> = {}) => { const n = { ...i, ...p }; setI(n); upsert('invoices', n); return n }
  const label = i.kind === 'devis' ? 'Devis' : 'Facture'

  const send = async () => {
    if (!i.client.email) return alert('Ajoutez le courriel du client.')
    const n = save({ status: i.status === 'brouillon' ? 'envoye' : i.status, sentAt: today() })
    const html = `<div style="font-family:system-ui;max-width:680px;margin:auto">${document.getElementById('invoice-doc')?.innerHTML ?? ''}</div>`
    const text = `Bonjour ${i.client.name},\n\nVoici ${i.kind === 'devis' ? 'notre devis' : 'notre facture'} ${n.number} au montant de ${money(t.total, 2)}.\n\n${i.lines.map(l => `• ${l.desc} — ${l.qty} ${l.unit} × ${money(l.price, 2)}`).join('\n')}\n\nSous-total : ${money(t.net, 2)}\nTPS : ${money(t.tps, 2)}\nTVQ : ${money(t.tvq, 2)}\nTotal : ${money(t.total, 2)}\n\n${i.terms}\n\n${me.name} — ${db.agency.name}`
    try {
      const how = await sendEmail({ to: [i.client.email], subject: `${label} ${n.number} — ${db.agency.name}`, html, text })
      alert(how === 'sent' ? `${label} envoyé à ${i.client.email}.` : 'Votre logiciel de courriel s’ouvre avec le message prêt. Joignez le PDF (bouton Imprimer / PDF) avant l’envoi.')
    } catch (e) { alert((e as Error).message) }
  }
  const toInvoice = () => {
    const f: Invoice = { ...i, id: uid(), kind: 'facture', number: nextNumber(db.invoices ?? [], 'facture', i.ownerId), date: today(), due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), status: 'brouillon', payments: [], sentAt: '', fromQuoteId: i.id, terms: 'Payable à réception.' }
    save({ status: 'accepte' }); upsert('invoices', f); onOpen(f)
  }
  const addPayment = () => {
    if (!pay.amount) return
    const payments = [...i.payments, { id: uid(), ...pay }]
    const total = payments.reduce((s, p) => s + p.amount, 0)
    save({ payments, status: total + 0.005 >= t.total ? 'paye' : 'partiel' })
    // l'encaissement est inscrit dans les revenus (taxes au prorata)
    const ratio = t.total ? pay.amount / t.total : 0
    upsert('ledger', newEntry(i.ownerId, me.id, { kind: 'revenu', category: 'services', date: pay.date, description: `Facture ${i.number}`, counterpart: i.client.name, amount: round2(t.net * ratio), tps: round2(t.tps * ratio), tvq: round2(t.tvq * ratio), paymentMethod: pay.method, invoiceId: i.id }))
    setPay({ ...pay, amount: 0 })
  }

  return (
    <Modal title={`${label} ${i.number}`} onClose={onClose} wide
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { if (confirm(`Supprimer ${label.toLowerCase()} ${i.number}?`)) { remove('invoices', i.id); onClose() } }}><Trash2 size={15} /></button>}
        <button className="btn-outline" onClick={() => { save(); setView('apercu'); setTimeout(() => printElement('invoice-doc', `${label} ${i.number}`), 100) }}><Printer size={15} /> Imprimer / PDF</button>
        <button className="btn-outline" onClick={() => { setView('apercu'); setTimeout(send, 100) }}><Mail size={15} /> Envoyer</button>
        {i.kind === 'devis' && !['refuse', 'annule'].includes(i.status) && <button className="btn-outline" onClick={toInvoice}><FileText size={15} /> Convertir en facture</button>}
        <button className="btn-primary" onClick={() => { save(); onClose() }}>Enregistrer</button>
      </>}>
      <Tabs value={view} onChange={setView} tabs={[['edit', 'Modifier'], ['apercu', 'Aperçu (logo de l’agence)']]} />
      {view === 'edit' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Numéro"><input className="input" value={i.number} onChange={e => set({ number: e.target.value })} /></Field>
            <Field label="Date"><input className="input" type="date" value={i.date} onChange={e => set({ date: e.target.value })} /></Field>
            <Field label={i.kind === 'devis' ? 'Valide jusqu’au' : 'Échéance'}><input className="input" type="date" value={i.due} onChange={e => set({ due: e.target.value })} /></Field>
            <Field label="Statut"><select className="input" value={i.status} onChange={e => set({ status: e.target.value as Invoice['status'] })}>{Object.entries(INVOICE_STATUS).filter(([k]) => i.kind === 'devis' ? !['paye', 'partiel'].includes(k) : !['accepte', 'refuse'].includes(k)).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </div>
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            <Field label="Client (fiche)"><ContactSelect value={i.contactId} onChange={id => { const c = db.contacts.find(x => x.id === id); set({ contactId: id, client: c ? { name: fullName(c), email: c.email, address: [c.address, c.city].filter(Boolean).join(', '), phone: c.phone } : i.client }) }} /></Field>
            <Field label="Nom"><input className="input" value={i.client.name} onChange={e => set({ client: { ...i.client, name: e.target.value } })} /></Field>
            <Field label="Courriel"><input className="input" type="email" value={i.client.email} onChange={e => set({ client: { ...i.client, email: e.target.value } })} /></Field>
            <Field label="Téléphone"><input className="input" value={i.client.phone} onChange={e => set({ client: { ...i.client, phone: e.target.value } })} /></Field>
            <Field label="Adresse" className="sm:col-span-2"><input className="input" value={i.client.address} onChange={e => set({ client: { ...i.client, address: e.target.value } })} /></Field>
          </div>
          <div className="rounded-lg border border-slate-200">
            <div className="hidden grid-cols-[1fr_70px_90px_110px_110px_32px] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500 sm:grid"><span>Description</span><span>Qté</span><span>Unité</span><span>Prix</span><span className="text-right">Montant</span><span /></div>
            {i.lines.map((l, n) => (
              <div key={n} className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2 sm:grid-cols-[1fr_70px_90px_110px_110px_32px] sm:items-center">
                <input className="input col-span-2 sm:col-span-1" placeholder="Description du service" value={l.desc} onChange={e => setLine(n, { desc: e.target.value })} />
                <input className="input" type="number" step="0.25" value={l.qty} onChange={e => setLine(n, { qty: +e.target.value })} />
                <input className="input" value={l.unit} onChange={e => setLine(n, { unit: e.target.value })} />
                <input className="input" type="number" step="0.01" value={l.price || ''} onChange={e => setLine(n, { price: +e.target.value })} />
                <span className="text-right text-sm font-semibold">{money(l.qty * l.price, 2)}</span>
                <button className="text-rose-600" onClick={() => set({ lines: i.lines.filter((_, k) => k !== n) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn-ghost m-2 text-xs" onClick={() => set({ lines: [...i.lines, { desc: '', qty: 1, unit: 'forfait', price: 0 }] })}><Plus size={13} /> Ligne</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rabais (%)"><input className="input" type="number" value={i.discountPct || ''} onChange={e => set({ discountPct: +e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={i.taxable} onChange={e => set({ taxable: e.target.checked })} /> Appliquer TPS et TVQ</label>
            <div className="rounded-lg bg-slate-50 p-2 text-right text-sm">Total : <b>{money(t.total, 2)}</b></div>
            <Field label="Notes" className="sm:col-span-3"><textarea className="input min-h-16" value={i.notes} onChange={e => set({ notes: e.target.value })} /></Field>
            <Field label="Conditions" className="sm:col-span-3"><textarea className="input min-h-16" value={i.terms} onChange={e => set({ terms: e.target.value })} /></Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <InvoiceDoc i={i} />
          {i.kind === 'facture' && (
            <div className="rounded-lg border border-slate-200 p-3 no-print">
              <div className="mb-2 text-sm font-semibold">Paiements reçus ({money(paid(i), 2)} / {money(t.total, 2)})</div>
              {i.payments.map(p => <div key={p.id} className="text-sm">• {fmtDate(p.date)} — {money(p.amount, 2)} ({p.method})</div>)}
              {i.status !== 'paye' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="input w-32" type="number" step="0.01" placeholder="Montant" value={pay.amount || ''} onChange={e => setPay({ ...pay, amount: +e.target.value })} />
                  <input className="input w-auto" type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} />
                  <select className="input w-auto" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select>
                  <button className="btn-primary" onClick={addPayment}>Enregistrer le paiement</button>
                  <button className="btn-ghost text-xs" onClick={() => setPay({ ...pay, amount: round2(t.total - paid(i)) })}>Solde</button>
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">Chaque paiement est ajouté automatiquement aux revenus (avec TPS/TVQ perçues).</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function InvoiceDoc({ i }: { i: Invoice }) {
  const { db } = useStore()
  const t = invoiceTotals(i)
  const member = i.ownerId === 'agence' ? undefined : db.members.find(m => m.id === i.ownerId)
  const tps = i.ownerId === 'agence' ? db.agency.tpsNo : member?.tpsNo
  const tvq = i.ownerId === 'agence' ? db.agency.tvqNo : member?.tvqNo
  return (
    <div id="invoice-doc" className="rounded-lg border border-slate-200 bg-white p-6 text-sm">
      <Letterhead title={i.kind === 'devis' ? 'Devis' : 'Facture'} subtitle={`No ${i.number}`} memberId={member?.id} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div><div className="text-xs font-semibold uppercase text-slate-500">{i.kind === 'devis' ? 'Préparé pour' : 'Facturé à'}</div><div className="font-semibold">{i.client.name}</div><div>{i.client.address}</div><div>{i.client.email} {i.client.phone && `· ${i.client.phone}`}</div></div>
        <div className="sm:text-right"><div>Date : <b>{fmtDate(i.date)}</b></div><div>{i.kind === 'devis' ? 'Valide jusqu’au' : 'Échéance'} : <b>{fmtDate(i.due)}</b></div>{(tps || tvq) && <div className="text-xs text-slate-500">{tps && `TPS ${tps}`} {tvq && `· TVQ ${tvq}`}</div>}</div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-2">Description</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">Prix</th><th className="py-2 text-right">Montant</th></tr></thead>
        <tbody>{i.lines.filter(l => l.desc || l.price).map((l, n) => <tr key={n} className="border-b border-slate-100"><td className="py-2">{l.desc}</td><td className="py-2 text-right">{l.qty} {l.unit}</td><td className="py-2 text-right">{money(l.price, 2)}</td><td className="py-2 text-right">{money(l.qty * l.price, 2)}</td></tr>)}</tbody>
      </table>
      <div className="ml-auto mt-3 w-full max-w-xs space-y-1">
        <div className="flex justify-between"><span>Sous-total</span><span>{money(t.subtotal, 2)}</span></div>
        {t.discount > 0 && <div className="flex justify-between"><span>Rabais ({i.discountPct} %)</span><span>− {money(t.discount, 2)}</span></div>}
        {i.taxable && <><div className="flex justify-between"><span>TPS (5 %)</span><span>{money(t.tps, 2)}</span></div><div className="flex justify-between"><span>TVQ (9,975 %)</span><span>{money(t.tvq, 2)}</span></div></>}
        <div className="flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold"><span>Total</span><span>{money(t.total, 2)}</span></div>
        {i.kind === 'facture' && paid(i) > 0 && <div className="flex justify-between text-emerald-700"><span>Payé</span><span>{money(paid(i), 2)}</span></div>}
      </div>
      {i.notes && <p className="mt-4 whitespace-pre-wrap">{i.notes}</p>}
      {i.terms && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">{i.terms}</p>}
      {i.kind === 'devis' && <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-500"><div className="border-t border-slate-400 pt-1">Acceptation du client (signature et date)</div><div className="border-t border-slate-400 pt-1">{db.agency.name}</div></div>}
    </div>
  )
}

// ---------------------------------------------------------------- Kilométrage
function Mileage({ owner, year }: { owner: Owner; year: number }) {
  const { db, upsert, remove } = useStore()
  const trips = (db.trips ?? []).filter(t => t.ownerId === owner && t.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date))
  const y = (db.acctYears ?? []).find(a => a.ownerId === owner && a.year === year) ?? { id: `${owner}-${year}`, ownerId: owner, year, totalKm: 0, regime: 'autonome' as const, notes: '' }
  const [f, setF] = useState<Trip>({ id: uid(), ownerId: owner, date: today(), from: 'Bureau', to: '', purpose: '', km: 0, dealId: '' })
  const business = trips.reduce((s, t) => s + t.km, 0)
  const pct = y.totalKm ? Math.min(100, (business / y.totalKm) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`Km d’affaires ${year}`} value={business.toLocaleString('fr-CA')} icon={<Car size={20} />} />
        <div className="card p-4"><div className="text-xs font-medium text-slate-500">Km totaux parcourus en {year} (odomètre)</div><input className="input mt-1" type="number" value={y.totalKm || ''} onChange={e => upsert('acctYears', { ...y, totalKm: +e.target.value })} /></div>
        <Stat label="Usage d’affaires du véhicule" value={`${pct.toFixed(1)} %`} sub="appliqué aux frais de véhicule" tone="green" />
      </div>
      <div className="card grid gap-2 p-3 sm:grid-cols-6">
        <input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <input className="input" placeholder="Départ" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} />
        <input className="input" placeholder="Destination" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} />
        <input className="input" placeholder="Motif (visite, RDV…)" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} />
        <input className="input" type="number" placeholder="Km" value={f.km || ''} onChange={e => setF({ ...f, km: +e.target.value })} />
        <button className="btn-primary justify-center" onClick={() => { if (f.km > 0) { upsert('trips', f); setF({ ...f, id: uid(), to: '', purpose: '', km: 0 }) } }}><Plus size={15} /> Ajouter</button>
      </div>
      {trips.length === 0 ? <Empty>Aucun déplacement consigné. Le registre de kilométrage justifie la déduction des frais de véhicule.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Trajet</th><th className="th">Motif</th><th className="th text-right">Km</th><th /></tr></thead>
            <tbody>{trips.map(t => <tr key={t.id}><td className="td text-xs">{fmtDate(t.date)}</td><td className="td text-sm">{t.from} → {t.to}</td><td className="td text-sm">{t.purpose}</td><td className="td text-right">{t.km}</td><td className="td"><button className="text-rose-600" onClick={() => remove('trips', t.id)}><Trash2 size={14} /></button></td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Déclarations
function Declarations({ owner, year, ownerName }: { owner: Owner; year: number; ownerName: string }) {
  const { db } = useStore()
  const ps = periods(year)
  const [pi, setPi] = useState(0)
  const [show, setShow] = useState(false)
  const [zipping, setZipping] = useState('')
  const entries = (db.ledger ?? []).filter(e => e.ownerId === owner)
  const trips = (db.trips ?? []).filter(t => t.ownerId === owner)
  const y = (db.acctYears ?? []).find(a => a.ownerId === owner && a.year === year)
  const d = useMemo(() => declaration(entries, trips, y, ps[pi]), [entries, trips, y, pi, year])  // eslint-disable-line react-hooks/exhaustive-deps
  const member = owner === 'agence' ? undefined : db.members.find(m => m.id === owner)
  const tps = owner === 'agence' ? db.agency.tpsNo : member?.tpsNo
  const tvq = owner === 'agence' ? db.agency.tvqNo : member?.tvqNo
  const csv = () => toCSV(d.entries.map(e => ({ date: e.date, type: e.kind, categorie: catOf(e)?.label ?? '', ligne: catOf(e)?.line ?? '', description: e.description, tiers: e.counterpart, montant: e.amount, tps: e.tps, tvq: e.tvq, deductible_pct: e.deductiblePct, justificatifs: e.receipts.map(r => r.name).join(' | ') })))

  const zip = async () => {
    setZipping('Préparation…')
    try {
      const { zipSync, strToU8 } = await import('fflate')
      const files: Record<string, Uint8Array> = {}
      let n = 0
      for (const e of d.entries) for (const r of e.receipts) {
        n++
        setZipping(`Justificatif ${n}…`)
        const b = await mediaBlob(r)
        if (!b) continue
        const ext = r.name.includes('.') ? r.name.split('.').pop() : r.mime.split('/')[1]
        files[`justificatifs/${e.date}_${(catOf(e)?.label ?? e.category).replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 40)}_${e.amount.toFixed(2)}_${n}.${ext}`] = new Uint8Array(await b.arrayBuffer())
      }
      files['ecritures.csv'] = strToU8('﻿' + csv())
      files['rapport.html'] = strToU8(`<!doctype html><meta charset="utf-8"><title>Déclaration ${d.period.label}</title><body style="font-family:system-ui;padding:24px">${document.getElementById('decl-report')?.innerHTML ?? ''}</body>`)
      const out = zipSync(files)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([out], { type: 'application/zip' }))
      a.download = `declaration-${d.period.label.replace(/\s/g, '-')}-${ownerName.replace(/\s/g, '-')}.zip`
      a.click()
    } catch (e) { alert((e as Error).message) } finally { setZipping('') }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3 no-print">
        <select className="input w-auto" value={pi} onChange={e => { setPi(+e.target.value); setShow(false) }}>{ps.map((p, k) => <option key={p.label} value={k}>{p.label}</option>)}</select>
        <button className="btn-primary" onClick={() => setShow(true)}><FileText size={15} /> Générer le détail pour les déclarations</button>
        {show && <>
          <button className="btn-outline" onClick={() => printElement('decl-report', `Déclaration ${d.period.label}`)}><Printer size={15} /> PDF</button>
          <button className="btn-outline" onClick={() => download(`ecritures-${d.period.label}.csv`, '﻿' + csv(), 'text/csv')}><Download size={15} /> CSV pour le comptable</button>
          <button className="btn-outline" onClick={zip} disabled={!!zipping}><FileArchive size={15} /> {zipping || 'Tout télécharger (ZIP avec justificatifs)'}</button>
        </>}
      </div>
      {!show ? <Empty>Choisissez l’année ou le trimestre, puis cliquez sur « Générer ». Le rapport regroupe les revenus, les dépenses par ligne fiscale (T2125 / TP-80), le calcul TPS/TVQ et la liste des justificatifs.</Empty> : (
        <div id="decl-report" className="card space-y-4 p-6 text-sm">
          <Letterhead title="Sommaire fiscal" subtitle={d.period.label} memberId={member?.id} />
          <div className="grid gap-2 sm:grid-cols-3">
            <div><span className="text-slate-500">Contribuable :</span> <b>{ownerName}</b></div>
            <div><span className="text-slate-500">No TPS :</span> {tps || '—'} · <span className="text-slate-500">No TVQ :</span> {tvq || '—'}</div>
            <div><span className="text-slate-500">Période :</span> {fmtDate(d.period.from)} au {fmtDate(d.period.to)}</div>
          </div>

          <section><h2 className="mb-1 border-b-2 border-slate-200 pb-1 font-bold uppercase">Revenus d’entreprise</h2>
            <table className="w-full">{d.revenueByCat.map(r => <tr key={r.c.id}><td className="py-1">{r.c.label}</td><td className="py-1 text-slate-500">ligne {r.c.line}</td><td className="py-1 text-right">{money(r.total, 2)}</td></tr>)}
              <tr className="font-bold"><td className="pt-1">Total des revenus bruts</td><td /><td className="pt-1 text-right">{money(d.totalRevenue, 2)}</td></tr></table>
          </section>

          <section><h2 className="mb-1 border-b-2 border-slate-200 pb-1 font-bold uppercase">Dépenses d’entreprise (T2125 / TP-80)</h2>
            <table className="w-full"><thead><tr className="text-left text-xs uppercase text-slate-500"><th>Ligne</th><th>Catégorie</th><th className="text-right">Montant</th><th className="text-right">Déductible</th></tr></thead>
              <tbody>{d.expenseLines.map(l => <tr key={l.line}><td className="py-1">{l.line}</td><td className="py-1">{l.label}{l.line === '9281' && <span className="text-xs text-slate-500"> ({d.vehiclePct} % d’usage d’affaires)</span>}</td><td className="py-1 text-right">{money(l.gross, 2)}</td><td className="py-1 text-right">{money(l.deductible, 2)}</td></tr>)}
                <tr className="font-bold"><td /><td className="pt-1">Total des dépenses déductibles</td><td /><td className="pt-1 text-right">{money(d.totalDeductible, 2)}</td></tr></tbody></table>
          </section>

          <section className="rounded-lg bg-slate-50 p-3 text-base"><div className="flex justify-between font-bold"><span>Revenu net d’entreprise estimé</span><span>{money(d.netIncome, 2)}</span></div>
            <div className="text-xs text-slate-500">Kilométrage d’affaires : {d.businessKm.toLocaleString('fr-CA')} km{y?.totalKm ? ` sur ${y.totalKm.toLocaleString('fr-CA')} km (${d.vehiclePct} %)` : ' — indiquez le kilométrage total pour calculer la portion déductible du véhicule'}.</div></section>

          <section><h2 className="mb-1 border-b-2 border-slate-200 pb-1 font-bold uppercase">Taxes de vente (déclaration TPS/TVH et TVQ)</h2>
            <table className="w-full"><thead><tr className="text-left text-xs uppercase text-slate-500"><th /><th className="text-right">TPS</th><th className="text-right">TVQ</th></tr></thead><tbody>
              <tr><td className="py-1">Taxes perçues sur les revenus</td><td className="py-1 text-right">{money(d.collected.tps, 2)}</td><td className="py-1 text-right">{money(d.collected.tvq, 2)}</td></tr>
              <tr><td className="py-1">Crédits (CTI / RTI) sur les dépenses</td><td className="py-1 text-right">− {money(d.itc.tps, 2)}</td><td className="py-1 text-right">− {money(d.itc.tvq, 2)}</td></tr>
              <tr className="font-bold"><td className="pt-1">Taxe nette à remettre</td><td className="pt-1 text-right">{money(d.remit.tps, 2)}</td><td className="pt-1 text-right">{money(d.remit.tvq, 2)}</td></tr>
            </tbody></table>
          </section>

          <section><h2 className="mb-1 border-b-2 border-slate-200 pb-1 font-bold uppercase">Détail des écritures ({d.entries.length})</h2>
            <table className="w-full text-xs"><thead><tr className="text-left uppercase text-slate-500"><th>Date</th><th>Description</th><th>Ligne</th><th className="text-right">Montant</th><th className="text-right">TPS</th><th className="text-right">TVQ</th><th className="pl-3">Justif.</th></tr></thead>
              <tbody>{d.entries.sort((a, b) => a.date.localeCompare(b.date)).map(e => <tr key={e.id} className="border-t border-slate-100"><td className="py-0.5">{e.date}</td><td>{e.kind === 'revenu' ? '+ ' : '− '}{e.description}</td><td>{catOf(e)?.line}</td><td className="text-right">{money(e.amount, 2)}</td><td className="text-right">{money(e.tps, 2)}</td><td className="text-right">{money(e.tvq, 2)}</td><td className="pl-3">{e.receipts.length ? '✓' : e.kind === 'depense' ? '✗' : ''}</td></tr>)}</tbody></table>
            {d.missingReceipts.length > 0 && <p className="mt-2 text-xs text-amber-700">⚠ {d.missingReceipts.length} dépense(s) sans justificatif — conservez les pièces justificatives 6 ans.</p>}
          </section>
          <p className="text-xs text-slate-500">Document préparé à partir des écritures saisies dans ImmoPilot, à titre de soutien à la préparation des déclarations (T1 / T2125, TP-1 / TP-80, TPS/TVQ). {y?.regime === 'societe' ? 'Pour une société par actions, utilisez ces montants pour l’état des résultats (T2 / CO-17).' : ''} À valider par votre comptable.</p>
        </div>
      )}
    </div>
  )
}
