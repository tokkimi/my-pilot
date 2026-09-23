import { tr } from '../lib/i18n'
import { useState } from 'react'
import { BellRing, Mail, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Deal, DocStatus, Offer, OfferKind } from '../lib/types'
import { DOC_TYPES, GROUPS, RECORD_KEEPING_NOTE, SITUATION, STATUS_LABEL, TRACKING, defaultDocType, docProgress, requiredDocs, type DocType } from '../lib/compliance'
import { newTask } from '../lib/seed'
import { Progress } from '../lib/ui'
import { fmtDate, money, today, uid } from '../lib/utils'

const STATUS_STYLE: Record<DocStatus, string> = { inclus: 'bg-emerald-600 text-white', a_venir: 'bg-amber-400 text-amber-950', na: 'bg-slate-400 text-white', manquant: 'bg-rose-600 text-white' }

export function DocsTab({ d, set }: { d: Deal; set: (p: Partial<Deal>) => void }) {
  const { db, me, upsert } = useStore()
  const type = defaultDocType(d)
  const req = requiredDocs(d)
  const prog = docProgress(d)
  const docs = d.docs ?? {}
  const agent = db.members.find(m => m.id === d.agentId)
  const situation = SITUATION.filter(s => !s.types || s.types.includes(type))

  const sendNotice = (kind: 'avis' | 'rappel') => {
    if (!prog.missing.length) return alert('Aucun document manquant 👌')
    const due = d.docsDue || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const notice = { id: uid(), date: today(), by: me.id, to: d.agentId, due, missing: prog.missing.map(x => x.label), kind }
    set({ notices: [...(d.notices ?? []), notice], docsDue: due })
    upsert('tasks', newTask(d.agentId, { title: `${kind === 'rappel' ? 'RAPPEL — ' : ''}Documents manquants : ${d.title} (${prog.missing.length})`, due, dealId: d.id, listingId: d.listingId, priority: 'haute', category: 'Transaction', notes: prog.missing.map(x => '• ' + x.label).join('\n') }))
    if (agent?.email) {
      const body = `Bonjour ${agent.name.split(' ')[0]},\n\nPour le dossier « ${d.title} », merci de transmettre les documents suivants d’ici le ${fmtDate(due)} :\n\n${prog.missing.map(x => '• ' + x.label).join('\n')}\n\n${RECORD_KEEPING_NOTE}\n\n${me.name}`
      window.open(`mailto:${agent.email}?subject=${encodeURIComponent(`${kind === 'rappel' ? 'Rappel — ' : ''}Documents manquants — ${d.title}`)}&body=${encodeURIComponent(body)}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="label">Type de dossier</span>
          <select className="input" value={type} onChange={e => set({ docType: e.target.value })}>{(Object.keys(DOC_TYPES) as DocType[]).map(t => <option key={t} value={t}>{DOC_TYPES[t].label}</option>)}</select>
          <span className="text-xs text-slate-500">{DOC_TYPES[type].desc}</span>
        </label>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between"><b>{prog.done}/{prog.total} documents</b><span className={prog.pct === 100 ? 'text-emerald-700' : 'text-slate-600'}>{prog.pct} %</span></div>
          <Progress value={prog.pct} className="mt-1" />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>Échéance :</span><input type="date" className="input w-auto py-0.5 text-xs" value={d.docsDue ?? ''} onChange={e => set({ docsDue: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-sm font-semibold">Situation du dossier <span className="font-normal text-slate-500">— la liste des documents s’adapte</span></div>
        <div className="flex flex-wrap gap-1.5">
          {situation.map(s => {
            const on = !!d.situation?.[s.key]
            return <button key={s.key} onClick={() => set({ situation: { ...(d.situation ?? {}), [s.key]: !on } })} className={`badge border px-2.5 py-1 ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{s.label}</button>
          })}
        </div>
      </div>

      {GROUPS.map(g => {
        const items = req.filter(x => x.group === g)
        if (!items.length) return null
        return (
          <div key={g} className="rounded-lg border border-slate-200">
            <div className="bg-slate-50 px-3 py-2 text-sm font-semibold">{g}</div>
            <ul className="divide-y divide-slate-100">
              {items.map(x => {
                const st = docs[x.id]
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className={`flex-1 ${st === 'inclus' || st === 'na' ? 'text-slate-400' : ''}`}>{x.label}</span>
                    <div className="flex overflow-hidden rounded-md border border-slate-200 text-xs">
                      {(['inclus', 'a_venir', 'na'] as DocStatus[]).map(k => (
                        <button key={k} onClick={() => set({ docs: { ...docs, [x.id]: st === k ? 'manquant' : k } })} className={`px-2 py-1 ${st === k ? STATUS_STYLE[k] : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{STATUS_LABEL[k]}</button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
        <div className="mb-2 text-sm font-semibold">Avis de documents manquants</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => sendNotice('avis')} disabled={!prog.missing.length}><Mail size={15} /> Envoyer l’avis au courtier</button>
          <button className="btn-outline" onClick={() => sendNotice('rappel')} disabled={!d.notices?.length || !prog.missing.length}><BellRing size={15} /> Rappel</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Crée une tâche prioritaire pour {agent?.name ?? 'le courtier'} et prépare le courriel avec la liste et l’échéance.</p>
        {(d.notices ?? []).length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {d.notices!.map(n => <li key={n.id}>• {n.kind === 'rappel' ? 'Rappel' : 'Avis'} remis le {fmtDate(n.date)} par {db.members.find(m => m.id === n.by)?.name ?? '—'} — {n.missing.length} document(s), échéance {fmtDate(n.due)}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

export function TrackingTab({ d, set }: { d: Deal; set: (p: Partial<Deal>) => void }) {
  const f = d.fields ?? {}
  const side = d.kind === 'vente' ? 'vente' : 'achat'
  const put = (k: string, v: string) => set({ fields: { ...f, [k]: v } })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {TRACKING.map(sec => (
        <div key={sec.section} className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold">{sec.section}</div>
          <div className="grid gap-2">
            {sec.fields.filter(x => !x.side || x.side === side).map(x => (
              x.type === 'check'
                ? <label key={x.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={f[x.key] === '1'} onChange={e => put(x.key, e.target.checked ? '1' : '')} /> {x.label}</label>
                : <label key={x.key} className="block text-sm"><span className="label">{x.label}</span>
                    {x.type === 'select'
                      ? <select className="input py-1.5" value={f[x.key] ?? ''} onChange={e => put(x.key, e.target.value)}><option value="">—</option>{x.options!.map(o => <option key={o}>{o}</option>)}</select>
                      : <input className="input py-1.5" type={x.type === 'date' ? 'date' : x.type === 'money' ? 'number' : 'text'} value={f[x.key] ?? ''} onChange={e => put(x.key, e.target.value)} />}
                  </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const KINDS: Record<OfferKind, string> = { PA: 'Promesse d’achat', CP: 'Contre-proposition', MO: 'Modification', AS: 'Avis de réalisation de conditions', Annexe: 'Annexe', Avis: 'Autre avis' }
const OFFER_STATUS: Record<Offer['status'], [string, string]> = { en_attente: ['En attente', 'bg-slate-100'], acceptee: ['Acceptée', 'bg-emerald-100 text-emerald-700'], refusee: ['Refusée', 'bg-rose-100 text-rose-700'], contre_proposition: ['Contre-proposition', 'bg-amber-100 text-amber-800'], expiree: ['Expirée', 'bg-slate-200'] }

export function OffersTab({ d, set }: { d: Deal; set: (p: Partial<Deal>) => void }) {
  const offers = d.offers ?? []
  const [f, setF] = useState<Offer>(() => ({ id: uid(), kind: 'PA', number: '', date: today(), price: d.price, status: 'en_attente', signedSeller: false, ackBuyer: false, proof: false, notes: '' }))
  const upd = (id: string, p: Partial<Offer>) => {
    const list = offers.map(o => (o.id === id ? { ...o, ...p } : o))
    const o = list.find(x => x.id === id)!
    // une promesse d'achat acceptée met à jour le prix et la date du dossier
    if (p.status === 'acceptee' && o.kind === 'PA') set({ offers: list, price: o.price || d.price, dates: { ...d.dates, paAcceptee: d.dates.paAcceptee || o.date } })
    else set({ offers: list })
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
        <select className="input" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as OfferKind })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input" placeholder="No" value={f.number} onChange={e => setF({ ...f, number: e.target.value })} />
        <input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <input className="input" type="number" placeholder="Prix" value={f.price || ''} onChange={e => setF({ ...f, price: +e.target.value })} />
        <input className="input" placeholder="Notes / conditions" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
        <button className="btn-primary justify-center" onClick={() => { set({ offers: [...offers, f] }); setF({ ...f, id: uid(), number: '', notes: '' }) }}><Plus size={15} /> Ajouter</button>
      </div>
      {offers.length === 0 ? <p className="text-sm text-slate-500">Aucune promesse, contre-proposition ou modification consignée.</p> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead><tr><th className="th">Document</th><th className="th">{tr("Date")}</th><th className="th">Prix</th><th className="th">{tr("Statut")}</th><th className="th">Signée vendeur</th><th className="th">Accusé réception</th><th className="th">Preuve</th><th /></tr></thead>
            <tbody>{offers.map(o => (
              <tr key={o.id}>
                <td className="td"><b>{o.kind}</b> {o.number && `#${o.number}`}<div className="text-xs text-slate-500">{o.notes}</div></td>
                <td className="td text-xs">{fmtDate(o.date)}</td>
                <td className="td text-sm">{o.price ? money(o.price) : '—'}</td>
                <td className="td"><select className={`badge border-0 ${OFFER_STATUS[o.status][1]}`} value={o.status} onChange={e => upd(o.id, { status: e.target.value as Offer['status'] })}>{Object.entries(OFFER_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></td>
                {(['signedSeller', 'ackBuyer', 'proof'] as const).map(k => <td key={k} className="td text-center"><input type="checkbox" className="accent-brand-600" checked={o[k]} onChange={e => upd(o.id, { [k]: e.target.checked })} /></td>)}
                <td className="td"><button className="text-rose-600" onClick={() => set({ offers: offers.filter(x => x.id !== o.id) })}><Trash2 size={14} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Une promesse d’achat marquée « Acceptée » met à jour le prix et la date de P.A. acceptée du dossier.</p>
    </div>
  )
}
