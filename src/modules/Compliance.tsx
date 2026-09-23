import { useState } from 'react'
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { DOC_TYPES, defaultDocType, docProgress } from '../lib/compliance'
import { Avatar, DueBadge, Empty, PageHeader, Progress, ScopeFilter, Stat } from '../lib/ui'
import { daysUntil, fmtDate } from '../lib/utils'

// Tableau de conformité : complétude des dossiers de courtage et de transaction, documents manquants,
// avis et rappels. Pour l'administrateur et l'adjointe : toute l'agence; pour un courtier : ses dossiers.
export default function Compliance({ go }: PageProps) {
  const { db, me, mine } = useStore()
  const [agent, setAgent] = useState('')
  const [only, setOnly] = useState<'incomplets' | 'tous'>('incomplets')
  const deals = db.deals.filter(d => d.status === 'ouvert' || (d.status === 'conclu' && docProgress(d).pct < 100))
    .filter(d => mine(d.agentId)).filter(d => !agent || d.agentId === agent)
    .map(d => ({ d, p: docProgress(d), last: (d.notices ?? []).slice(-1)[0] }))
    .filter(x => only === 'tous' || x.p.pct < 100)
    .sort((a, b) => (a.d.docsDue || '9999').localeCompare(b.d.docsDue || '9999') || a.p.pct - b.p.pct)
  const all = db.deals.filter(d => d.status === 'ouvert').filter(d => mine(d.agentId)).map(d => docProgress(d))
  const overdue = deals.filter(x => x.d.docsDue && (daysUntil(x.d.docsDue) ?? 0) < 0 && x.p.pct < 100)
  const byAgent = db.members.filter(m => m.active).map(m => {
    const list = db.deals.filter(d => d.status === 'ouvert' && d.agentId === m.id).map(docProgress)
    return { m, n: list.length, missing: list.reduce((s, p) => s + p.missing.length, 0), pct: list.length ? Math.round(list.reduce((s, p) => s + p.pct, 0) / list.length) : 100 }
  }).filter(x => x.n > 0)

  return (
    <div>
      <PageHeader title="Conformité des dossiers" subtitle="Documents requis selon le type de dossier et la situation — avis et rappels aux courtiers"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={agent} onChange={e => setAgent(e.target.value)}><option value="">Tous les courtiers</option>{db.members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <select className="input w-auto" value={only} onChange={e => setOnly(e.target.value as 'incomplets' | 'tous')}><option value="incomplets">Dossiers incomplets</option><option value="tous">Tous les dossiers</option></select>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dossiers ouverts" value={all.length} icon={<ShieldCheck size={20} />} />
        <Stat label="Dossiers complets" value={all.filter(p => p.pct === 100).length} sub={`${all.length ? Math.round((all.filter(p => p.pct === 100).length / all.length) * 100) : 0} % de l’agence`} icon={<CheckCircle2 size={20} />} tone="green" />
        <Stat label="Documents manquants" value={all.reduce((s, p) => s + p.missing.length, 0)} sub={`${all.reduce((s, p) => s + p.pending.length, 0)} annoncés « à venir »`} icon={<FileWarning size={20} />} tone="amber" />
        <Stat label="Échéances dépassées" value={overdue.length} icon={<AlertTriangle size={20} />} tone={overdue.length ? 'rose' : 'sky'} />
      </div>

      {byAgent.length > 1 && !agent && (
        <section className="card mb-5 p-4">
          <h2 className="mb-3 font-semibold">Par courtier</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {byAgent.map(x => (
              <button key={x.m.id} onClick={() => setAgent(x.m.id)} className="rounded-lg border border-slate-200 p-3 text-left hover:border-brand-300">
                <div className="flex items-center gap-2 text-sm font-medium"><Avatar memberId={x.m.id} /> {x.m.name}</div>
                <div className="mt-2 flex items-center gap-2 text-xs"><Progress value={x.pct} /><span className="whitespace-nowrap">{x.pct} %</span></div>
                <div className="mt-1 text-xs text-slate-500">{x.n} dossier(s) · {x.missing} document(s) manquant(s)</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {deals.length === 0 ? <Empty>Tous les dossiers sont complets 👌</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Dossier</th><th className="th">Type</th><th className="th">Courtier</th><th className="th">Complétude</th><th className="th">Manquants</th><th className="th">Échéance</th><th className="th">Dernier avis</th></tr></thead>
            <tbody>
              {deals.map(({ d, p, last }) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => go('deals', d.id)}>
                  <td className="td font-medium">{d.title}</td>
                  <td className="td text-xs">{DOC_TYPES[defaultDocType(d)].label}{!d.docType && <span className="block text-amber-600">à confirmer</span>}</td>
                  <td className="td"><Avatar memberId={d.agentId} /></td>
                  <td className="td w-40"><div className="flex items-center gap-2 text-xs"><Progress value={p.pct} /><span className="whitespace-nowrap">{p.pct} %</span></div></td>
                  <td className="td text-xs" title={p.missing.map(x => x.label).join('\n')}>{p.missing.length} <span className="text-slate-400">({p.pending.length} à venir)</span></td>
                  <td className="td">{d.docsDue ? <DueBadge days={daysUntil(d.docsDue)} /> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="td text-xs">{last ? `${last.kind === 'rappel' ? 'Rappel' : 'Avis'} ${fmtDate(last.date)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Ouvrez un dossier → onglet « Documents » pour préciser la situation (copropriété, compagnie, succession…), marquer les documents et envoyer un avis. {me.role === 'adjointe' || me.role === 'admin' ? 'Les avis créent une tâche prioritaire pour le courtier concerné.' : ''}</p>
    </div>
  )
}
