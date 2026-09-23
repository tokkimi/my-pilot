import { tr } from '../lib/i18n'
// Onglet « Activité du site » de la console des fondateurs : fil d'activité, inscrits (fondateurs puis agences
// et leurs équipes), demandes reçues par type, et comptabilité de la plateforme ImmoPilot.
import { useMemo, useState } from 'react'
import { Building2, Crown, Download, GraduationCap, Inbox, Plus, Receipt, Trash2, UserPlus, Users } from 'lucide-react'

type Plan = 'essai' | 'solo' | 'equipe' | 'agence' | 'entreprise' | 'illimite'
interface Agency { id: string; name: string; plan: Plan; seats: number; status: 'actif' | 'suspendu'; createdAt: string; contactEmail: string; monthlyFee?: number }
interface User { id: string; email: string; name: string; role: string; agencyId: string; active: boolean; title: string; createdAt: string; lastSeenAt: string }
interface Lead { id: string; createdAt: string; name: string; email: string; phone: string; agency: string; role: string; agents: string; interest: string; message: string; status: string; notes: string }
export interface PlatformEntry { id: string; date: string; kind: 'revenu' | 'depense'; category: string; description: string; amount: number; tps: number; tvq: number; agencyId: string; reference: string; createdAt: string }
export interface SiteData { users: User[]; agencies: Agency[]; leads: Lead[]; finance?: PlatformEntry[] }
type Run = (b: object, after?: (b: any) => void) => Promise<void>
type Secret = (s: { title: string; email: string; password: string }) => void

const PLAN_LABEL: Record<Plan, string> = { essai: 'Essai', solo: 'Courtier solo', equipe: 'Équipe', agence: 'Agence', entreprise: 'Entreprise', illimite: 'Illimité (interne)' }
const ROLE_ORDER: [string, string][] = [['admin', 'Direction de l’agence'], ['courtier', 'Courtiers'], ['adjointe', 'Adjointes et soutien administratif'], ['marketing', 'Équipe marketing'], ['agent', 'Autres membres']]
const REV_CATS = { abonnement: 'Abonnements', formation: 'Formations', implantation: 'Implantation et migration', autre_revenu: 'Autres revenus' }
const DEP_CATS = { hebergement: 'Hébergement et infrastructure (Vercel, stockage)', logiciels: 'Logiciels et services (courriel, Google)', marketing: 'Publicité et marketing', honoraires: 'Honoraires professionnels', salaires: 'Salaires et sous-traitance', formation_frais: 'Frais de formation (salles, déplacements)', bureau: 'Frais de bureau', autre_depense: 'Autres dépenses' }
const money = (n: number) => n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const day = (s: string) => (s ? new Date(s).toLocaleDateString('fr-CA', { dateStyle: 'medium' }) : '—')
const within = (s: string, d: number) => !!s && Date.now() - new Date(s).getTime() < d * 86400000
export const leadType = (l: Pick<Lead, 'interest'>) => (/^abonnement/i.test(l.interest) ? 'abonnement' : /formation/i.test(l.interest) ? 'formation' : /d[ée]mo/i.test(l.interest) ? 'demo' : 'autre')

export default function SiteActivity({ data, run, onSecret }: { data: SiteData; run: Run; onSecret: Secret }) {
  const [view, setView] = useState<'fil' | 'inscrits' | 'compta'>('fil')
  const members = data.users.filter(u => u.role !== 'superadmin')
  const open = (t: string) => data.leads.filter(l => leadType(l) === t && l.status === 'nouveau').length
  const mrr = data.agencies.filter(a => a.status === 'actif' && a.plan !== 'essai' && a.plan !== 'illimite').reduce((s, a) => s + (a.monthlyFee ?? 0), 0)
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Users} label="Inscrits" value={members.length} sub={`${members.filter(u => within(u.createdAt, 30)).length} nouveaux en 30 j`} />
        <Kpi icon={Building2} label={tr("Agences")} value={data.agencies.length} sub={`${data.agencies.filter(a => a.plan === 'essai').length} en essai`} />
        <Kpi icon={Inbox} label="Demandes d’abonnement" value={open('abonnement')} sub="à traiter" />
        <Kpi icon={GraduationCap} label="Cours et formations" value={open('formation')} sub="à traiter" />
        <Kpi icon={Receipt} label="Revenu mensuel récurrent" value={money(mrr)} sub={`${money(mrr * 12)} par an`} />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['fil', 'Fil d’activité'], ['inscrits', 'Inscrits'], ['compta', 'Comptabilité ImmoPilot']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === k ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{l}</button>
        ))}
      </div>
      {view === 'fil' && <Feed data={data} />}
      {view === 'inscrits' && <Directory data={data} run={run} onSecret={onSecret} />}
      {view === 'compta' && <Books data={data} run={run} />}
    </div>
  )
}

function Kpi({ icon: I, label, value, sub }: { icon: typeof Users; label: string; value: string | number; sub: string }) {
  return <div className="card p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><I size={14} />{label}</div><div className="mt-1 text-2xl font-bold">{value}</div><div className="text-xs text-slate-500">{sub}</div></div>
}

function Feed({ data }: { data: SiteData }) {
  const [f, setF] = useState('')
  const agencyName = (id: string) => data.agencies.find(a => a.id === id)?.name ?? ''
  const events = useMemo(() => [
    ...data.users.filter(u => u.role !== 'superadmin').map(u => ({ at: u.createdAt, kind: 'inscription', icon: '👤', text: `${u.name} s’est inscrit·e`, sub: `${agencyName(u.agencyId)} · ${u.email}` })),
    ...data.agencies.map(a => ({ at: a.createdAt, kind: 'agence', icon: '🏢', text: `Nouvelle agence : ${a.name}`, sub: `Forfait ${PLAN_LABEL[a.plan]}` })),
    ...data.leads.map(l => ({ at: l.createdAt, kind: leadType(l), icon: { abonnement: '📝', formation: '🎓', demo: '🖥️', autre: '✉️' }[leadType(l)], text: `${l.interest} — ${l.name}`, sub: [l.agency, l.email, l.phone].filter(Boolean).join(' · ') })),
    ...(data.finance ?? []).filter(e => e.kind === 'revenu').map(e => ({ at: e.createdAt, kind: 'paiement', icon: '💵', text: `${e.description}`, sub: money(e.amount) })),
  ].filter(e => e.at && (!f || e.kind === f)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150), [data, f])
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        {[['', 'Tout'], ['inscription', 'Inscriptions'], ['agence', 'Agences'], ['abonnement', 'Abonnements'], ['formation', 'Formations'], ['demo', 'Démos'], ['paiement', 'Revenus']].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className={`rounded-full px-3 py-1 text-xs ${f === k ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l}</button>
        ))}
      </div>
      {events.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Aucune activité pour l’instant.</p> : (
        <ul className="divide-y divide-slate-100">
          {events.map((e, i) => <li key={i} className="flex gap-3 py-2"><span className="text-lg">{e.icon}</span><div className="min-w-0 flex-1"><div className="text-sm font-medium">{e.text}</div><div className="truncate text-xs text-slate-500">{e.sub}</div></div><span className="shrink-0 text-xs text-slate-400">{day(e.at)}</span></li>)}
        </ul>
      )}
    </div>
  )
}

function Directory({ data, run, onSecret }: { data: SiteData; run: Run; onSecret: Secret }) {
  const [f, setF] = useState<{ name: string; email: string } | null>(null)
  const founders = data.users.filter(u => u.role === 'superadmin')
  const Person = ({ u }: { u: User }) => (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${within(u.lastSeenAt, 7) ? 'bg-emerald-500' : 'bg-slate-300'}`} title={within(u.lastSeenAt, 7) ? 'Actif cette semaine' : 'Inactif depuis 7 j'} />
      <span className="font-medium">{u.name}</span><span className="truncate text-slate-500">{u.email}</span>{u.title && <span className="hidden text-xs text-slate-400 sm:inline">· {u.title}</span>}
      {!u.active && <span className="badge bg-rose-100 text-rose-700">désactivé</span>}
      <span className="ml-auto shrink-0 text-xs text-slate-400">inscrit·e le {day(u.createdAt)}</span>
    </li>
  )
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-2 flex items-center gap-2"><Crown size={16} className="text-amber-500" /><h3 className="font-semibold">Fondateurs d’ImmoPilot</h3><span className="text-xs text-slate-500">accès complet à la console</span>
          <button className="btn-outline ml-auto text-xs" onClick={() => setF({ name: '', email: '' })}><UserPlus size={14} /> Ajouter un fondateur</button></div>
        {f && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-2">
            <input className="input w-48" placeholder={tr("Nom")} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <input className="input w-64" placeholder={tr("Courriel")} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
            <button className="btn-primary" disabled={!f.email} onClick={() => run({ action: 'createUser', role: 'superadmin', agencyId: 'platform', title: 'Fondateur·rice ImmoPilot', name: f.name, email: f.email }, b => { if (b.password) onSecret({ title: `Accès fondateur — ${f.name || f.email}`, email: f.email, password: b.password }); setF(null) })}>{tr("Créer l’accès")}</button>
            <button className="btn-ghost" onClick={() => setF(null)}>{tr("Annuler")}</button>
          </div>
        )}
        <ul className="divide-y divide-slate-100">{founders.map(u => <Person key={u.id} u={u} />)}</ul>
      </section>
      {data.agencies.map(a => {
        const team = data.users.filter(u => u.agencyId === a.id && u.role !== 'superadmin')
        return (
          <section key={a.id} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2"><Building2 size={16} className="text-brand-600" /><h3 className="font-semibold">{a.name}</h3>
              <span className="badge bg-slate-100">{PLAN_LABEL[a.plan]}</span>{a.status !== 'actif' && <span className="badge bg-rose-100 text-rose-700">suspendue</span>}
              <span className="ml-auto text-xs text-slate-500">{team.length} membre{team.length > 1 ? 's' : ''}{a.seats ? ` / ${a.seats} sièges` : ''} · créée le {day(a.createdAt)}</span></div>
            {team.length === 0 ? <p className="text-sm text-slate-500">Aucun membre inscrit.</p> : ROLE_ORDER.map(([r, l]) => {
              const people = team.filter(u => u.role === r)
              return people.length > 0 && <div key={r} className="mt-2"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l} ({people.length})</div><ul className="ml-1 border-l border-slate-200 pl-3">{people.map(u => <Person key={u.id} u={u} />)}</ul></div>
            })}
          </section>
        )
      })}
    </div>
  )
}

function Books({ data, run }: { data: SiteData; run: Run }) {
  const years = [...new Set([new Date().getFullYear(), ...(data.finance ?? []).map(e => +e.date.slice(0, 4))])].sort((a, b) => b - a)
  const [year, setYear] = useState(years[0])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const blank = (): PlatformEntry => ({ id: Math.random().toString(36).slice(2, 10), date: new Date().toISOString().slice(0, 10), kind: 'depense', category: 'hebergement', description: '', amount: 0, tps: 0, tvq: 0, agencyId: '', reference: '', createdAt: '' })
  const [e, setE] = useState<PlatformEntry | null>(null)
  const list = (data.finance ?? []).filter(x => x.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date))
  const sum = (k: 'revenu' | 'depense', f: 'amount' | 'tps' | 'tvq') => list.filter(x => x.kind === k).reduce((s, x) => s + x[f], 0)
  const rev = sum('revenu', 'amount'), dep = sum('depense', 'amount')
  const byCat = (k: 'revenu' | 'depense') => Object.entries(k === 'revenu' ? REV_CATS : DEP_CATS).map(([c, l]) => [l, list.filter(x => x.kind === k && x.category === c).reduce((s, x) => s + x.amount, 0)] as const).filter(([, v]) => v)
  const paying = data.agencies.filter(a => a.plan !== 'illimite')
  const csv = () => {
    const rows = [['Date', 'Type', 'Catégorie', 'Description', 'Agence', 'Référence', 'Montant', 'TPS', 'TVQ'], ...list.map(x => [x.date, x.kind, { ...REV_CATS, ...DEP_CATS }[x.category as keyof typeof REV_CATS] ?? x.category, x.description, data.agencies.find(a => a.id === x.agencyId)?.name ?? '', x.reference, x.amount.toFixed(2), x.tps.toFixed(2), x.tvq.toFixed(2)])]
    const blob = new Blob(['﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `immopilot-comptabilite-${year}.csv`; a.click()
  }
  const withTax = (x: PlatformEntry, amount: number) => ({ ...x, amount, tps: Math.round(amount * 5) / 100, tvq: Math.round(amount * 9.975) / 100 })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={year} onChange={ev => setYear(+ev.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select>
        <button className="btn-primary" onClick={() => setE(blank())}><Plus size={15} /> Écriture</button>
        <button className="btn-outline" onClick={csv}><Download size={15} /> CSV pour le comptable</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={Receipt} label={`Revenus ${year}`} value={money(rev)} sub={byCat('revenu').map(([l, v]) => `${l} ${money(v)}`).join(' · ') || '—'} />
        <Kpi icon={Receipt} label={`Dépenses ${year}`} value={money(dep)} sub={`${list.filter(x => x.kind === 'depense').length} écritures`} />
        <Kpi icon={Receipt} label="Bénéfice net" value={money(rev - dep)} sub="avant impôts" />
        <Kpi icon={Receipt} label="Taxes nettes à remettre" value={money(sum('revenu', 'tps') + sum('revenu', 'tvq') - sum('depense', 'tps') - sum('depense', 'tvq'))} sub={`TPS ${money(sum('revenu', 'tps') - sum('depense', 'tps'))} · TVQ ${money(sum('revenu', 'tvq') - sum('depense', 'tvq'))}`} />
      </div>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="font-semibold">Abonnements des agences</h3>
          <span className="text-xs text-slate-500">Tarif mensuel négocié (hors taxes) par agence</span>
          <input type="month" className="input ml-auto w-auto" value={month} onChange={ev => setMonth(ev.target.value)} />
          <button className="btn-outline" onClick={() => run({ action: 'billMonth', month }, b => alert(b.added ? `${b.added} abonnement(s) inscrit(s) aux revenus de ${month}.` : `Rien de nouveau à inscrire pour ${month}.`))}>Inscrire les abonnements du mois</button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">{tr("Agence")}</th><th className="th">Forfait</th><th className="th">{tr("Statut")}</th><th className="th text-right">Tarif mensuel</th></tr></thead>
          <tbody>{paying.map(a => (
            <tr key={a.id}><td className="td font-medium">{a.name}</td><td className="td">{PLAN_LABEL[a.plan]}</td><td className="td">{a.status}</td>
              <td className="td text-right"><input type="number" min="0" step="1" className="input w-32 py-1 text-right" defaultValue={a.monthlyFee ?? ''} placeholder="0 $" onBlur={ev => { const v = +ev.target.value || 0; if (v !== (a.monthlyFee ?? 0)) void run({ action: 'updateAgency', id: a.id, patch: { monthlyFee: v } }) }} /></td></tr>
          ))}</tbody></table></div>
      </section>

      <section className="card overflow-x-auto p-4">
        <h3 className="mb-2 font-semibold">Écritures {year}</h3>
        {list.length === 0 ? <p className="text-sm text-slate-500">Aucune écriture. Ajoutez vos dépenses (hébergement, logiciels…) et vos revenus (formations, implantation), ou inscrivez les abonnements du mois.</p> : (
          <table className="w-full text-sm"><thead><tr><th className="th">{tr("Date")}</th><th className="th">Description</th><th className="th">{tr("Catégorie")}</th><th className="th">Référence</th><th className="th text-right">Montant</th><th className="th text-right">TPS + TVQ</th><th className="th" /></tr></thead>
            <tbody>{list.map(x => (
              <tr key={x.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setE(x)}>
                <td className="td text-xs">{x.date}</td><td className="td">{x.kind === 'revenu' ? '+ ' : '− '}{x.description}</td>
                <td className="td text-xs">{{ ...REV_CATS, ...DEP_CATS }[x.category as keyof typeof REV_CATS] ?? x.category}</td><td className="td text-xs">{x.reference}</td>
                <td className={`td text-right ${x.kind === 'revenu' ? 'text-emerald-700' : ''}`}>{money(x.amount)}</td><td className="td text-right text-xs">{money(x.tps + x.tvq)}</td>
                <td className="td"><button className="text-rose-600" onClick={ev => { ev.stopPropagation(); if (confirm('Supprimer cette écriture?')) void run({ action: 'deleteEntry', id: x.id }) }}><Trash2 size={14} /></button></td>
              </tr>
            ))}</tbody></table>
        )}
      </section>

      {e && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setE(null)}>
          <div className="card w-full max-w-lg p-5" onClick={ev => ev.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Écriture comptable</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">{tr("Type")}</span><select className="input" value={e.kind} onChange={ev => setE({ ...e, kind: ev.target.value as PlatformEntry['kind'], category: ev.target.value === 'revenu' ? 'abonnement' : 'hebergement' })}><option value="depense">Dépense</option><option value="revenu">Revenu</option></select></label>
              <label><span className="label">{tr("Date")}</span><input type="date" className="input" value={e.date} onChange={ev => setE({ ...e, date: ev.target.value })} /></label>
              <label className="sm:col-span-2"><span className="label">{tr("Catégorie")}</span><select className="input" value={e.category} onChange={ev => setE({ ...e, category: ev.target.value })}>{Object.entries(e.kind === 'revenu' ? REV_CATS : DEP_CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="label">Description</span><input className="input" value={e.description} onChange={ev => setE({ ...e, description: ev.target.value })} placeholder={e.kind === 'revenu' ? 'Formation de groupe — Agence X' : 'Vercel Pro — septembre'} /></label>
              {e.kind === 'revenu' && <label className="sm:col-span-2"><span className="label">Agence (facultatif)</span><select className="input" value={e.agencyId} onChange={ev => setE({ ...e, agencyId: ev.target.value })}><option value="">—</option>{data.agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
              <label><span className="label">Montant hors taxes</span><input type="number" step="0.01" className="input" value={e.amount || ''} onChange={ev => setE(withTax(e, +ev.target.value))} /></label>
              <label><span className="label">No de facture / pièce</span><input className="input" value={e.reference} onChange={ev => setE({ ...e, reference: ev.target.value })} /></label>
              <label><span className="label">TPS</span><input type="number" step="0.01" className="input" value={e.tps || ''} onChange={ev => setE({ ...e, tps: +ev.target.value })} /></label>
              <label><span className="label">TVQ</span><input type="number" step="0.01" className="input" value={e.tvq || ''} onChange={ev => setE({ ...e, tvq: +ev.target.value })} /></label>
            </div>
            <p className="mt-2 text-xs text-slate-500">TPS et TVQ calculées automatiquement; mettez 0 pour un fournisseur étranger ou non inscrit.</p>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setE(null)}>{tr("Annuler")}</button><button className="btn-primary" disabled={!e.description || !e.amount} onClick={() => run({ action: 'saveEntry', entry: e }, () => setE(null))}>{tr("Enregistrer")}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
