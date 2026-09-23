import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Member, Role } from '../lib/types'
import { Avatar, Field, Modal, PageHeader, ROLES } from '../lib/ui'
import { money, uid } from '../lib/utils'

export default function Team(_: PageProps) {
  const { db, patch, isAdmin, mode } = useStore()
  const [editing, setEditing] = useState<Member | null>(null)
  const a = db.agency
  const setA = (k: keyof typeof a, v: string) => patch({ agency: { ...a, [k]: v } })
  return (
    <div>
      <PageHeader title="Équipe" subtitle="Une agence, plusieurs profils : courtiers, adjointes et membres d’équipe"
        actions={isAdmin && <button className="btn-primary" onClick={() => setEditing({ id: uid(), name: '', role: 'courtier', title: 'Courtier immobilier', phone: '', email: '', color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), split: 70, licence: '', active: true, googleDrive: false, googleCalendar: false })}><Plus size={16} /> Membre</button>} />

      {!isAdmin && <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Seul un administrateur de l’agence peut modifier l’équipe et les informations de l’agence.</p>}
      {mode === 'remote' && isAdmin && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">Chaque membre ajouté reçoit son propre accès (courriel + mot de passe temporaire à lui transmettre). Il devra choisir son mot de passe à la première connexion.</p>}
      <fieldset disabled={!isAdmin} className="card mb-5 p-4">
        <h2 className="mb-3 font-semibold">Agence</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nom de l’agence / équipe"><input className="input" value={a.name} onChange={e => setA('name', e.target.value)} /></Field>
          <Field label="Bureau"><input className="input" value={a.office} onChange={e => setA('office', e.target.value)} /></Field>
          <Field label="Téléphone"><input className="input" value={a.phone} onChange={e => setA('phone', e.target.value)} /></Field>
          <Field label="Courriel général"><input className="input" value={a.email} onChange={e => setA('email', e.target.value)} /></Field>
          <Field label="Site Web"><input className="input" value={a.website} onChange={e => setA('website', e.target.value)} /></Field>
          <Field label="Linktree"><input className="input" value={a.linktree} onChange={e => setA('linktree', e.target.value)} /></Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {db.members.map(m => {
          const listings = db.listings.filter(l => l.agentId === m.id && ['active', 'pa_acceptee', 'conditions_realisees'].includes(l.status)).length
          const deals = db.deals.filter(d => d.agentId === m.id && d.status === 'ouvert')
          const contacts = db.contacts.filter(c => c.ownerId === m.id).length
          const tasks = db.tasks.filter(t => t.assigneeId === m.id && !t.done).length
          return (
            <button key={m.id} onClick={() => isAdmin && setEditing(m)} className={`card p-4 text-left hover:shadow-md ${m.active ? '' : 'opacity-50'}`}>
              <div className="flex items-center gap-3">
                <Avatar memberId={m.id} size={44} />
                <div className="min-w-0"><div className="truncate font-semibold">{m.name}</div><div className="text-xs text-slate-500">{ROLES[m.role]} · {m.title}</div></div>
              </div>
              <div className="mt-3 text-xs text-slate-600">{m.phone} · {m.email}</div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Inscr.', listings], ['Dossiers', deals.length], ['Contacts', contacts], ['Tâches', tasks]].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-1.5"><div className="font-bold">{v}</div><div className="text-[10px] text-slate-500">{k}</div></div>)}
              </div>
              <div className="mt-2 text-xs text-slate-500">Volume ouvert : {money(deals.reduce((s, d) => s + d.price, 0))} · partage {m.split} %</div>
              <div className="mt-1 flex gap-1 text-[11px]">{m.googleDrive && <span className="badge bg-emerald-50 text-emerald-700">Drive</span>}{m.googleCalendar && <span className="badge bg-sky-50 text-sky-700">Agenda</span>}{m.googleEmail && <span className="badge bg-slate-100">relié</span>}</div>
            </button>
          )
        })}
      </div>
      {editing && <MemberForm m={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MemberForm({ m: init, onClose }: { m: Member; onClose: () => void }) {
  const { upsert, db, mode } = useStore()
  const [m, setM] = useState(init)
  const isNew = !db.members.some(x => x.id === m.id)
  const [password, setPassword] = useState(() => 'IP-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12))
  const needsAccess = mode === 'remote' && isNew
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setM(x => ({ ...x, [k]: v }))
  return (
    <Modal title={m.name || 'Nouveau membre'} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={() => {
        if (!m.name) return
        if (needsAccess && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return alert('Courriel valide requis pour créer l’accès.')
        upsert('members', (needsAccess ? { ...m, password } : m) as Member)
        if (needsAccess) alert(`Accès créé.\n\nCourriel : ${m.email}\nMot de passe temporaire : ${password}\nConnexion : ${location.origin}/connexion\n\nTransmettez ces informations au membre.`)
        onClose()
      }}>{needsAccess ? 'Créer l’accès' : 'Enregistrer'}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom complet"><input className="input" value={m.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Rôle"><select className="input" value={m.role} onChange={e => set('role', e.target.value as Role)}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Titre"><input className="input" value={m.title} onChange={e => set('title', e.target.value)} /></Field>
        <Field label="No de permis OACIQ"><input className="input" value={m.licence} onChange={e => set('licence', e.target.value)} /></Field>
        <Field label="Téléphone"><input className="input" value={m.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label={needsAccess ? 'Courriel de connexion *' : 'Courriel'}><input className="input" type="email" value={m.email} disabled={mode === 'remote' && !isNew} onChange={e => set('email', e.target.value)} /></Field>
        {needsAccess && <Field label="Mot de passe temporaire"><input className="input font-mono" value={password} onChange={e => setPassword(e.target.value)} /></Field>}
        <Field label="Partage de commission (% au courtier)"><input className="input" type="number" value={m.split} onChange={e => set('split', +e.target.value)} /></Field>
        <Field label="Couleur"><input className="input h-10" type="color" value={m.color} onChange={e => set('color', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={m.active} onChange={e => set('active', e.target.checked)} /> Membre actif</label>
        <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <div className="mb-1 text-sm font-semibold">Accès aux outils Google</div>
          <p className="mb-2 text-xs text-slate-500">Autorisez ce membre à relier son propre compte Google. Vous pourrez retirer l’accès en tout temps (le compte sera alors déconnecté).</p>
          <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="accent-brand-600" checked={!!m.googleDrive} onChange={e => set('googleDrive', e.target.checked)} /> Google Drive — dossiers des inscriptions, transactions et visites</label>
          <label className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="accent-brand-600" checked={!!m.googleCalendar} onChange={e => set('googleCalendar', e.target.checked)} /> Google Agenda — envoi des rendez-vous et visites</label>
          {m.googleEmail && <p className="mt-1 text-xs text-emerald-700">Compte relié : {m.googleEmail}</p>}
        </div>
      </div>
    </Modal>
  )
}
