import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, HardDrive, Link2, Loader2, LogOut, ShieldCheck, XCircle } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { connectGoogle, disconnectGoogle, googleStatus, pushEvent, type GoogleStatus } from '../lib/google'
import { Avatar, Empty, PageHeader, ROLES } from '../lib/ui'
import type { Member } from '../lib/types'

export default function Google({ openId }: PageProps) {
  const { db, me, mode, isAdmin, upsert, session } = useStore()
  const [st, setSt] = useState<GoogleStatus | null>(null)
  const [msg, setMsg] = useState(openId === 'ok' ? '✓ Compte Google relié.' : openId?.startsWith('erreur:') ? decodeURIComponent(openId.slice(7)) : '')
  const [busy, setBusy] = useState('')
  const reload = () => googleStatus(true).then(setSt)
  useEffect(() => { if (mode === 'remote') void reload() }, [mode])

  const syncCalendar = async () => {
    setBusy('Synchronisation…'); setMsg('')
    try {
      const now = Date.now()
      const mine = db.events.filter(e => e.agentId === me.id && new Date(e.start).getTime() > now - 86400000 && new Date(e.start).getTime() < now + 90 * 86400000)
      let n = 0
      for (const e of mine) {
        const id = await pushEvent(e, e.google?.[me.id])
        if (id !== e.google?.[me.id]) upsert('events', { ...e, google: { ...(e.google ?? {}), [me.id]: id } })
        n++
      }
      setMsg(`✓ ${n} événement(s) envoyé(s) vers votre Google Agenda.`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy('') }
  }
  const setPerm = (m: Member, k: 'googleDrive' | 'googleCalendar', v: boolean) => {
    if (!v && m.googleEmail && !confirm(`Retirer cet accès déconnectera immédiatement le compte Google de ${m.name}. Continuer?`)) return
    upsert('members', { ...m, [k]: v })
  }

  if (mode === 'local') {
    return (
      <div>
        <PageHeader title="Google Drive & Agenda" />
        <Empty>La connexion Google est disponible dans l’espace sécurisé de l’agence (<a href="/connexion" className="text-brand-700 underline">se connecter</a>). En démo, vous pouvez coller des liens de dossiers dans les inscriptions et dossiers.</Empty>
      </div>
    )
  }
  const scopes = st?.connected?.scopes ?? ''
  return (
    <div className="space-y-5">
      <PageHeader title="Google Drive & Agenda" subtitle="Chaque membre relie son propre compte Google, selon les accès accordés par l’administrateur de l’agence" />
      {msg && <div className={`rounded-lg p-3 text-sm ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg}</div>}
      {!st ? <Loader2 className="animate-spin text-slate-400" /> : !st.configured ? (
        <div className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Connexion Google pas encore activée</h2>
          <p className="text-slate-600">Le propriétaire de la plateforme doit ajouter les clés Google (projet Google Cloud) dans la configuration. Dès que c’est fait, chaque membre autorisé pourra relier son compte ici.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Mon compte Google</h2>
            <div className="mb-3 space-y-1 text-sm">
              <Perm ok={st.allowed.drive} label="Google Drive" detail="dossiers des inscriptions, dossiers et visites" />
              <Perm ok={st.allowed.calendar} label="Google Agenda" detail="envoi de vos rendez-vous et visites" />
            </div>
            {!st.allowed.drive && !st.allowed.calendar ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">L’administrateur de votre agence n’a pas encore autorisé l’accès Google pour votre profil.</p>
            ) : st.connected ? (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={16} /> Relié à <b>{st.connected.email}</b></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scopes.includes('calendar') && <button className="btn-primary" onClick={syncCalendar} disabled={!!busy}><CalendarDays size={15} /> {busy || 'Envoyer mes événements vers Google Agenda'}</button>}
                  <button className="btn-ghost text-rose-600" onClick={async () => { await disconnectGoogle(); await reload(); setMsg('Compte Google déconnecté.') }}><LogOut size={15} /> Déconnecter</button>
                </div>
                <p className="mt-3 text-xs text-slate-500">ImmoPilot ne voit que les fichiers qu’il crée ou que vous choisissez vous-même — jamais le reste de votre Drive.</p>
              </>
            ) : (
              <button className="btn-primary" onClick={connectGoogle}><Link2 size={15} /> Relier mon compte Google</button>
            )}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><HardDrive size={16} className="text-emerald-600" /> Ce que ça permet</h2>
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              <li>Créer en un clic le dossier Drive d’une inscription ou d’un dossier de transaction, avec ses sous-dossiers (contrat, conformité, documents, promesse d’achat, notaire).</li>
              <li>Téléverser ou joindre des fichiers de votre Drive directement depuis la fiche.</li>
              <li>Exporter une visite terrain (vidéos, photos, notes vocales, plan, rapport) dans son dossier Drive.</li>
              <li>Envoyer vos rendez-vous, visites, inspections et dates de notaire dans Google Agenda.</li>
            </ul>
          </section>
        </div>
      )}

      {isAdmin && (
        <section className="card overflow-x-auto">
          <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold"><ShieldCheck size={17} className="text-brand-600" /> Accès Google des membres</h2>
          <p className="px-4 pb-2 text-xs text-slate-500">Vous décidez qui peut relier Google Drive et Google Agenda. Retirer un accès déconnecte immédiatement le compte Google du membre.</p>
          <table className="w-full">
            <thead><tr><th className="th">Membre</th><th className="th">Rôle</th><th className="th">Google Drive</th><th className="th">Google Agenda</th><th className="th">Compte relié</th></tr></thead>
            <tbody>
              {db.members.filter(m => m.active).map(m => (
                <tr key={m.id}>
                  <td className="td"><span className="flex items-center gap-2"><Avatar memberId={m.id} />{m.name}</span></td>
                  <td className="td text-xs">{ROLES[m.role]}</td>
                  <td className="td"><Toggle on={!!m.googleDrive} disabled={m.id === session?.user.id} onChange={v => setPerm(m, 'googleDrive', v)} /></td>
                  <td className="td"><Toggle on={!!m.googleCalendar} disabled={m.id === session?.user.id} onChange={v => setPerm(m, 'googleCalendar', v)} /></td>
                  <td className="td text-xs">{m.googleEmail || <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function Perm({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <div className="flex items-center gap-2">{ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-slate-400" />}<b>{label}</b><span className="text-slate-500">— {ok ? detail : 'non autorisé'}</span></div>
}
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-pressed={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}
