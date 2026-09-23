import { tr } from '../lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Building2, ExternalLink, Globe, Inbox, KeyRound, LogOut, Plus, RefreshCw, Users, Activity, ScanLine } from 'lucide-react'
import SiteActivity, { type PlatformEntry } from './AdminSite'
import LeadsInbox from './AdminLeads'

// Console des propriétaires de la plateforme : statistiques d'utilisation, agences, utilisateurs, demandes du site.
type Plan = 'essai' | 'solo' | 'equipe' | 'agence' | 'entreprise' | 'illimite'
interface Agency { id: string; name: string; plan: Plan; seats: number; status: 'actif' | 'suspendu'; createdAt: string; contactEmail: string; notes: string; trialEnds: string }
interface User { id: string; email: string; name: string; role: string; agencyId: string; active: boolean; title: string; createdAt: string; lastLoginAt: string; lastSeenAt: string; loginCount: number; mustChangePassword: boolean; googleEmail?: string; googleDrive?: boolean; googleCalendar?: boolean }
import type { Lead } from './AdminLeads'
interface Usage { agencyId: string; contacts: number; listings: number; deals: number; tasks: number; visits: number; visitsDone: number; events: number; media: number }
interface Data { users: User[]; agencies: Agency[]; leads: Lead[]; activity: { days: Record<string, { logins: number; active: string[] }> }; usage: Usage[]; finance?: PlatformEntry[]; storage: string; email?: { configured: boolean; from: string; ok: boolean; domains: { name: string; status: string }[]; error: string }; google: { configured: boolean; picker: boolean; redirect: string } }

const PLAN_LABEL: Record<Plan, string> = { essai: 'Essai (30 j)', solo: 'Courtier solo', equipe: 'Équipe', agence: 'Agence', entreprise: 'Entreprise', illimite: 'Illimité (interne)' }
const ROLE_LABEL: Record<string, string> = { superadmin: 'Fondateur (super-admin)', admin: 'Admin agence', courtier: 'Courtier', adjointe: 'Adjointe', marketing: 'Équipe marketing', agent: 'Membre' }
const fmt = (s: string) => (s ? new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const ago = (s: string) => { if (!s) return 'jamais'; const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000); return d <= 0 ? 'aujourd’hui' : d === 1 ? 'hier' : `il y a ${d} j` }

async function api(body?: object) {
  const r = await fetch('/api/admin', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const b = await r.json().catch(() => ({}))
  if (r.status === 403 || r.status === 401) { location.href = '/connexion'; throw new Error('Accès refusé') }
  if (!r.ok) throw new Error(b.error || 'Erreur')
  return b
}

export default function Admin() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'site' | 'agencies' | 'users' | 'leads'>('overview')
  const [secret, setSecret] = useState<{ title: string; email: string; password: string } | null>(null)
  const [pw, setPw] = useState<{ current: string; next: string; msg: string } | null>(null)
  const changePw = async () => {
    if (!pw) return
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'password', current: pw.current, next: pw.next }) })
    const b = await r.json().catch(() => ({}))
    setPw({ ...pw, msg: r.ok ? 'Mot de passe modifié ✓' : b.error || 'Erreur' })
  }
  const load = () => api().then(setData).catch(e => setError(e.message))
  useEffect(() => {
    // ouvre directement les nouvelles demandes s'il y en a, puis actualise chaque minute
    api().then((d: Data) => { setData(d); if (d.leads.some(l => l.status === 'nouveau')) setTab('leads') }).catch(e => setError(e.message))
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60000)
    return () => clearInterval(t)
  }, [])
  const unread = data?.leads.filter(l => l.status === 'nouveau').length ?? 0
  useEffect(() => { document.title = `${unread ? `(${unread}) ` : ''}Console ImmoPilot` }, [unread])
  const run = async (body: object, after?: (b: any) => void) => { try { const b = await api(body); after?.(b); await load() } catch (e) { alert((e as Error).message) } }

  if (error) return <div className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-md p-6 text-center"><p className="text-rose-600">{error}</p><a href="/connexion" className="btn-primary mt-4">{tr("Connexion")}</a></div></div>
  if (!data) return <div className="flex min-h-screen items-center justify-center text-slate-500">Chargement de la console…</div>
  const newLeads = data.leads.filter(l => l.status === 'nouveau').length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="font-bold"><img src="/immopilot-logo.png" alt="ImmoPilot" className="brand-logo" /></a><span className="badge bg-brand-600 text-white">{tr("Console propriétaires")}</span>
          <nav className="flex max-w-full gap-1 overflow-x-auto text-sm sm:ml-4">
            {([['overview', 'Vue d’ensemble', Activity], ['leads', 'Nouvelles demandes', Inbox], ['site', 'Activité du site', Globe], ['agencies', 'Agences', Building2], ['users', 'Utilisateurs', Users]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 ${tab === k ? 'bg-white/15' : 'hover:bg-white/10'}`}><I size={15} />{l}{k === 'leads' && newLeads > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{newLeads}</span>}</button>
            ))}
          </nav>
          <div className="ml-auto flex gap-2 text-sm">
            <button className="flex items-center gap-1 rounded bg-brand-600 px-3 py-1" onClick={() => run({ action: 'openOwnAgency' }, b => { location.href = `/app?agency=${encodeURIComponent(b.agency.id)}` })}><Building2 size={15} />{" "}{tr("Mon agence")}</button>
            <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10" onClick={() => void load()}><RefreshCw size={14} />{" "}{tr("Actualiser")}</button>
            <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10" onClick={() => setPw({ current: '', next: '', msg: '' })}><KeyRound size={14} />{" "}{tr("Mot de passe")}</button>
            <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10" onClick={async () => { await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); location.href = '/connexion' }}><LogOut size={14} />{" "}{tr("Quitter")}</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {tab === 'overview' && <Overview data={data} />}
        {tab === 'site' && <SiteActivity data={data} run={run} onSecret={setSecret} />}
        {tab === 'agencies' && <Agencies data={data} run={run} onSecret={setSecret} />}
        {tab === 'users' && <UsersTab data={data} run={run} onSecret={setSecret} />}
        {tab === 'leads' && <LeadsInbox leads={data.leads} run={run} onSecret={setSecret} />}
      </main>
      {pw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="card w-full max-w-sm p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound size={18} /> Changer mon mot de passe</h2>
            <input className="input mb-2" type="password" placeholder="Mot de passe actuel" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
            <input className="input" type="password" placeholder="Nouveau (8 caractères min.)" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
            {pw.msg && <p className="mt-2 text-sm">{pw.msg}</p>}
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPw(null)}>{tr("Fermer")}</button><button className="btn-primary" onClick={changePw}>{tr("Enregistrer")}</button></div>
          </div>
        </div>
      )}
      {secret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={18} /> {secret.title}</h2>
            <p className="mt-2 text-sm text-slate-600">Transmettez ces accès de façon sécurisée. Le mot de passe temporaire ne sera plus affiché; l’utilisateur devra le changer à la première connexion.</p>
            <div className="mt-3 rounded-lg bg-slate-100 p-3 font-mono text-sm">Courriel : {secret.email}<br />Mot de passe : {secret.password}<br />Connexion : {location.origin}/connexion</div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => navigator.clipboard?.writeText(`Courriel : ${secret.email}\nMot de passe temporaire : ${secret.password}\nConnexion : ${location.origin}/connexion`)}>Copier</button>
              <button className="btn-primary" onClick={() => setSecret(null)}>{tr("Fermer")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="card p-4"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
}

function Overview({ data }: { data: Data }) {
  const users = data.users.filter(u => u.role !== 'superadmin')
  const within = (s: string, d: number) => !!s && Date.now() - new Date(s).getTime() < d * 86400000
  const sum = (k: keyof Usage) => data.usage.reduce((s, u) => s + (u[k] as number), 0)
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10); const x = data.activity.days[d]; return { d, active: x?.active.length ?? 0, logins: x?.logins ?? 0 } }), [data])
  const max = Math.max(1, ...days.map(d => d.active))
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="space-y-5">
      {data.storage !== 'blob' && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Stockage : <b>{data.storage}</b>. En production, connectez un Blob Store Vercel au projet pour conserver les données.</div>}
      {data.email && <div className={`rounded-lg p-3 text-sm ${data.email.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        Courriels (Resend) : <b>{!data.email.configured ? 'non configuré' : data.email.ok ? 'connecté' : `erreur — ${data.email.error}`}</b>
        {data.email.configured && <> · expéditeur : {data.email.from}</>}
        {data.email.domains.length > 0 && <> · domaines : {data.email.domains.map(d => `${d.name} (${d.status})`).join(', ')}</>}
        {data.email.ok && /resend\.dev/.test(data.email.from) && <div className="mt-1 text-xs">Adresse de test Resend : les envois ne partent que vers le courriel du compte Resend. Vérifiez votre domaine dans Resend pour écrire aux clients.</div>}
      </div>}
      <GoogleSetup g={data.google} connected={data.users.filter(u => u.googleEmail).length} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={tr("Agences")} value={data.agencies.length} sub={`${data.agencies.filter(a => a.status === 'actif').length} actives · ${data.agencies.filter(a => a.plan === 'essai').length} en essai`} />
        <Tile label={tr("Utilisateurs")} value={users.length} sub={`${users.filter(u => u.active).length} actifs`} />
        <Tile label="Actifs 7 jours" value={users.filter(u => within(u.lastSeenAt, 7)).length} sub={`${users.filter(u => within(u.lastSeenAt, 30)).length} sur 30 jours`} />
        <Tile label="Connexions (total)" value={users.reduce((s, u) => s + u.loginCount, 0)} sub={`${days.reduce((s, d) => s + d.logins, 0)} sur 30 jours`} />
        <Tile label={tr("Visites terrain")} value={sum('visits')} sub={`${sum('visitsDone')} terminées · ${sum('media')} médias`} />
        <Tile label="Contacts gérés" value={sum('contacts')} />
        <Tile label={tr("Inscriptions")} value={sum('listings')} sub={`${sum('deals')} dossiers`} />
        <Tile label="Demandes du site" value={data.leads.length} sub={`${data.leads.filter(l => l.status === 'nouveau').length} nouvelles`} />
      </div>

      <section className="card p-4">
        <h2 className="font-semibold">Utilisateurs actifs par jour</h2>
        <p className="mb-3 text-xs text-slate-500">30 derniers jours · survolez une barre pour le détail</p>
        <div className="relative flex h-44 items-end gap-[2px] border-b border-slate-200">
          {days.map((d, i) => (
            <div key={d.d} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={`w-full rounded-t ${hover === i ? 'bg-brand-700' : 'bg-brand-500'}`} style={{ height: `${(d.active / max) * 100}%`, minHeight: d.active ? 3 : 0 }} />
            </div>
          ))}
          {hover !== null && <div className="pointer-events-none absolute -top-2 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow" style={{ left: `${(hover / 30) * 100}%` }}>{new Date(days[hover].d + 'T12:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} · {days[hover].active} actif(s) · {days[hover].logins} connexion(s)</div>}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{new Date(days[0].d + 'T12:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}</span><span>max {max}</span><span>aujourd’hui</span></div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Utilisation par agence</h2>
        <table className="w-full"><thead><tr><th className="th">{tr("Agence")}</th><th className="th">Forfait</th><th className="th">Membres</th><th className="th">Actifs 7 j</th><th className="th">{tr("Contacts")}</th><th className="th">{tr("Inscriptions")}</th><th className="th">{tr("Dossiers")}</th><th className="th"><ScanLine size={12} className="inline" /> Visites</th><th className="th">Médias</th></tr></thead>
          <tbody>{data.agencies.map(a => { const u = data.usage.find(x => x.agencyId === a.id); const m = data.users.filter(x => x.agencyId === a.id); return (
            <tr key={a.id}><td className="td font-medium">{a.name}</td><td className="td">{PLAN_LABEL[a.plan]}</td><td className="td">{m.length}</td><td className="td">{m.filter(x => within(x.lastSeenAt, 7)).length}</td><td className="td">{u?.contacts ?? 0}</td><td className="td">{u?.listings ?? 0}</td><td className="td">{u?.deals ?? 0}</td><td className="td">{u?.visits ?? 0}</td><td className="td">{u?.media ?? 0}</td></tr>) })}</tbody></table>
      </section>
    </div>
  )
}

function Agencies({ data, run, onSecret }: { data: Data; run: (b: object, after?: (b: any) => void) => Promise<void>; onSecret: (s: { title: string; email: string; password: string }) => void }) {
  const [f, setF] = useState({ name: '', plan: 'essai' as Plan, seats: '', contactEmail: '', adminName: '', adminEmail: '', withDemo: false })
  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus size={16} />{" "}{tr("Nouvelle agence")}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Nom de l’agence *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <select className="input" value={f.plan} onChange={e => setF({ ...f, plan: e.target.value as Plan })}>{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="input" placeholder="Nb de sièges (0 = illimité, vide = forfait)" value={f.seats} onChange={e => setF({ ...f, seats: e.target.value })} />
          <input className="input" placeholder="Nom de l’admin de l’agence" value={f.adminName} onChange={e => setF({ ...f, adminName: e.target.value })} />
          <input className="input" placeholder="Courriel de l’admin (crée son accès)" value={f.adminEmail} onChange={e => setF({ ...f, adminEmail: e.target.value })} />
          <input className="input" placeholder="Courriel de facturation / contact" value={f.contactEmail} onChange={e => setF({ ...f, contactEmail: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={f.withDemo} onChange={e => setF({ ...f, withDemo: e.target.checked })} /> Inclure des données d’exemple</label>
        </div>
        <button className="btn-primary mt-3" disabled={!f.name} onClick={() => run({ action: 'createAgency', ...f, seats: f.seats === '' ? undefined : +f.seats }, b => { if (b.password) onSecret({ title: `Accès admin — ${f.name}`, email: f.adminEmail, password: b.password }); if (b.error) alert(b.error); setF({ name: '', plan: 'essai', seats: '', contactEmail: '', adminName: '', adminEmail: '', withDemo: false }) })}>{tr("Créer l’agence")}</button>
      </section>
      <section className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">{tr("Agence")}</th><th className="th">Forfait</th><th className="th">Sièges</th><th className="th">{tr("Statut")}</th><th className="th">Créée</th><th className="th">Fin d’essai</th><th className="th" /></tr></thead>
          <tbody>{data.agencies.map(a => (
            <tr key={a.id}>
              <td className="td font-medium">{a.name}<div className="text-xs text-slate-500">{a.contactEmail}</div></td>
              <td className="td"><select className="input py-1" value={a.plan} onChange={e => run({ action: 'updateAgency', id: a.id, patch: { plan: e.target.value } })}>{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td className="td"><input className="input w-20 py-1" type="number" defaultValue={a.seats} onBlur={e => +e.target.value !== a.seats && run({ action: 'updateAgency', id: a.id, patch: { seats: +e.target.value } })} /></td>
              <td className="td"><button className={`badge ${a.status === 'actif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`} onClick={() => run({ action: 'updateAgency', id: a.id, patch: { status: a.status === 'actif' ? 'suspendu' : 'actif' } })}>{a.status}</button></td>
              <td className="td text-xs">{fmt(a.createdAt)}</td>
              <td className="td"><input className="input py-1" type="date" defaultValue={a.trialEnds} onBlur={e => e.target.value !== a.trialEnds && run({ action: 'updateAgency', id: a.id, patch: { trialEnds: e.target.value } })} /></td>
              <td className="td"><a className="btn-outline py-1 text-xs" href={`/app?agency=${a.id}`}><ExternalLink size={13} />{" "}{tr("Ouvrir l’espace")}</a></td>
            </tr>
          ))}</tbody></table>
      </section>
    </div>
  )
}

function UsersTab({ data, run, onSecret }: { data: Data; run: (b: object, after?: (b: any) => void) => Promise<void>; onSecret: (s: { title: string; email: string; password: string }) => void }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState({ name: '', email: '', role: 'courtier', agencyId: data.agencies[0]?.id ?? '' })
  const list = data.users.filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
  const agencyName = (id: string) => data.agencies.find(a => a.id === id)?.name ?? (id === 'platform' ? 'Plateforme' : id)
  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus size={16} />{" "}{tr("Nouvel utilisateur")}</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input" placeholder={tr("Nom")} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input className="input" placeholder={tr("Courriel")} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).filter(([k]) => k !== 'superadmin').map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="superadmin">Super-admin (plateforme)</option></select>
          <select className="input" value={f.agencyId} onChange={e => setF({ ...f, agencyId: e.target.value })}>{data.agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="platform">Plateforme</option></select>
        </div>
        <button className="btn-primary mt-3" disabled={!f.email} onClick={() => run({ action: 'createUser', ...f }, b => { onSecret({ title: `Accès — ${f.name || f.email}`, email: f.email, password: b.password }); setF({ ...f, name: '', email: '' }) })}>{tr("Créer l’accès")}</button>
      </section>
      <input className="input" placeholder="Rechercher un utilisateur…" value={q} onChange={e => setQ(e.target.value)} />
      <section className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">Utilisateur</th><th className="th">{tr("Agence")}</th><th className="th">{tr("Rôle")}</th><th className="th">{tr("Dernière connexion")}</th><th className="th">{tr("Dernière activité")}</th><th className="th">Connexions</th><th className="th">Google</th><th className="th">{tr("Statut")}</th><th className="th" /></tr></thead>
          <tbody>{list.map(u => (
            <tr key={u.id}>
              <td className="td font-medium">{u.name}<div className="text-xs text-slate-500">{u.email}{u.mustChangePassword && ' · mot de passe temporaire'}</div></td>
              <td className="td text-sm">{agencyName(u.agencyId)}</td>
              <td className="td">{u.role === 'superadmin' ? <span className="badge bg-brand-600 text-white">Super-admin</span> : <select className="input py-1" value={u.role} onChange={e => run({ action: 'updateUser', id: u.id, patch: { role: e.target.value } })}>{Object.entries(ROLE_LABEL).filter(([k]) => k !== 'superadmin').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</td>
              <td className="td text-xs">{fmt(u.lastLoginAt)}</td>
              <td className="td text-xs">{ago(u.lastSeenAt)}</td>
              <td className="td">{u.loginCount}</td>
              <td className="td text-xs">{u.googleEmail || <span className="text-slate-400">—</span>}</td>
              <td className="td">{u.role === 'superadmin' ? '—' : <button className={`badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`} onClick={() => run({ action: 'updateUser', id: u.id, patch: { active: !u.active } })}>{u.active ? 'actif' : 'désactivé'}</button>}</td>
              <td className="td"><button className="btn-ghost py-1 text-xs" onClick={() => confirm(`Réinitialiser le mot de passe de ${u.email}?`) && run({ action: 'resetPassword', id: u.id }, b => onSecret({ title: `Nouveau mot de passe — ${u.name}`, email: u.email, password: b.password }))}><KeyRound size={13} />{" "}{tr("Réinitialiser")}</button></td>
            </tr>
          ))}</tbody></table>
      </section>
    </div>
  )
}


function GoogleSetup({ g, connected }: { g: Data['google']; connected: number }) {
  const [open, setOpen] = useState(!g.configured)
  return (
    <section className={`card p-4 ${g.configured ? '' : 'border-amber-300'}`}>
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="font-semibold">Intégration Google (Drive & Agenda) — {g.configured ? <span className="text-emerald-700">active · {connected} compte(s) relié(s){g.picker ? '' : ' · sélecteur de fichiers inactif'}</span> : <span className="text-amber-700">à configurer</span>}</span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Sur <a className="text-brand-700 underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a>, créez un projet « ImmoPilot ».</li>
          <li>Activez les API <b>Google Drive API</b>, <b>Google Calendar API</b> et <b>Google Picker API</b> (API et services → Bibliothèque).</li>
          <li>Écran de consentement OAuth : type « Externe », nom ImmoPilot, logo, courriel de soutien, domaine <code>immopilot-crm.vercel.app</code>, liens vers la politique de confidentialité. Portées : <code>drive.file</code>, <code>calendar.events</code>, <code>openid</code>, <code>email</code>.</li>
          <li>Identifiants → Créer un « ID client OAuth » (application Web). URI de redirection autorisé : <code className="break-all">{g.redirect}</code></li>
          <li>Identifiants → Créer une « clé API » (restreinte à l’API Picker et au domaine du site).</li>
          <li>Dans Vercel → projet → Settings → Environment Variables, ajoutez <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_API_KEY</code> et <code>GOOGLE_APP_ID</code> (numéro du projet), puis redéployez.</li>
          <li>Tant que l’application n’est pas vérifiée par Google, ajoutez les courriels des utilisateurs comme « testeurs » (100 max.). Demandez ensuite la vérification (Agenda est une portée sensible).</li>
        </ol>
      )}
    </section>
  )
}
