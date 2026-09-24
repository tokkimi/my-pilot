import { tr, language } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'

const t = (fr: string, en: string) => language === 'en' ? en : fr

export default function Login() {
  const signup = location.pathname === '/inscription'
  const [name, setName] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState('')
  useEffect(() => {
    fetch('/api/auth').then(r => r.json()).then(b => {
      setStorage(b.storage ?? '')
      if (b.user) location.href = b.user.role === 'superadmin' ? '/admin' : '/app'
    }).catch(() => setStorage('offline'))
  }, [])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: signup ? 'signup' : 'login', email, password, name, agencyName }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error || 'Connexion impossible.')
      location.href = b.redirect || '/app'
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="login-glass flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <a href="/" className="text-xl font-bold"><img src="/immopilot-logo.png" alt="ImmoPilot" className="brand-logo" /></a>
        <h1 className="mt-4 text-lg font-semibold">{signup ? t('Créer votre espace agence', 'Create your agency workspace') : tr('Connexion à votre espace')}</h1>
        <p className="mb-4 text-sm text-slate-500">{tr("Agences, courtiers et membres d’équipe.")}</p>
        {storage === 'none' && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">L’espace sécurisé est en cours d’activation (stockage non connecté). Utilisez la démo en attendant.</p>}
        {signup && <><label className="label" htmlFor="signup-name">{t("Votre nom", "Your name")}</label><input id="signup-name" className="input mb-3" required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /><label className="label" htmlFor="signup-agency">{t("Nom de l’agence", "Agency name")}</label><input id="signup-agency" className="input mb-3" required maxLength={160} autoComplete="organization" value={agencyName} onChange={e => setAgencyName(e.target.value)} /><p className="mb-3 text-sm">{t("Votre espace privé, avec 3 membres pour démarrer. Aucun compte externe requis pour utiliser les outils internes.", "Your private workspace, with 3 team members to get started. No external account needed for internal tools.")}</p></>}
        <label className="label" htmlFor="login-email">{tr("Courriel")}</label>
        <input id="login-email" className="input mb-3" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        <label className="label" htmlFor="login-password">{tr("Mot de passe")} {signup && t("(12 caractères minimum)", "(at least 12 characters)")}</label>
        <input id="login-password" className="input mb-4" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 12 : undefined} maxLength={200} required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full justify-center py-2.5" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} {signup ? t('Créer mon agence', 'Create my agency') : tr('Se connecter')}</button>
        <div className="mt-4 flex justify-between text-xs text-slate-500">
          <a href="/demo" className="hover:underline">{tr("Essayer la démo →")}</a>
          <a href={signup ? "/connexion" : "/inscription"} className="hover:underline">{signup ? t("J’ai déjà un compte", "I already have an account") : t("Créer mon agence", "Create my agency")}</a>
        </div>
      </form>
    </div>
  )
}
