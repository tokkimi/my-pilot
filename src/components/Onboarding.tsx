import { useEffect, useState } from 'react'
import { ArrowRight, Check, Link2, Lock, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Modal } from '../lib/ui'
import { getOverview, startOAuth, type Overview } from '../lib/integrations/client'
import { CONNECTORS, type ConnectorKey } from '../lib/integrations/catalog'

const markDone = () => fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'onboarded' }) }).catch(() => undefined)
const SUGGESTED: ConnectorKey[] = ['google', 'microsoft', 'calendly', 'mailchimp', 'meta', 'crea', 'ics', 'canva', 'linkedin', 'tiktok']

// Premier accès : ce que fait l'IA (et ce qu'elle ne fait pas), puis connexion des outils une seule fois.
export default function Onboarding({ onClose, goPlatforms }: { onClose: () => void; goPlatforms: () => void }) {
  const [step, setStep] = useState(0)
  const [ov, setOv] = useState<Overview | null>(null)
  useEffect(() => { void getOverview().then(setOv).catch(() => undefined) }, [])
  const finish = async (thenPlatforms = false) => { await markDone(); onClose(); if (thenPlatforms) goPlatforms() }
  const usable = ov ? SUGGESTED.map(k => ov.connectors.find(c => c.key === k)).filter(c => c && c.access.use && c.ready.ok) : []
  return (
    <Modal title="Bienvenue dans ImmoPilot" onClose={() => finish()} footer={
      step === 0 ? <button className="btn-primary" onClick={() => setStep(1)}>Continuer <ArrowRight size={14} /></button>
        : <><button className="btn-ghost" onClick={() => finish()}>Plus tard</button><button className="btn-primary" onClick={() => finish(true)}>Voir toutes les applications <ArrowRight size={14} /></button></>}>
      {step === 0 ? (
        <div className="space-y-4 text-sm">
          <p className="text-slate-700">ImmoPilot rassemble vos contacts, inscriptions, dossiers, tâches, rendez-vous, communications et statistiques. Un bouton <b>« Actualiser »</b> met tout à jour à partir de vos outils connectés, et la même mise à jour se fait automatiquement en arrière-plan.</p>
          <div className="rounded-xl bg-brand-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-brand-700"><Sparkles size={16} /> L’assistant IA intégré</h3>
            <ul className="space-y-1.5 text-slate-700">
              {['Résume la situation de l’agence ou d’un dossier, avec la source et la date de chaque information.', 'Repère les changements et les incohérences entre vos outils.', 'Propose des tâches et explique vos statistiques — vous validez avant tout ajout.', 'Prépare les actions disponibles; l’envoi, la publication, la signature ou une dépense demandent toujours votre confirmation.'].map(x => <li key={x} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{x}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-slate-600">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-800"><ShieldCheck size={16} /> Vos données et vos accès</h3>
            <ul className="space-y-1.5">
              <li className="flex gap-2"><Lock size={14} className="mt-0.5 shrink-0" /><span>Aucun compte ChatGPT n’est requis et ImmoPilot ne vous demandera <b>jamais</b> votre identifiant ou votre mot de passe ChatGPT. L’IA fonctionne par l’API OpenAI, configurée par ImmoPilot côté serveur; votre abonnement ChatGPT personnel n’est ni utilisé ni nécessaire.</span></li>
              <li className="flex gap-2"><Lock size={14} className="mt-0.5 shrink-0" />L’IA ne voit que les données de votre agence autorisées par votre administrateur — jamais celles d’une autre agence, ni vos mots de passe ou jetons de connexion.</li>
              <li className="flex gap-2"><Lock size={14} className="mt-0.5 shrink-0" />Chaque outil se connecte chez son fournisseur (Google, Microsoft, Mailchimp…) : ImmoPilot reçoit une autorisation révocable, jamais votre mot de passe.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            {[[Link2, '1. Connectez', 'Autorisez chaque outil une seule fois, chez son fournisseur.'], [RefreshCw, '2. Actualisez', '« Actualiser » ou la synchronisation automatique rapatrient les changements.'], [ShieldCheck, '3. Vérifiez', 'Seuls les écarts importants arrivent dans « À vérifier ».']].map(([Icon, t, d]) => {
              const I = Icon as typeof Link2
              return <div key={t as string} className="rounded-lg bg-slate-50 p-3"><I size={16} className="mb-1 text-brand-600" /><div className="font-semibold">{t as string}</div><div className="text-xs text-slate-500">{d as string}</div></div>
            })}
          </div>
          <p className="text-slate-600">Applications offertes à votre profil (selon les réglages de votre agence) :</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {!ov ? <p className="text-slate-400">Chargement…</p> : usable.length === 0 ? <p className="text-slate-500">Aucune connexion directe n’est encore activée pour votre profil. Votre administrateur ou la plateforme peut les activer; vous pouvez déjà importer vos fichiers (Plateformes).</p> : usable.map(c => (
              <button key={c!.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-brand-300" onClick={async () => { await markDone(); if (c!.key === 'crea' || c!.key === 'ics') { onClose(); goPlatforms() } else startOAuth(c!.key, c!.modes.includes('user') ? 'user' : 'agency') }}>
                <span>{CONNECTORS[c!.key].name}</span><span className="text-xs font-medium text-brand-700">Connecter →</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Une connexion reste active aussi longtemps que le fournisseur le permet. Si un fournisseur exige une nouvelle authentification (mot de passe changé, accès retiré, vérification en deux étapes), ImmoPilot le détecte, garde vos dernières données avec leur date et affiche un bouton « Reconnecter ».</p>
        </div>
      )}
    </Modal>
  )
}
