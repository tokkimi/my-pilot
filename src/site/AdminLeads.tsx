import { tr } from '../lib/i18n'
// Onglet « Nouvelles demandes » de la console des fondateurs : boîte de réception des demandes du site
// (abonnements, formations, démonstrations), avec réponse par courriel, création d'agence et suivi.
import { useState } from 'react'
import { Building2, CalendarClock, Inbox, Mail, Phone, Send, Trash2 } from 'lucide-react'
import { leadType } from './AdminSite'

export interface Lead { id: string; createdAt: string; name: string; email: string; phone: string; agency: string; role: string; agents: string; interest: string; message: string; status: string; notes: string; scheduledAt?: string; history?: { at: string; by: string; text: string }[] }
type Run = (b: object, after?: (b: any) => void) => Promise<void>
type Secret = (s: { title: string; email: string; password: string }) => void

const STATUS: [string, string][] = [['nouveau', 'Nouvelles'], ['contacte', 'En cours'], ['converti', 'Converties'], ['archive', 'Archivées']]
const TYPES: [string, string, string][] = [['', 'Toutes', '📥'], ['abonnement', 'Abonnements', '📝'], ['formation', 'Cours et formations', '🎓'], ['demo', 'Démonstrations', '🖥️'], ['autre', 'Autres', '✉️']]
const ago = (s: string) => { const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j` }
const when = (s: string) => new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
const planOf = (interest: string) => (/solo/i.test(interest) ? 'solo' : /équipe/i.test(interest) ? 'equipe' : /réseau|bannière/i.test(interest) ? 'entreprise' : /agence/i.test(interest) ? 'agence' : 'essai')

function replyFor(l: Lead) {
  const first = l.name.split(' ')[0]
  const t = leadType(l)
  const intro = `Bonjour ${first},\n\nMerci pour votre intérêt envers ImmoPilot!`
  const body = t === 'formation'
    ? 'Nous serions ravis d’organiser une formation pour votre équipe. Les séances se font en groupe, en personne ou en visioconférence, et sont adaptées à vos processus.\n\nPouvez-vous nous indiquer le nombre de participants et deux ou trois plages horaires qui vous conviennent?'
    : t === 'abonnement'
      ? `Voici la suite : une courte rencontre (20 minutes) pour comprendre votre organisation${l.agents ? ` (${l.agents} personnes)` : ''}, puis nous vous envoyons une soumission adaptée et ouvrons votre accès.\n\nQuelles sont vos disponibilités cette semaine?`
      : 'Nous vous proposons une démonstration de 30 minutes en visioconférence : CRM, visites terrain sur cellulaire, conformité des dossiers et comptabilité.\n\nQuelles sont vos disponibilités cette semaine?'
  return { subject: `ImmoPilot — ${l.interest}`, body: `${intro}\n\n${body}\n\nAu plaisir,\nL’équipe ImmoPilot` }
}

export default function LeadsInbox({ leads, run, onSecret }: { leads: Lead[]; run: Run; onSecret: Secret }) {
  const [status, setStatus] = useState('nouveau')
  const [type, setType] = useState('')
  const [sel, setSel] = useState('')
  const list = leads.filter(l => l.status === status && (!type || leadType(l) === type)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cur = leads.find(l => l.id === sel) ?? list[0]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS.map(([k, l]) => {
          const n = leads.filter(x => x.status === k).length
          return <button key={k} onClick={() => { setStatus(k); setSel('') }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${status === k ? 'bg-ink text-white' : 'bg-white shadow-sm hover:bg-slate-100'}`}>{l}<span className={`rounded-full px-1.5 text-xs ${k === 'nouveau' && n ? 'bg-rose-500 text-white' : status === k ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span></button>
        })}
        <div className="ml-auto flex flex-wrap gap-1">
          {TYPES.map(([k, l, i]) => <button key={k} onClick={() => { setType(k); setSel('') }} className={`rounded-full px-3 py-1 text-xs ${type === k ? 'bg-brand-600 text-white' : 'bg-white shadow-sm hover:bg-slate-100'}`}>{i} {l} ({leads.filter(x => x.status === status && (!k || leadType(x) === k)).length})</button>)}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card p-10 text-center text-slate-500"><Inbox className="mx-auto mb-2 text-slate-300" size={40} />{status === 'nouveau' ? 'Aucune nouvelle demande. Les demandes envoyées depuis le formulaire du site arrivent ici automatiquement.' : 'Rien dans cette catégorie.'}</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="card max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
            {list.map(l => (
              <li key={l.id}><button onClick={() => setSel(l.id)} className={`w-full p-3 text-left hover:bg-slate-50 ${cur?.id === l.id ? 'bg-violet-50' : ''}`}>
                <div className="flex items-center gap-2">
                  {l.status === 'nouveau' && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  <span className="truncate font-medium">{l.name}</span><span className="ml-auto shrink-0 text-xs text-slate-400">{ago(l.createdAt)}</span>
                </div>
                <div className="truncate text-xs text-slate-500">{TYPES.find(t => t[0] === leadType(l))?.[2]} {l.interest}{l.agency && ` · ${l.agency}`}</div>
                {l.scheduledAt && <div className="text-xs text-emerald-700">📅 {when(l.scheduledAt)}</div>}
              </button></li>
            ))}
          </ul>
          {cur && <Detail key={cur.id} l={cur} run={run} onSecret={onSecret} />}
        </div>
      )}
    </div>
  )
}

function Detail({ l, run, onSecret }: { l: Lead; run: Run; onSecret: Secret }) {
  const [reply, setReply] = useState<{ subject: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const t = leadType(l)
  const update = (patch: object, log?: string) => run({ action: 'updateLead', id: l.id, patch, log })
  const send = async () => {
    if (!reply) return
    setBusy(true)
    try {
      const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${reply.body.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)).replace(/\n/g, '<br>')}</div>`
      const r = await fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: [l.email], subject: reply.subject, html, text: reply.body }) })
      const b = await r.json().catch(() => ({}))
      if (r.ok) { await update({ status: l.status === 'nouveau' ? 'contacte' : l.status }, `Courriel envoyé : « ${reply.subject} »`); setReply(null); alert(`Réponse envoyée à ${l.email}.`) }
      else if (b.fallback) { location.href = `mailto:${l.email}?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}`; await update({ status: l.status === 'nouveau' ? 'contacte' : l.status }, 'Réponse préparée dans le logiciel de courriel'); setReply(null) }
      else alert(b.error || 'Envoi impossible')
    } finally { setBusy(false) }
  }
  const createAgency = () => {
    const name = l.agency || `Agence de ${l.name}`
    if (!confirm(`Créer l’agence « ${name} » avec ${l.name} (${l.email}) comme administrateur?`)) return
    void run({ action: 'createAgency', name, plan: planOf(l.interest), contactEmail: l.email, adminName: l.name, adminEmail: l.email }, b => {
      if (b.error) alert(b.error)
      if (b.password) onSecret({ title: `Accès admin — ${name}`, email: l.email, password: b.password })
      void update({ status: 'converti' }, `Agence créée : ${name}`)
    })
  }
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{l.name}</h3>
          <div className="text-sm text-slate-500">{[l.role, l.agency, l.agents && `${l.agents} personne(s)`].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <div className="text-right"><span className="badge bg-brand-50 text-brand-700">{l.interest}</span><div className="mt-1 text-xs text-slate-500">reçue le {when(l.createdAt)}</div></div>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className="flex items-center gap-1 text-brand-700 hover:underline" href={`mailto:${l.email}`}><Mail size={14} /> {l.email}</a>
        {l.phone && <a className="flex items-center gap-1 text-brand-700 hover:underline" href={`tel:${l.phone}`}><Phone size={14} /> {l.phone}</a>}
      </div>
      {l.message && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{l.message}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setReply(replyFor(l))}><Send size={15} /> Répondre</button>
        {l.phone && <a className="btn-outline" href={`tel:${l.phone}`} onClick={() => void update({ status: l.status === 'nouveau' ? 'contacte' : l.status }, 'Appel')}><Phone size={15} /> Appeler</a>}
        {(t === 'abonnement' || t === 'demo') && l.status !== 'converti' && <button className="btn-outline" onClick={createAgency}><Building2 size={15} />{" "}{tr("Créer l’agence")}</button>}
        <label className="btn-outline cursor-pointer"><CalendarClock size={15} /> {t === 'formation' ? 'Date de formation' : 'Rendez-vous'}
          <input type="datetime-local" className="ml-1 border-0 bg-transparent p-0 text-sm outline-none" value={l.scheduledAt?.slice(0, 16) ?? ''} onChange={e => void update({ scheduledAt: e.target.value, status: l.status === 'nouveau' ? 'contacte' : l.status }, e.target.value ? `${t === 'formation' ? 'Formation' : 'Rendez-vous'} prévu le ${when(e.target.value)}` : 'Rendez-vous retiré')} />
        </label>
      </div>

      {reply && (
        <div className="space-y-2 rounded-lg border border-brand-200 bg-violet-50/40 p-3">
          <input className="input" value={reply.subject} onChange={e => setReply({ ...reply, subject: e.target.value })} />
          <textarea className="input min-h-48 text-sm" value={reply.body} onChange={e => setReply({ ...reply, body: e.target.value })} />
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReply(null)}>{tr("Annuler")}</button><button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Envoi…' : `Envoyer à ${l.email}`}</button></div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <label><span className="label">{tr("Statut")}</span><select className="input" value={l.status} onChange={e => void update({ status: e.target.value }, `Statut : ${STATUS.find(s => s[0] === e.target.value)?.[1]}`)}>{STATUS.map(([k, v]) => <option key={k} value={k}>{v.replace(/s$/, '')}</option>)}</select></label>
        <label><span className="label">Notes internes</span><input className="input" defaultValue={l.notes} placeholder="Budget, besoins, prochaine étape…" onBlur={e => e.target.value !== l.notes && void update({ notes: e.target.value })} /></label>
      </div>

      {(l.history?.length ?? 0) > 0 && (
        <div><div className="label">Historique</div>
          <ul className="space-y-1 text-xs text-slate-600">{[...l.history!].reverse().map((h, i) => <li key={i}>• {when(h.at)} — {h.text} <span className="text-slate-400">({h.by})</span></li>)}</ul></div>
      )}
      <button className="btn-ghost text-xs text-rose-600" onClick={() => confirm('Supprimer définitivement cette demande?') && void run({ action: 'deleteLead', id: l.id })}><Trash2 size={13} />{" "}{tr("Supprimer")}</button>
    </div>
  )
}
