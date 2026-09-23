import { AlarmClock, Cake, CalendarDays, CheckSquare, DollarSign, FileCheck2, Home, PartyPopper, RefreshCcw, Users } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { DEAL_DATES } from '../lib/content'
import { dateDone } from './Deals'
import { Avatar, DueBadge, EVENT_TYPES, PageHeader, ScopeFilter, STAGES, Stat, Empty } from '../lib/ui'
import { daysToAnniversary, daysUntil, fmtDate, fullName, money, parseDate } from '../lib/utils'
import type { Stage } from '../lib/types'
import { useState } from 'react'
import { Play, ScanLine } from 'lucide-react'
import { StartVisit, VISIT_TYPES, normalizeVisit, upcomingVisits } from './Visits'

export default function Dashboard({ go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [startVisit, setStartVisit] = useState(false)
  const visits = upcomingVisits((db.visits ?? []).map(normalizeVisit).filter(v => mine(v.agentId)))
  const listings = db.listings.filter(l => mine(l.agentId))
  const deals = db.deals.filter(d => mine(d.agentId))
  const contacts = db.contacts.filter(c => mine(c.ownerId))
  const tasks = db.tasks.filter(t => mine(t.assigneeId) && !t.done)
  const openDeals = deals.filter(d => d.status === 'ouvert')
  const active = listings.filter(l => ['active', 'pa_acceptee', 'conditions_realisees'].includes(l.status))
  const pipelineGross = openDeals.reduce((s, d) => s + d.price * d.commissionPct / 100, 0)
  const year = new Date().getFullYear()
  const closedYear = deals.filter(d => d.status === 'conclu' && (parseDate(d.dates.acte || d.createdAt)?.getFullYear() === year))
  const gciYear = closedYear.reduce((s, d) => s + d.price * d.commissionPct / 100, 0)
  const newLeads = contacts.filter(c => (daysUntil(c.createdAt) ?? -999) >= -30).length
  const dueTasks = tasks.filter(t => (daysUntil(t.due) ?? 99) <= 0)

  const deadlines = openDeals.flatMap(d => DEAL_DATES.filter(k => d.dates[k.key] && !dateDone(d, k.key)).map(k => ({ deal: d, key: k.key, label: k.label, date: d.dates[k.key], days: daysUntil(d.dates[k.key]) ?? 0 })))
    .filter(x => x.days <= 21 && (x.days >= 0 || ['inspection', 'financement', 'autres', 'acte'].includes(x.key))).sort((a, b) => a.days - b.days)

  const now = new Date()
  const week = db.events.filter(e => mine(e.agentId)).map(e => ({ e, d: parseDate(e.start)! })).filter(x => x.d && x.d >= new Date(now.toDateString()) && x.d.getTime() - now.getTime() < 7 * 86400000)
    .sort((a, b) => a.d.getTime() - b.d.getTime())

  const birthdays = contacts.map(c => ({ c, days: daysToAnniversary(c.birthday) })).filter(x => x.days !== null && x.days <= 14).sort((a, b) => a.days! - b.days!)
  const anniversaries = contacts.map(c => ({ c, days: daysToAnniversary(c.closingDate) })).filter(x => x.c.closingDate && x.days !== null && x.days <= 30).sort((a, b) => a.days! - b.days!)
  const dormant = contacts.filter(c => ['ancien_client', 'sphere', 'prospect'].includes(c.type) && (!c.lastContact || (daysUntil(c.lastContact) ?? 0) < -90)).slice(0, 6)
  const byStage = (Object.keys(STAGES) as Stage[]).map(s => ({ s, n: contacts.filter(c => c.stage === s).length }))
  const maxStage = Math.max(1, ...byStage.map(x => x.n))

  const hello = now.getHours() < 12 ? 'Bon matin' : now.getHours() < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div>
      <PageHeader title={`${hello}, ${me.name.split(' ')[0]} 👋`} subtitle={now.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} actions={<><ScopeFilter /><button className="btn-primary" onClick={() => setStartVisit(true)}><Play size={16} /> Démarrer une visite</button></>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Inscriptions en vigueur" value={active.length} sub={`${listings.filter(l => l.status === 'preparation').length} en préparation`} icon={<Home size={20} />} />
        <Stat label="Dossiers ouverts" value={openDeals.length} sub={money(openDeals.reduce((s, d) => s + d.price, 0)) + ' en volume'} icon={<FileCheck2 size={20} />} tone="sky" />
        <Stat label="Commissions brutes en cours" value={money(pipelineGross)} sub={`${money(gciYear)} conclues en ${year}`} icon={<DollarSign size={20} />} tone="green" />
        <Stat label="Tâches à faire" value={tasks.length} sub={`${dueTasks.length} dues ou en retard · ${newLeads} leads (30 j)`} icon={<CheckSquare size={20} />} tone={dueTasks.length ? 'rose' : 'amber'} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlarmClock size={18} className="text-rose-500" /> Tableau blanc — délais des transactions</h2>
          {deadlines.length === 0 ? <Empty>Aucun délai dans les 3 prochaines semaines.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {deadlines.map((x, i) => (
                <li key={i} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-slate-50" onClick={() => go('deals', x.deal.id)}>
                  <Avatar memberId={x.deal.agentId} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{x.label}</div>
                    <div className="truncate text-xs text-slate-500">{x.deal.title}</div>
                  </div>
                  <span className="text-xs text-slate-500">{fmtDate(x.date)}</span>
                  <DueBadge days={x.days} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CheckSquare size={18} className="text-brand-600" /> Tâches prioritaires</h2>
          {tasks.length === 0 ? <Empty>Rien à faire 🎉</Empty> : (
            <ul className="space-y-1">
              {[...tasks].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8).map(t => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 accent-brand-600" checked={t.done} onChange={() => upsert('tasks', { ...t, done: true })} />
                  <span className="flex-1">{t.title}</span>
                  <DueBadge days={daysUntil(t.due)} />
                </li>
              ))}
            </ul>
          )}
          <button className="btn-ghost mt-2 w-full justify-center" onClick={() => go('tasks')}>Toutes les tâches →</button>
        </section>

        {visits.length > 0 && (
          <section className="card p-4 lg:col-span-3">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><ScanLine size={18} className="text-brand-600" /> Visites terrain à venir / en cours</h2>
            <div className="flex gap-2 overflow-x-auto">
              {visits.slice(0, 8).map(v => (
                <button key={v.id} onClick={() => go('visits', v.id)} className="min-w-56 rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-brand-300">
                  <div className="text-xs text-slate-500">{VISIT_TYPES[v.type].icon} {VISIT_TYPES[v.type].label}</div>
                  <div className="truncate font-semibold">{v.title}</div>
                  <div className="text-xs text-slate-500">{fmtDate(v.date, true)} {v.status === 'en_cours' && <span className="text-rose-600">● en cours</span>}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarDays size={18} className="text-sky-600" /> 7 prochains jours</h2>
          {week.length === 0 ? <Empty>Agenda libre.</Empty> : (
            <ul className="space-y-2">
              {week.map(({ e, d }) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-[10px] uppercase text-slate-500">{d.toLocaleDateString('fr-CA', { weekday: 'short' })}</div>
                    <div className="font-bold">{d.getDate()}</div>
                  </div>
                  <div className="flex-1 border-l-4 pl-2" style={{ borderColor: EVENT_TYPES[e.type].color }}>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-slate-500">{d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} · {EVENT_TYPES[e.type].label}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Cake size={18} className="text-pink-500" /> Plan d’action — fêtes & anniversaires</h2>
          {now.getMonth() === 11 && <div className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">🎄 Décembre : envoyer les vœux de Noël à la base de données (modèle « Joyeux Noël »).</div>}
          {birthdays.length + anniversaries.length === 0 ? <Empty>Aucune occasion dans les 2 prochaines semaines.</Empty> : (
            <ul className="space-y-1.5 text-sm">
              {birthdays.map(({ c, days }) => (
                <li key={c.id} className="flex items-center gap-2"><Cake size={14} className="text-pink-500" /><button className="flex-1 text-left hover:underline" onClick={() => go('contacts', c.id)}>{fullName(c)}</button><span className="text-xs text-slate-500">{days === 0 ? 'Aujourd’hui!' : `dans ${days} j`}</span></li>
              ))}
              {anniversaries.map(({ c, days }) => (
                <li key={c.id + 'a'} className="flex items-center gap-2"><PartyPopper size={14} className="text-amber-500" /><button className="flex-1 text-left hover:underline" onClick={() => go('contacts', c.id)}>{fullName(c)} — anniv. d’achat</button><span className="text-xs text-slate-500">dans {days} j</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><RefreshCcw size={18} className="text-emerald-600" /> Réactivation « All In »</h2>
          <p className="mb-2 text-xs text-slate-500">Contacts sans nouvelles depuis 90 jours et plus.</p>
          {dormant.length === 0 ? <Empty>Base de données à jour 👌</Empty> : (
            <ul className="space-y-1.5 text-sm">
              {dormant.map(c => (
                <li key={c.id} className="flex items-center gap-2">
                  <button className="flex-1 text-left hover:underline" onClick={() => go('contacts', c.id)}>{fullName(c)}</button>
                  <span className="text-xs text-slate-500">{c.lastContact ? fmtDate(c.lastContact) : 'jamais'}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-ghost mt-2 w-full justify-center" onClick={() => go('sop')}>Scripts de réactivation →</button>
        </section>

        <section className="card p-4 lg:col-span-3">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users size={18} className="text-indigo-600" /> Pipeline de contacts</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {byStage.map(({ s, n }) => (
              <button key={s} onClick={() => go('pipeline')} className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-50">
                <div className="flex h-20 w-full items-end justify-center">
                  <div className="w-8 rounded-t bg-brand-500/80" style={{ height: `${(n / maxStage) * 100}%`, minHeight: 4 }} />
                </div>
                <div className="text-lg font-bold">{n}</div>
                <div className="text-center text-[11px] leading-tight text-slate-500">{STAGES[s]}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
      {startVisit && <StartVisit agentId={me.id} onClose={() => setStartVisit(false)} onStart={v => { upsert('visits', v); setStartVisit(false); go('visits', v.id) }} />}
    </div>
  )
}
