import { useEffect, useState } from 'react'
import { language } from '../lib/i18n'
import { MONTHLY_PLANS } from '../lib/plans'
const t = (fr: string, en: string) => language === 'en' ? en : fr
export default function Subscription() {
  const [state, setState] = useState<{ expired: boolean; members: number; canManage: boolean; agency?: { name: string; plan: string } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/subscription').then(async r => { if (r.status === 401) { location.href = '/connexion'; return } if (!r.ok) throw new Error(); setState(await r.json()) }).catch(() => setMessage(t('Chargement impossible. Réessayez.', 'Unable to load. Please retry.'))) }, [])
  async function choose(plan: string) {
    setBusy(true); setMessage('')
    try {
      const r = await fetch('/api/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) })
      const b = await r.json(); if (!r.ok) throw new Error(b.error)
      setMessage(t('Demande enregistrée. ImmoPilot vous contactera pour finaliser votre abonnement ou votre installation. Aucun paiement n’a été prélevé.', 'Request saved. ImmoPilot will contact you to finalize your subscription or installation. No payment has been collected.'))
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  return <main className="login-glass min-h-screen px-4 py-10"><div className="mx-auto max-w-5xl"><a href="/"><img src="/immopilot-logo.png" alt="ImmoPilot" className="brand-logo" /></a><h1 className="mt-6 text-3xl font-bold">{state?.expired ? t('Vos 3 jours d’essai sont terminés', 'Your 3-day trial has ended') : t('Choisissez votre formule', 'Choose your plan')}</h1><p className="mt-3 mb-6">{t('Abonnez-vous au mois ou choisissez l’achat avec installation sur demande. Vos données sont conservées.', 'Subscribe monthly or choose purchase with installation on request. Your data is retained.')}</p>
    <div className="grid gap-4 md:grid-cols-3">{MONTHLY_PLANS.map(p => <section className="card p-6" key={p.id}><h2 className="text-xl font-semibold">{language === 'en' ? p.en : p.name}</h2><p className="my-4 text-3xl font-bold">{p.price} $ CAD<span className="text-base font-normal">/{t('mois', 'month')}</span></p><p>{p.seats} {t('membre(s)', 'member(s)')}</p><button className="btn-primary mt-5" disabled={busy || !state?.canManage || (state.members ?? 0) > p.seats} onClick={() => void choose(p.id)}>{t('Choisir ce forfait', 'Choose this plan')}</button></section>)}</div>
    <p className="mt-4">{state?.members ?? 0} {t('membre(s) actif(s) dans votre agence. Chaque membre compte dans votre forfait.', 'active member(s) in your agency. Every member counts toward your plan.')}</p>
    <button className="btn-outline mt-4" disabled={busy || !state?.canManage} onClick={() => void choose('entreprise')}>{t('Plus de 25 membres : demander une offre mensuelle', 'More than 25 members: request a monthly offer')}</button>
    <section className="card mt-4 p-6"><h2 className="text-xl font-semibold">{t('Achat + installation sur demande', 'Purchase + installation on request')}</h2><p className="my-3">{t('Une offre sur devis selon votre agence, le déploiement et l’accompagnement souhaités.', 'A quote based on your agency, deployment and support needs.')}</p><button className="btn-outline" disabled={busy || !state?.canManage} onClick={() => void choose('achat')}>{t('Demander un devis', 'Request a quote')}</button></section>
    <p className="mt-4 text-sm">{t('Tarifs mensuels hors taxes. Le paiement en ligne n’est pas encore disponible ; votre choix transmet une demande à ImmoPilot.', 'Monthly prices exclude taxes. Online payment is not yet available; your choice sends a request to ImmoPilot.')}</p>
    {state && !state.canManage && <p className="mt-3">{t('La direction de votre agence doit choisir le forfait.', 'Your agency administrator must choose the plan.')}</p>}
    {message && <p role="status" className="card mt-4 p-4">{message}</p>}
    <div className="mt-6 flex gap-3">{state && !state.expired && <a className="btn-outline" href="/app">{t('Retour à mon espace', 'Back to workspace')}</a>}<button className="btn-ghost" onClick={async () => { await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); location.href = '/connexion' }}>{t('Se déconnecter', 'Sign out')}</button></div></div></main>
}
