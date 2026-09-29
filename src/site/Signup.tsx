import { useEffect, useState } from 'react'
import { Check, Loader2, Lock, RefreshCw, Sparkles, UserPlus } from 'lucide-react'

// Inscription libre-service : crée l'agence (essai de 30 jours) et son compte administrateur.
export default function Signup() {
  const [f, setF] = useState({ name: '', agencyName: '', email: '', phone: '', password: '', acceptTerms: false, website: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => { fetch('/api/auth').then(r => r.json()).then(b => { if (b.user) location.href = '/app'; setOpen(!!b.signup) }).catch(() => setOpen(false)) }, [])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'signup', ...f }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error || 'Inscription impossible.')
      location.href = b.redirect || '/app'
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const set = (k: keyof typeof f, v: string | boolean) => setF(x => ({ ...x, [k]: v }))
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink via-brand-700 to-brand-500 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        <div className="space-y-4 bg-slate-50 p-6 text-sm text-slate-700">
          <a href="/" className="text-xl font-bold">🏡 ImmoPilot</a>
          <h2 className="text-lg font-semibold text-slate-900">Votre espace de travail immobilier, relié à vos outils</h2>
          <div className="flex gap-2"><RefreshCw size={16} className="mt-0.5 shrink-0 text-brand-600" /><p><b>Connectez vos outils une fois</b> (Google, Outlook, Calendly, Mailchimp, Meta, Realtor.ca DDF…) : un clic sur « Actualiser » — puis la synchronisation automatique — rapproche les changements de vos contacts, dossiers, rendez-vous et statistiques.</p></div>
          <div className="flex gap-2"><Sparkles size={16} className="mt-0.5 shrink-0 text-brand-600" /><p><b>Assistant IA intégré</b> : résumés, incohérences, tâches proposées, statistiques expliquées — avec la source et la date de chaque information. Vous validez avant toute action.</p></div>
          <div className="flex gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-brand-600" /><p><b>Aucun compte ChatGPT requis</b> : l’IA passe par l’API OpenAI d’ImmoPilot, côté serveur. Nous ne vous demanderons jamais vos mots de passe ChatGPT ou de vos outils; les connexions se font chez chaque fournisseur et sont révocables.</p></div>
          <ul className="space-y-1 text-xs text-slate-500">{['Essai gratuit de 30 jours, jusqu’à 3 utilisateurs', 'Données de votre agence isolées et chiffrées au repos chez notre hébergeur', 'Vous invitez ensuite vos courtiers et adjointes depuis « Équipe »'].map(x => <li key={x} className="flex gap-1"><Check size={12} className="mt-0.5 text-emerald-600" />{x}</li>)}</ul>
        </div>
        <form onSubmit={submit} className="p-6">
          <h1 className="mb-4 text-lg font-semibold">Créer mon agence</h1>
          {open === false ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Les inscriptions en ligne sont fermées pour le moment. <a className="underline" href="/#contact">Contactez-nous</a> pour ouvrir votre espace.</p> : <>
            <label className="label">Votre nom</label><input className="input mb-3" required value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" />
            <label className="label">Nom de l’agence ou de l’équipe</label><input className="input mb-3" required value={f.agencyName} onChange={e => set('agencyName', e.target.value)} autoComplete="organization" />
            <label className="label">Courriel professionnel</label><input className="input mb-3" type="email" required value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
            <label className="label">Téléphone (facultatif)</label><input className="input mb-3" value={f.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />
            <label className="label">Mot de passe ImmoPilot (10 caractères min.)</label><input className="input mb-3" type="password" required minLength={10} value={f.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />
            <input type="text" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={e => set('website', e.target.value)} />
            <label className="mb-4 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" className="mt-0.5" checked={f.acceptTerms} onChange={e => set('acceptTerms', e.target.checked)} /> J’accepte les conditions d’utilisation et la politique de confidentialité, y compris le traitement des données autorisées par l’assistant IA (API OpenAI).</label>
            {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
            <button className="btn-primary w-full justify-center py-2.5" disabled={busy || open === null}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Créer mon espace</button>
          </>}
          <p className="mt-4 text-center text-xs text-slate-500">Déjà un compte? <a href="/connexion" className="font-medium text-brand-700 hover:underline">Se connecter</a> · Membre d’une agence existante? Demandez l’accès à votre administrateur.</p>
        </form>
      </div>
    </div>
  )
}
