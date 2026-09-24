import AgencyResources from '../components/AgencyResources'
import { tr } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { BUY_WORKFLOW, MARKETING_PLAN, REACTIVATION, SELL_WORKFLOW, SOP_SELLER, type SopSection } from '../lib/content'
import { Field, Modal, PageHeader, Tabs } from '../lib/ui'
import { copy, daysUntil, fillTemplate, fmtDate, fullName, uid } from '../lib/utils'
import type { Objection } from '../lib/types'

type Tab = 'rdv' | 'present' | 'process' | 'reactivation' | 'objections' | 'maitrise'

export default function Sop({ go }: PageProps) {
  const [tab, setTab] = useState<Tab>('rdv')
  return (
    <div>
      <PageHeader title={tr("SOP & scripts")} subtitle="Procédures de l’équipe : rendez-vous vendeur, processus, réactivation, objections" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[['rdv', 'SOP rendez-vous vendeur'], ['present', '▶ Mode présentation'], ['process', 'Processus vendeur / acheteur'], ['reactivation', 'Réactivation « All In »'], ['objections', 'Objections'], ['maitrise', 'À maîtriser par cœur']]} />
      <AgencyResources key={tab} area="sop" slot={tab === 'present' ? 'rdv' : tab} title={tab === 'rdv' || tab === 'present' ? 'Rendez-vous vendeur' : tab} initial={tab === 'rdv' || tab === 'present' ? SOP_SELLER.sections.map(s => [s.title, ...(s.bullets ?? []), ...(s.quotes ?? []), s.note ?? ''].join('\n')).join('\n\n') : ''}>
      {tab === 'rdv' && <SopFull />}
      {tab === 'present' && <Presenter />}
      {tab === 'process' && <Process />}
      {tab === 'reactivation' && <Reactivation go={go} />}
      {tab === 'objections' && <Objections />}
      {tab === 'maitrise' && <Mastery />}
      </AgencyResources>
    </div>
  )
}

function Section({ s }: { s: SopSection }) {
  return (
    <div>
      {s.bullets && <ul className="list-disc space-y-1 pl-5 text-sm">{s.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
      {s.quotes && <div className="mt-2 space-y-2">{s.quotes.map(q => <blockquote key={q} className="rounded-r-lg border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-sm italic">« {q} »</blockquote>)}</div>}
      {s.note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">⚑ {s.note}</p>}
      {s.id === 's5' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MARKETING_PLAN.map(g => <div key={g.group} className="rounded-lg border border-slate-200 p-2 text-xs"><b>{g.group}</b><div className="text-slate-600">{g.items.join(' · ')}</div></div>)}
        </div>
      )}
    </div>
  )
}

function SopFull() {
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-sm"><b>Objectif :</b> {SOP_SELLER.objective}</div>
        <div className="mt-2 rounded-lg bg-brand-600 p-3 text-sm text-white"><b>Règle d’or —</b> {SOP_SELLER.goldenRule}</div>
      </div>
      {SOP_SELLER.sections.map(s => (
        <details key={s.id} className="card p-4" open={s.id === 's1'}>
          <summary className="cursor-pointer font-semibold">{s.title}</summary>
          <div className="mt-3"><Section s={s} /></div>
        </details>
      ))}
    </div>
  )
}

function Presenter() {
  const [i, setI] = useState(0)
  const s = SOP_SELLER.sections
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') setI(x => Math.min(s.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [s.length])
  return (
    <div className="card mx-auto max-w-3xl p-6">
      <div className="mb-4 flex gap-1">{s.map((x, j) => <button key={x.id} onClick={() => setI(j)} className={`h-1.5 flex-1 rounded ${j <= i ? 'bg-brand-600' : 'bg-slate-200'}`} />)}</div>
      <h2 className="mb-4 text-2xl font-bold">{s[i].title}</h2>
      <div className="min-h-64 text-base"><Section s={s[i]} /></div>
      <div className="mt-6 flex justify-between">
        <button className="btn-outline" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={16} /> Précédent</button>
        <span className="text-sm text-slate-500">{i + 1} / {s.length} · flèches ← →</span>
        <button className="btn-primary" disabled={i === s.length - 1} onClick={() => setI(i + 1)}>Suivant <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

function Process() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[['Processus vendeur', SELL_WORKFLOW], ['Processus acheteur', BUY_WORKFLOW]].map(([t, wf]) => (
        <div key={t as string} className="card p-4">
          <h2 className="mb-3 font-semibold">{t as string}</h2>
          {(wf as typeof SELL_WORKFLOW).map(p => (
            <div key={p.id} className="mb-3">
              <div className="text-sm font-semibold text-brand-700">{p.title}</div>
              <ol className="list-decimal pl-5 text-sm text-slate-700">{p.steps.map(s => <li key={s.id}>{s.label}</li>)}</ol>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Reactivation({ go }: { go: PageProps['go'] }) {
  const { db, me, mine } = useStore()
  const dormant = db.contacts.filter(c => mine(c.ownerId) && !['perdu'].includes(c.stage) && (!c.lastContact || (daysUntil(c.lastContact) ?? 0) < -90))
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">{tr("Objectif")}</h2>
          <p className="text-sm">Réactiver d’anciens contacts afin de générer naturellement des références de propriétaires susceptibles de vendre ou souhaitant connaître la valeur de leur propriété.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{REACTIVATION.steps.map(s => <li key={s}>{s}</li>)}</ol>
        </div>
        {REACTIVATION.scripts.map(s => (
          <div key={s.name} className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{s.name}</h3><button className="btn-ghost text-xs" onClick={() => copy(s.body)}><Copy size={13} /> Copier</button></div>
            <p className="whitespace-pre-wrap text-sm">{s.body}</p>
          </div>
        ))}
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Annexe B — Amélioration continue</h3>
          <ul className="list-disc pl-5 text-sm">{REACTIVATION.improvements.map(s => <li key={s}>{s}</li>)}</ul>
        </div>
      </div>
      <div className="card h-fit p-4">
        <h2 className="mb-2 font-semibold">À réactiver ({dormant.length})</h2>
        <p className="mb-3 text-xs text-slate-500">Sans interaction depuis 90 jours et plus. Cliquez 💬 pour envoyer la version courte par texto.</p>
        <ul className="space-y-1.5">
          {dormant.map(c => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <button className="flex-1 text-left hover:underline" onClick={() => go('contacts', c.id)}>{fullName(c)}</button>
              <span className="text-xs text-slate-400">{c.lastContact ? fmtDate(c.lastContact) : 'jamais'}</span>
              {c.phone && <a href={`sms:${c.phone}?&body=${encodeURIComponent(fillTemplate(REACTIVATION.scripts[2].body.replace('[Prénom]', c.firstName), { courtier: me.name }))}`}>💬</a>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Objections() {
  const { db, upsert, remove } = useStore()
  const [editing, setEditing] = useState<Objection | null>(null)
  const [q, setQ] = useState('')
  const list = db.objections.filter(o => !q || (o.objection + o.response + o.category).toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="input" placeholder="Rechercher une objection…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-primary shrink-0" onClick={() => setEditing({ id: uid(), objection: '', response: '', category: 'Général' })}><Plus size={16} /> Ajouter au SOP</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map(o => (
          <button key={o.id} onClick={() => setEditing(o)} className="card p-4 text-left hover:border-brand-300">
            <span className="badge bg-slate-100">{o.category}</span>
            <div className="mt-2 font-semibold">« {o.objection} »</div>
            <p className="mt-1 text-sm text-slate-600">{o.response}</p>
          </button>
        ))}
      </div>
      {editing && (
        <Modal title="Objection" onClose={() => setEditing(null)}
          footer={<>
            <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('objections', editing.id); setEditing(null) }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>
            <button className="btn-primary" onClick={() => { upsert('objections', editing); setEditing(null) }}>{tr("Enregistrer")}</button>
          </>}>
          <div className="grid gap-3">
            <Field label={tr("Catégorie")}><input className="input" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} /></Field>
            <Field label="Objection"><input className="input" value={editing.objection} onChange={e => setEditing({ ...editing, objection: e.target.value })} /></Field>
            <Field label="Meilleure réponse"><textarea className="input min-h-32" value={editing.response} onChange={e => setEditing({ ...editing, response: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Mastery() {
  const { me } = useStore()
  const key = `immopilot-mastery-${me.id}`
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } })
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(key) || '{}')) } catch { setDone({}) } }, [key])
  const toggle = (k: string) => { const n = { ...done, [k]: !done[k] }; setDone(n); try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* ignore */ } }
  const n = SOP_SELLER.memorize.filter(m => done[m]).length
  return (
    <div className="card max-w-2xl p-4">
      <h2 className="mb-1 font-semibold">Éléments à maîtriser par cœur — {me.name}</h2>
      <p className="mb-3 text-sm text-slate-500">{n} / {SOP_SELLER.memorize.length} maîtrisés</p>
      {SOP_SELLER.memorize.map(m => (
        <label key={m} className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!done[m]} onChange={() => toggle(m)} />{m}</label>
      ))}
    </div>
  )
}
