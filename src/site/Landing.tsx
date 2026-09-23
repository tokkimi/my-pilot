import { useState } from 'react'
import {
  ArrowRight, BookOpen, Calculator, CalendarDays, Check, ClipboardList, FileCheck2, GraduationCap, Grid3x3, Home, KanbanSquare,
  Megaphone, Mic, PenTool, Ruler, ScanLine, ShieldCheck, Smartphone, Users, Video, Wallet, Building2, UserRound, Headset, Menu, X,
} from 'lucide-react'
import { INTEGRATION_LOGOS, logoUrl } from '../lib/platforms'

const FEATURES = [
  { icon: ScanLine, title: 'Visites terrain', text: 'Démarrez une visite sur votre cellulaire : dictée vocale transcrite, vidéo de chaque pièce, mesures et plan.' },
  { icon: Users, title: 'CRM & prospects', text: 'Vendeurs, acheteurs, anciens clients, sphère : historique, modèles courriel/texto, import CSV.' },
  { icon: KanbanSquare, title: 'Pipeline visuel', text: 'Du premier appel à la vente : glissez-déposez vos prospects, repérez ceux sans suivi.' },
  { icon: Home, title: 'Inscriptions complètes', text: 'Fiche prête pour la saisie Centris : caractéristiques, pièces, documents, horaire de visites.' },
  { icon: ClipboardList, title: 'Dossiers, conformité & délais', text: 'Processus vendeur et acheteur, documents requis selon la situation, avis de documents manquants, tableau blanc des délais.' },
  { icon: BookOpen, title: 'SOP & scripts', text: 'Vos procédures en mode présentation : découverte, prix, commission, close des 3 oui, objections.' },
  { icon: Megaphone, title: 'Marketing & réseaux', text: 'Calendrier de contenu, légendes générées, plan de mise en marché par inscription.' },
  { icon: CalendarDays, title: 'Agenda & tâches', text: 'RDV, visites, inspections, notaire : export vers Google Agenda et iCloud.' },
  { icon: Calculator, title: 'Calculateurs', text: 'Bilan du vendeur, rétribution, taxe de bienvenue, hypothèque, rendement de plex.' },
  { icon: Grid3x3, title: 'Toutes vos plateformes', text: 'Centris, JLR, NexOne, eZsign, Rechat… en un clic, avec un guide d’utilisation pour chacune.' },
  { icon: Wallet, title: 'Comptabilité & déclarations', text: 'Un panneau pour l’agence et un pour chaque courtier : revenus, dépenses avec justificatifs, TPS/TVQ, kilométrage — le détail pour les déclarations en un clic.' },
  { icon: FileCheck2, title: 'Devis & factures', text: 'Émettez et envoyez vos devis et factures au logo de l’agence, convertissez un devis en facture, suivez les paiements.' },
  { icon: Smartphone, title: 'Application mobile', text: 'S’installe sur l’écran d’accueil comme une appli, menu en bulle, session qui reste ouverte jusqu’à la déconnexion.' },
  { icon: ShieldCheck, title: 'Équipe & rôles', text: 'Une agence, plusieurs profils : administrateur, courtiers, adjointes, membres d’équipe.' },
]
const VISIT_STEPS = [
  { icon: Smartphone, title: 'Démarrez la visite', text: 'Évaluation vendeur, visite acheteur, visite libre, inspection : le bon gabarit en un toucher.' },
  { icon: Mic, title: 'Dictez vos notes', text: 'La voix est transcrite en direct. « Salon 14 par 16 pieds » remplit les dimensions tout seul.' },
  { icon: Video, title: 'Filmez chaque pièce', text: 'Vidéo par pièce, puis mesure assistée sur l’image ou ruban à mesurer en réalité augmentée.' },
  { icon: PenTool, title: 'Obtenez le plan', text: 'Plan 2D à l’échelle généré depuis vos mesures, ou importez un plan existant. Export PNG/SVG.' },
]
const PLANS = [
  { name: 'Courtier solo', icon: UserRound, who: '1 courtier', items: ['CRM, pipeline, tâches, agenda', 'Visites terrain illimitées', 'SOP, guides et calculateurs', 'Toutes les plateformes intégrées'] },
  { name: 'Équipe', icon: Users, who: 'Jusqu’à 5 membres', items: ['Tout le forfait Solo', 'Rôles : courtiers et adjointes', 'Dossiers et délais partagés', 'Commissions par membre'], featured: true },
  { name: 'Agence', icon: Building2, who: 'Jusqu’à 25 membres et plus', items: ['Tout le forfait Équipe', 'Administration de l’agence', 'Statistiques d’utilisation', 'Accompagnement prioritaire'] },
]
const FAQ = [
  ['Est-ce que ça fonctionne sur cellulaire?', 'Oui. Les visites terrain ont été pensées pour le téléphone : dictée, caméra, mesure et plan. La mesure en réalité augmentée est offerte sur les appareils Android compatibles ARCore; ailleurs, la mesure se fait sur photo ou vidéo à partir d’une référence (ex. une porte).'],
  ['Peut-on importer nos contacts actuels?', 'Oui, par fichier CSV (exporté de Prospects, Rechat, Excel, Google Contacts…). Les colonnes prénom, nom, courriel, téléphone et ville sont reconnues automatiquement.'],
  ['Comment se passe la formation?', 'Nous offrons des formations de groupe pour les agences (en personne ou en visioconférence) ainsi que des séances individuelles. Le contenu est adapté à vos processus et à vos SOP.'],
  ['Et la confidentialité (Loi 25)?', 'Chaque agence a son espace privé; les médias des visites sont stockés de façon privée et accessibles seulement aux membres connectés. Le registre de visite libre inclut le consentement à être recontacté.'],
  ['Peut-on essayer avant?', 'Oui : la démo est accessible sans inscription et contient des données fictives. Pour un espace réel de votre agence, contactez-nous.'],
]

export default function Landing() {
  const [menu, setMenu] = useState(false)
  const [interest, setInterest] = useState('Démonstration')
  const pick = (i: string) => { setInterest(i); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <div className="bg-white text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <a href="/" className="text-lg font-extrabold tracking-tight">🏡 ImmoPilot</a>
          <nav className="hidden gap-5 text-sm font-medium text-slate-600 md:flex">
            <a href="#fonctionnalites" className="hover:text-brand-700">Fonctionnalités</a>
            <a href="#visites" className="hover:text-brand-700">Visites terrain</a>
            <a href="#integrations" className="hover:text-brand-700">Intégrations</a>
            <a href="#tarifs" className="hover:text-brand-700">Forfaits</a>
            <a href="#formation" className="hover:text-brand-700">Formation</a>
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <a href="/connexion" className="btn-ghost">Connexion</a>
            <a href="/demo" className="btn-outline">Essayer la démo</a>
            <a href="#contact" className="btn-primary">Demander une démo</a>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
        {menu && (
          <div className="flex flex-col gap-1 border-t border-slate-200 p-3 md:hidden" onClick={() => setMenu(false)}>
            {[['#fonctionnalites', 'Fonctionnalités'], ['#visites', 'Visites terrain'], ['#integrations', 'Intégrations'], ['#tarifs', 'Forfaits'], ['#formation', 'Formation'], ['#contact', 'Contact'], ['/connexion', 'Connexion'], ['/demo', 'Essayer la démo']].map(([h, l]) => <a key={h} href={h} className="rounded px-2 py-2 hover:bg-slate-50">{l}</a>)}
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-ink via-[#24124f] to-brand-700 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="badge bg-white/10 px-3 py-1 text-brand-100">Conçu au Québec pour les agences immobilières</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-5xl">Toute votre agence dans <span className="text-violet-300">une seule plateforme</span>.</h1>
            <p className="mt-4 text-lg text-slate-300">CRM, inscriptions, dossiers, SOP, marketing et <b className="text-white">visites terrain avec dictée, vidéo, mesures et plans</b>. Vos courtiers et adjointes travaillent enfin au même endroit — au bureau comme sur le terrain.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#contact" className="btn bg-white px-5 py-3 text-base text-brand-700 hover:bg-violet-50">Demander une démo <ArrowRight size={18} /></a>
              <a href="/demo" className="btn border border-white/30 px-5 py-3 text-base text-white hover:bg-white/10">Essayer maintenant</a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
              {['Aucune installation', 'Cellulaire, tablette, ordinateur', 'Formation incluse'].map(t => <span key={t} className="flex items-center gap-1"><Check size={15} className="text-emerald-400" /> {t}</span>)}
            </div>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* LOGOS */}
      <section className="border-b border-slate-100 py-8">
        <p className="mb-4 text-center text-sm font-medium text-slate-500">Réunit les outils que vos courtiers utilisent déjà</p>
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-4 px-4">
          {INTEGRATION_LOGOS.slice(0, 12).map(l => <Logo key={l.name} {...l} />)}
        </div>
      </section>

      {/* PROBLÈME */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">30 plateformes, 30 mots de passe, 0 vue d’ensemble.</h2>
        <p className="mx-auto mt-3 max-w-3xl text-slate-600">Centris, Prospects, JLR, NexOne, eZsign, Immocontact, Pancarte Express, Canva, Mailchimp, réseaux sociaux… ImmoPilot devient le point de départ de chaque journée : vos processus, vos délais, vos clients et un accès en un clic à chaque outil, avec son mode d’emploi.</p>
      </section>

      {/* FONCTIONNALITÉS */}
      <section id="fonctionnalites" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Tout ce qu’une agence utilise, au même endroit</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="card p-5">
                <div className="mb-3 inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-600"><f.icon size={22} /></div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VISITES */}
      <section id="visites" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span className="badge bg-brand-50 px-3 py-1 text-brand-700">Nouveau</span>
            <h2 className="mt-3 text-3xl font-bold">La visite terrain, réinventée.</h2>
            <p className="mt-3 text-slate-600">Chaque agent peut démarrer une visite depuis son cellulaire. Les notes se dictent, les pièces se filment et se mesurent, et le plan se construit tout seul. À la fin : un rapport imprimable, les pièces copiées dans l’inscription, et les visiteurs de la visite libre ajoutés à vos prospects.</p>
            <div className="mt-6 space-y-4">
              {VISIT_STEPS.map((s, i) => (
                <div key={s.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</div>
                  <div><div className="flex items-center gap-2 font-semibold"><s.icon size={17} className="text-brand-600" /> {s.title}</div><p className="text-sm text-slate-600">{s.text}</p></div>
                </div>
              ))}
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* RÔLES */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Une agence, plusieurs profils</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Building2, t: 'Direction d’agence', d: 'Gère l’équipe, les accès, les forfaits et suit l’activité : dossiers, commissions, visites.' },
              { icon: UserRound, t: 'Courtiers', d: 'Leurs clients, inscriptions, visites et délais — avec la vue « Mes dossiers » ou « Toute l’équipe ».' },
              { icon: ClipboardList, t: 'Adjointes & équipe', d: 'Checklists des dossiers, commandes (pancartes, certificats), marketing et suivi administratif.' },
            ].map(r => <div key={r.t} className="card p-6"><r.icon className="text-brand-600" /><h3 className="mt-3 font-semibold">{r.t}</h3><p className="mt-1 text-sm text-slate-600">{r.d}</p></div>)}
          </div>
        </div>
      </section>

      {/* INTÉGRATIONS */}
      <section id="integrations" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Vos outils, connectés</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Accès en un clic, guide d’utilisation pour chaque plateforme, import/export de contacts et d’agendas. Calendly, Google Agenda, Centris, Rechat, NexOne, eZsign, JLR et bien d’autres.</p>
        <div className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {INTEGRATION_LOGOS.map(l => (
            <div key={l.name} className="card flex flex-col items-center gap-2 p-4 text-center">
              <img src={logoUrl(l.domain)} alt="" className="h-10 w-10 rounded" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
              <span className="text-xs font-medium text-slate-600">{l.name}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Les marques citées appartiennent à leurs propriétaires respectifs. ImmoPilot n’est pas affilié à ces entreprises.</p>
      </section>

      {/* FORFAITS */}
      <section id="tarifs" className="bg-gradient-to-b from-slate-50 to-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Des abonnements pensés pour les agences</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Abonnement mensuel ou annuel selon la taille de votre équipe. Tarifs sur demande, adaptés à votre agence.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map(p => (
              <div key={p.name} className={`card flex flex-col p-6 ${p.featured ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
                {p.featured && <span className="badge mb-2 self-start bg-brand-600 text-white">Le plus populaire</span>}
                <p.icon className="text-brand-600" />
                <h3 className="mt-2 text-xl font-bold">{p.name}</h3>
                <div className="text-sm text-slate-500">{p.who}</div>
                <div className="my-4 text-2xl font-extrabold">Prix sur demande</div>
                <ul className="flex-1 space-y-2 text-sm">{p.items.map(i => <li key={i} className="flex gap-2"><Check size={16} className="shrink-0 text-emerald-600" /> {i}</li>)}</ul>
                <button onClick={() => pick(`Abonnement — ${p.name}`)} className={`${p.featured ? 'btn-primary' : 'btn-outline'} mt-6 justify-center`}>Obtenir une soumission</button>
              </div>
            ))}
          </div>
          <div className="card mt-4 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
            <Building2 className="shrink-0 text-brand-600" size={32} />
            <div className="flex-1"><h3 className="font-bold">Réseaux et bannières</h3><p className="text-sm text-slate-600">Plusieurs bureaux, image de marque, SOP et contenus propres à votre réseau, intégrations sur mesure.</p></div>
            <button onClick={() => pick('Abonnement — Réseau / bannière')} className="btn-outline">Parlons-en</button>
          </div>
        </div>
      </section>

      {/* FORMATION */}
      <section id="formation" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-8 rounded-2xl bg-ink p-8 text-white md:grid-cols-[1fr_auto] md:p-12">
          <div>
            <GraduationCap className="text-violet-300" size={36} />
            <h2 className="mt-3 text-3xl font-bold">Formation de groupe pour votre agence</h2>
            <p className="mt-3 max-w-2xl text-slate-300">Nous formons vos courtiers et adjointes en groupe, en personne ou en visioconférence : prise en main, visites terrain, processus vendeur/acheteur, SOP et bonnes pratiques. Séances individuelles aussi disponibles. <b className="text-white">Prix sur demande.</b></p>
            <ul className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              {['Démarrage et migration de vos contacts', 'Atelier « visite terrain » sur le cellulaire', 'Vos SOP intégrés à la plateforme', 'Suivi et questions après la formation'].map(i => <li key={i} className="flex gap-2"><Check size={16} className="text-emerald-400" /> {i}</li>)}
            </ul>
          </div>
          <button onClick={() => pick('Formation de groupe')} className="btn bg-white px-5 py-3 text-base text-brand-700 hover:bg-violet-50"><Headset size={18} /> Réserver une formation</button>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold">Questions fréquentes</h2>
          <div className="mt-8 space-y-2">
            {FAQ.map(([q, a]) => <details key={q} className="card p-4"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-sm text-slate-600">{a}</p></details>)}
          </div>
        </div>
      </section>

      <ContactForm interest={interest} setInterest={setInterest} />

      <footer className="border-t border-slate-200 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <span>© {new Date().getFullYear()} ImmoPilot — Plateforme pour agences et courtiers immobiliers</span>
          <span className="flex gap-4"><a href="/connexion" className="hover:underline">Connexion</a><a href="/demo" className="hover:underline">Démo</a><a href="#contact" className="hover:underline">Contact</a></span>
        </div>
      </footer>
    </div>
  )
}

function Logo({ name, domain }: { name: string; domain: string }) {
  return <span className="flex items-center gap-2 text-sm font-semibold text-slate-500"><img src={logoUrl(domain, 64)} alt="" className="h-6 w-6 rounded" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />{name}</span>
}

function ContactForm({ interest, setInterest }: { interest: string; setInterest: (s: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', agency: '', role: 'Direction d’agence', agents: '', message: '', website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState('sending'); setErr('')
    try {
      const r = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, interest }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.fallback ? 'Le formulaire est en cours d’activation. Réessayez un peu plus tard.' : b.error || 'Envoi impossible.')
      setState('ok')
    } catch (x) { setErr((x as Error).message); setState('error') }
  }
  return (
    <section id="contact" className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Parlons de votre agence</h2>
          <p className="mt-3 text-slate-600">Démonstration, soumission d’abonnement ou formation de groupe : laissez-nous vos coordonnées, on vous revient rapidement.</p>
          <ul className="mt-6 space-y-3 text-sm">
            {['Démonstration personnalisée de 30 minutes', 'Soumission selon le nombre de courtiers', 'Migration de vos contacts incluse', 'Formation de groupe sur demande'].map(i => <li key={i} className="flex gap-2"><Check size={17} className="text-emerald-600" /> {i}</li>)}
          </ul>
          <div className="mt-8 flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-sm text-brand-700"><Ruler /> Envie de tester tout de suite? <a href="/demo" className="font-semibold underline">Ouvrez la démo</a>.</div>
        </div>
        {state === 'ok' ? (
          <div className="card flex flex-col items-center justify-center p-10 text-center"><Check size={40} className="text-emerald-600" /><h3 className="mt-3 text-xl font-bold">Merci!</h3><p className="text-slate-600">Votre demande a bien été reçue. Nous vous contactons très bientôt.</p></div>
        ) : (
          <form onSubmit={submit} className="card grid gap-3 p-6 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Je souhaite</span>
              <select className="input" value={interest} onChange={e => setInterest(e.target.value)}>
                {['Démonstration', 'Abonnement — Courtier solo', 'Abonnement — Équipe', 'Abonnement — Agence', 'Abonnement — Réseau / bannière', 'Formation de groupe', 'Autre'].map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label><span className="label">Nom complet *</span><input className="input" required value={f.name} onChange={set('name')} /></label>
            <label><span className="label">Courriel *</span><input className="input" type="email" required value={f.email} onChange={set('email')} /></label>
            <label><span className="label">Téléphone</span><input className="input" type="tel" value={f.phone} onChange={set('phone')} /></label>
            <label><span className="label">Agence / équipe</span><input className="input" value={f.agency} onChange={set('agency')} /></label>
            <label><span className="label">Vous êtes</span><select className="input" value={f.role} onChange={set('role')}>{['Direction d’agence', 'Courtier', 'Chef d’équipe', 'Adjointe', 'Autre'].map(o => <option key={o}>{o}</option>)}</select></label>
            <label><span className="label">Nombre de courtiers</span><select className="input" value={f.agents} onChange={set('agents')}><option value="">—</option>{['1', '2-5', '6-15', '16-50', '50+'].map(o => <option key={o}>{o}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="label">Message</span><textarea className="input min-h-24" value={f.message} onChange={set('message')} /></label>
            <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden />
            <p className="text-xs text-slate-500 sm:col-span-2">En envoyant ce formulaire, vous acceptez d’être contacté au sujet de votre demande. Vos renseignements ne sont pas partagés.</p>
            {err && <p className="text-sm text-rose-600 sm:col-span-2">{err}</p>}
            <button className="btn-primary justify-center py-3 sm:col-span-2" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : 'Envoyer ma demande'}</button>
          </form>
        )}
      </div>
    </section>
  )
}

function HeroMock() {
  return (
    <div className="relative hidden md:block">
      <div className="rounded-2xl bg-white p-4 text-slate-800 shadow-2xl">
        <div className="mb-3 flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-400" /><span className="h-3 w-3 rounded-full bg-amber-400" /><span className="h-3 w-3 rounded-full bg-emerald-400" /><span className="ml-2 text-xs text-slate-400">Tableau de bord</span></div>
        <div className="grid grid-cols-3 gap-2">
          {[['Inscriptions', '12'], ['Dossiers ouverts', '7'], ['Commissions', '184 k$']].map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 p-3"><div className="text-[10px] text-slate-500">{l}</div><div className="text-lg font-bold">{v}</div></div>)}
        </div>
        <div className="mt-3 rounded-lg border border-slate-100 p-3">
          <div className="mb-2 text-xs font-semibold">Tableau blanc — délais</div>
          {[['Limite inspection', 'Dans 3 j', 'bg-amber-100 text-amber-800'], ['Limite financement', 'Dans 10 j', 'bg-slate-100'], ['Acte de vente', 'Dans 32 j', 'bg-slate-100']].map(([a, b, c]) => <div key={a} className="flex justify-between border-t border-slate-100 py-1.5 text-xs"><span>{a}</span><span className={`badge ${c}`}>{b}</span></div>)}
        </div>
        <div className="mt-3 flex gap-1">{[40, 65, 30, 80, 55, 90, 70].map((h, i) => <div key={i} className="flex h-16 flex-1 items-end"><div className="w-full rounded-t bg-brand-500/80" style={{ height: `${h}%` }} /></div>)}</div>
      </div>
      <div className="absolute -bottom-8 -left-8 w-52 rounded-2xl bg-white p-3 text-slate-800 shadow-2xl">
        <div className="text-xs font-semibold">🎙 Note vocale</div>
        <p className="mt-1 text-[11px] text-slate-600">« Le salon fait 14 par 16 pieds, plancher de bois franc, beaucoup de lumière… »</p>
        <div className="mt-2 rounded bg-emerald-50 p-1.5 text-[11px] text-emerald-700">✓ Salon : 14 × 16 pi — 224 pi²</div>
      </div>
    </div>
  )
}

function PhoneMock() {
  return (
    <div className="mx-auto w-72 rounded-[2.5rem] border-8 border-slate-900 bg-white p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between text-xs"><b>Visite — 1245 des Érables</b><span className="badge bg-rose-100 text-rose-700">● 12:04</span></div>
      <div className="mb-2 flex gap-1 text-[10px]">{['Infos', 'Pièces', 'Notes', 'Plan'].map((t, i) => <span key={t} className={`rounded px-2 py-1 ${i === 1 ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{t}</span>)}</div>
      {[['Salon', '14 × 16 pi', true], ['Cuisine', '12 × 13 pi', true], ['Chambre principale', 'Non mesurée', false]].map(([n, d, ok]) => (
        <div key={n as string} className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-[11px]">
          <span className={`flex h-6 w-6 items-center justify-center rounded ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>{ok ? '✓' : <Ruler size={12} />}</span>
          <div className="flex-1"><b>{n}</b><div className="text-slate-500">{d}</div></div>
        </div>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <span className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-white"><Video size={12} /> Filmer</span>
        <span className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-white"><ScanLine size={12} /> Mesure AR</span>
      </div>
      <svg viewBox="0 0 32 20" className="mt-3 w-full rounded border border-slate-100 bg-slate-50">
        <rect x="1" y="1" width="16" height="14" fill="#ede9fe" stroke="#6d28d9" strokeWidth=".3" /><text x="9" y="8.5" fontSize="1.8" textAnchor="middle" fontWeight="700">Salon</text>
        <rect x="17" y="1" width="13" height="12" fill="#ede9fe" stroke="#6d28d9" strokeWidth=".3" /><text x="23.5" y="7.5" fontSize="1.8" textAnchor="middle" fontWeight="700">Cuisine</text>
        <rect x="17" y="13" width="3" height=".6" fill="#fef3c7" stroke="#b45309" strokeWidth=".15" />
      </svg>
    </div>
  )
}
