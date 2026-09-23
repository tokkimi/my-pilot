import { useState } from 'react'
import { useStore } from '../lib/store'
import { Field, Modal } from '../lib/ui'

export function AccountModal({ onClose, forced }: { onClose: () => void; forced?: boolean }) {
  const { session } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const submit = async () => {
    if (next !== confirm) return setMsg('Les mots de passe ne correspondent pas.')
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'password', current, next }) })
    const b = await r.json().catch(() => ({}))
    if (!r.ok) return setMsg(b.error || 'Erreur')
    setOk(true); setMsg('Mot de passe modifié.')
  }
  return (
    <Modal title="Mon compte" onClose={onClose} footer={ok ? <button className="btn-primary" onClick={onClose}>Fermer</button> : <><button className="btn-ghost" onClick={onClose}>{forced ? 'Plus tard' : 'Annuler'}</button><button className="btn-primary" onClick={submit}>Changer le mot de passe</button></>}>
      <div className="mb-3 text-sm text-slate-600">{session?.user.name} · {session?.user.email}</div>
      {forced && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Vous utilisez un mot de passe temporaire. Choisissez votre propre mot de passe.</p>}
      {!ok && (
        <div className="grid gap-3">
          <Field label="Mot de passe actuel"><input className="input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></Field>
          <Field label="Nouveau mot de passe (8 caractères min.)"><input className="input" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} /></Field>
          <Field label="Confirmer"><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg}</p>}
    </Modal>
  )
}
