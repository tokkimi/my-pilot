import { useState } from 'react'
import { CalendarPlus, ListPlus, Mail, Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Deal, DealKind } from '../lib/types'
import { newDeal, newEvent, newTask } from '../lib/seed'
import { BUY_WORKFLOW, DEAL_DATES, SELL_WORKFLOW } from '../lib/content'
import { Avatar, DueBadge, Empty, Field, ListingSelect, MemberSelect, Modal, MultiContact, PageHeader, Progress, ScopeFilter, Tabs } from '../lib/ui'
import { DocsTab, OffersTab, TrackingTab } from './DealTabs'
import { docProgress, DRIVE_SUBFOLDERS } from '../lib/compliance'
import DrivePanel from '../components/DrivePanel'
import DocumentsPanel from '../components/DocumentsPanel'

type DTab = 'process' | 'docs' | 'classeur' | 'suivi' | 'offres'
import { daysUntil, fillTemplate, fmtDate, fullName, money, TPS, TVQ, toFriendly } from '../lib/utils'

export const workflowOf = (d: Deal) => (d.kind === 'vente' ? SELL_WORKFLOW : BUY_WORKFLOW)
export function dealProgress(d: Deal) {
  const steps = workflowOf(d).flatMap(p => p.steps)
  return (steps.filter(s => d.checklist[s.id]).length / steps.length) * 100
}
/** Une échéance est « faite » si l'étape qui y est rattachée est cochée. */
export function dateDone(d: Deal, key: string) {
  return workflowOf(d).some(p => p.steps.some(s => s.dateKey === key && d.checklist[s.id]))
}
export function currentPhase(d: Deal) {
  return workflowOf(d).find(p => p.steps.some(s => !d.checklist[s.id]))
}

export default function Deals({ openId, go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [kind, setKind] = useState<DealKind | ''>('')
  const [status, setStatus] = useState<Deal['status'] | ''>('ouvert')
  const [open, setOpen] = useState<string | null>(openId ?? null)
  const list = db.deals.filter(d => mine(d.agentId)).filter(d => !kind || d.kind === kind).filter(d => !status || d.status === status)

  const create = (k: DealKind) => { const d = newDeal(me.id, { kind: k, title: k === 'vente' ? 'Nouveau dossier vendeur' : 'Nouveau dossier acheteur', commissionPct: k === 'vente' ? 5 : 2.5 }); upsert('deals', d); setOpen(d.id) }

  return (
    <div>
      <PageHeader title="Dossiers & transactions" subtitle="Processus vendeur et acheteur étape par étape, délais et tableau blanc"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={kind} onChange={e => setKind(e.target.value as DealKind)}><option value="">Vente + achat</option><option value="vente">Vente</option><option value="achat">Achat</option></select>
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value as Deal['status'])}><option value="">Tous</option><option value="ouvert">Ouverts</option><option value="conclu">Conclus</option><option value="annule">Annulés</option></select>
          <button className="btn-outline" onClick={() => create('achat')}><Plus size={16} /> Dossier acheteur</button>
          <button className="btn-primary" onClick={() => create('vente')}><Plus size={16} /> Dossier vendeur</button>
        </>} />
      {list.length === 0 ? <Empty>Aucun dossier.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(d => {
            const next = DEAL_DATES.filter(k => d.dates[k.key] && !dateDone(d, k.key) && ((daysUntil(d.dates[k.key]) ?? -1) >= 0 || ['inspection', 'financement', 'autres', 'acte'].includes(k.key))).sort((a, b) => d.dates[a.key].localeCompare(d.dates[b.key]))[0]
            const ph = currentPhase(d)
            return (
              <button key={d.id} onClick={() => setOpen(d.id)} className="card p-4 text-left hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`badge mr-2 ${d.kind === 'vente' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>{d.kind === 'vente' ? 'Vente' : 'Achat'}</span>
                    {d.status !== 'ouvert' && <span className="badge bg-slate-200">{d.status}</span>}
                    <div className="mt-1 font-semibold">{d.title}</div>
                    <div className="text-xs text-slate-500">{d.contactIds.map(id => fullName(db.contacts.find(c => c.id === id))).join(', ')}</div>
                  </div>
                  <Avatar memberId={d.agentId} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs"><Progress value={dealProgress(d)} /><span className="whitespace-nowrap">{Math.round(dealProgress(d))} %</span></div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{ph ? `Étape : ${ph.title}` : '✅ Toutes les étapes complétées'}</span>
                  {next && <span className="flex items-center gap-1">{next.label} <DueBadge days={daysUntil(d.dates[next.key])} /></span>}
                </div>
                <div className="mt-1 text-sm font-semibold">{money(d.price)}</div>
              </button>
            )
          })}
        </div>
      )}
      {open && db.deals.some(d => d.id === open) && <DealDetail id={open} onClose={() => { setOpen(null); if (openId) go('deals') }} go={go} />}
    </div>
  )
}

function DealDetail({ id, onClose, go }: { id: string; onClose: () => void; go: PageProps['go'] }) {
  const { db, me, upsert, remove } = useStore()
  const d = db.deals.find(x => x.id === id)!
  const set = <K extends keyof Deal>(k: K, v: Deal[K]) => upsert('deals', { ...d, [k]: v })
  const [tab, setTab] = useState<DTab>('process')
  const wf = workflowOf(d)
  const agent = db.members.find(m => m.id === d.agentId)
  const gross = d.price * d.commissionPct / 100
  const taxes = gross * (TPS + TVQ)
  const agentShare = gross * (agent?.split ?? 0) / 100
  const clients = d.contactIds.map(cid => db.contacts.find(c => c.id === cid)).filter(Boolean)
  const listing = db.listings.find(l => l.id === d.listingId)

  const genTasks = () => {
    const ph = currentPhase(d)
    if (!ph) return
    ph.steps.filter(s => !d.checklist[s.id]).forEach(s => upsert('tasks', newTask(d.agentId, { title: s.label, dealId: d.id, listingId: d.listingId, category: 'Transaction' })))
    alert(`${ph.steps.filter(s => !d.checklist[s.id]).length} tâche(s) créée(s) pour « ${ph.title} »`)
  }
  const genEvents = () => {
    let n = 0
    DEAL_DATES.forEach(k => {
      const v = d.dates[k.key]
      if (!v || (daysUntil(v) ?? -1) < 0) return
      upsert('events', newEvent(d.agentId, { title: `${k.label} — ${d.title}`, start: `${v}T09:00`, end: `${v}T10:00`, type: k.key === 'acte' ? 'notaire' : k.key === 'inspection' ? 'inspection' : 'suivi', listingId: d.listingId }))
      n++
    })
    alert(`${n} échéance(s) ajoutée(s) au calendrier`)
  }
  const recap = db.templates.find(t => t.name.startsWith('Récapitulatif des délais'))
  const recapBody = recap ? toFriendly(fillTemplate(recap.body, {
    prenom: clients.map(c => c!.firstName).join(' et '), adresse: listing?.address ?? d.title, courtier: me.name,
    inspection: fmtDate(d.dates.inspection), financement: fmtDate(d.dates.financement), acte: fmtDate(d.dates.acte), occupation: fmtDate(d.dates.occupation),
  })) : ''

  return (
    <Modal title={d.title} onClose={onClose} wide>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Tabs<DTab> value={tab} onChange={setTab} tabs={[['process', 'Processus'], ['docs', `Documents requis (${docProgress(d).done}/${docProgress(d).total})`], ['classeur', `Classeur (${d.documents?.length ?? 0})`], ['suivi', 'Fiche de suivi'], ['offres', `Offres & modifications (${d.offers?.length ?? 0})`]]} />
          {tab === 'docs' && <DocsTab d={d} set={p => upsert('deals', { ...d, ...p })} />}
          {tab === 'classeur' && <DocumentsPanel title="Classeur du dossier" docs={d.documents ?? []} onChange={documents => upsert('deals', { ...d, documents })} />}
          {tab === 'suivi' && <TrackingTab d={d} set={p => upsert('deals', { ...d, ...p })} />}
          {tab === 'offres' && <OffersTab d={d} set={p => upsert('deals', { ...d, ...p })} />}
          {tab === 'process' && <>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={genTasks}><ListPlus size={15} /> Générer les tâches de l’étape</button>
            <button className="btn-outline" onClick={genEvents}><CalendarPlus size={15} /> Échéances → calendrier</button>
            {clients[0]?.email && recap && <a className="btn-outline" href={`mailto:${clients.map(c => c!.email).join(',')}?subject=${encodeURIComponent(recap.subject)}&body=${encodeURIComponent(recapBody)}`}><Mail size={15} /> Courriel récap des délais</a>}
          </div>
          {wf.map(ph => {
            const done = ph.steps.filter(s => d.checklist[s.id]).length
            return (
              <div key={ph.id} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold">{ph.title}</span>
                  <span className={`badge ${done === ph.steps.length ? 'bg-emerald-100 text-emerald-700' : 'bg-white'}`}>{done}/{ph.steps.length}</span>
                </div>
                <div className="p-2">
                  {ph.steps.map(s => (
                    <label key={s.id} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="mt-0.5 accent-brand-600" checked={!!d.checklist[s.id]}
                        onChange={() => {
                          const checked = !d.checklist[s.id]
                          const dates = s.dateKey && checked && !d.dates[s.dateKey] ? { ...d.dates, [s.dateKey]: new Date().toISOString().slice(0, 10) } : d.dates
                          upsert('deals', { ...d, checklist: { ...d.checklist, [s.id]: checked }, dates })
                        }} />
                      <span className={d.checklist[s.id] ? 'text-slate-400 line-through' : ''}>{s.label}{s.hint && <span className="ml-1 text-xs text-brand-600">({s.hint})</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          </>}
        </div>

        <div className="space-y-3">
          <DrivePanel category="Dossiers" name={d.title} folderId={d.driveFolderId} url={d.driveUrl} subfolders={DRIVE_SUBFOLDERS} onLink={(fid, u) => upsert('deals', { ...d, driveFolderId: fid, driveUrl: u })} />
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2">
              <Field label="Titre du dossier"><input className="input" value={d.title} onChange={e => set('title', e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type"><select className="input" value={d.kind} onChange={e => set('kind', e.target.value as DealKind)}><option value="vente">Vente</option><option value="achat">Achat</option></select></Field>
                <Field label="Statut"><select className="input" value={d.status} onChange={e => set('status', e.target.value as Deal['status'])}><option value="ouvert">Ouvert</option><option value="conclu">Conclu</option><option value="annule">Annulé</option></select></Field>
              </div>
              <Field label="Courtier"><MemberSelect value={d.agentId} onChange={v => set('agentId', v)} /></Field>
              <Field label="Inscription liée"><ListingSelect value={d.listingId} onChange={v => set('listingId', v)} /></Field>
              <Field label="Clients"><MultiContact value={d.contactIds} onChange={v => set('contactIds', v)} /></Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Délais (tableau blanc)</div>
            {DEAL_DATES.map(k => (
              <div key={k.key} className="py-1 text-sm">
                <div className="mb-0.5 flex items-center justify-between text-xs text-slate-600">
                  <span>{k.label}</span>
                  {d.dates[k.key] && (dateDone(d, k.key) ? <span className="badge bg-emerald-100 text-emerald-700">✓ fait</span> : <DueBadge days={daysUntil(d.dates[k.key])} />)}
                </div>
                <input className="input py-1" type="date" value={d.dates[k.key] ?? ''} onChange={e => set('dates', { ...d.dates, [k.key]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Intervenants</div>
            <div className="grid gap-2">
              <Field label="Notaire"><input className="input" value={d.notaire} onChange={e => set('notaire', e.target.value)} /></Field>
              <Field label="Arpenteur"><input className="input" value={d.arpenteur} onChange={e => set('arpenteur', e.target.value)} /></Field>
              <Field label="Courtier collaborateur"><input className="input" value={d.collabBroker} onChange={e => set('collabBroker', e.target.value)} /></Field>
              <Field label="Prêteur / courtier hypothécaire"><input className="input" value={d.lender} onChange={e => set('lender', e.target.value)} /></Field>
              <button className="btn-ghost text-xs" onClick={() => go('partners')}>Carnet de partenaires →</button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-2 font-semibold">Rétribution</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prix"><input className="input" type="number" value={d.price || ''} onChange={e => set('price', +e.target.value)} /></Field>
              <Field label="Rétribution %"><input className="input" type="number" step="0.25" value={d.commissionPct} onChange={e => set('commissionPct', +e.target.value)} /></Field>
            </div>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between"><dt>Commission brute</dt><dd className="font-semibold">{money(gross, 2)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>TPS + TVQ</dt><dd>{money(taxes, 2)}</dd></div>
              <div className="flex justify-between"><dt>Part courtier ({agent?.split ?? 0} %)</dt><dd className="font-semibold text-emerald-700">{money(agentShare, 2)}</dd></div>
            </dl>
          </div>
          <Field label="Notes"><textarea className="input min-h-20" value={d.notes} onChange={e => set('notes', e.target.value)} /></Field>
          <button className="btn-ghost text-rose-600" onClick={() => { if (confirm('Supprimer ce dossier?')) { remove('deals', id); onClose() } }}><Trash2 size={15} /> Supprimer</button>
        </div>
      </div>
    </Modal>
  )
}
