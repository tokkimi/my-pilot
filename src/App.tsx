import Connections from './modules/Connections'
import Operations from './modules/Operations'
import { tr } from './lib/i18n'
import { useEffect, useState, type ComponentType } from 'react'
import {
  ClipboardList, LayoutDashboard, Users, KanbanSquare, Home, FileCheck2, CheckSquare, CalendarDays, Eye, Megaphone, Mail, BookOpen, Calculator,
  FileText, Grid3x3, Handshake, UserCog, Wallet, Settings, Menu, X, Search, ScanLine, ShieldCheck, LogOut, Cloud, CloudOff, Loader2, KeyRound, Shield, HardDrive,
} from 'lucide-react'
import { useStore } from './lib/store'
import { Avatar, ROLES } from './lib/ui'
import Dashboard from './modules/Dashboard'
import Contacts from './modules/Contacts'
import Pipeline from './modules/Pipeline'
import Listings from './modules/Listings'
import Deals from './modules/Deals'
import Tasks from './modules/Tasks'
import CalendarPage from './modules/Calendar'
import Showings from './modules/Showings'
import Marketing from './modules/MarketingStudio'
import Templates from './modules/Templates'
import Sop from './modules/Sop'
import Tools from './modules/Tools'
import Guides from './modules/Guides'
import Platforms from './modules/Platforms'
import Partners from './modules/Partners'
import Team from './modules/Team'
import Accounting from './modules/Accounting'
import SettingsPage from './modules/Settings'
import GlobalSearch from './modules/GlobalSearch'
import Visits from './modules/Visits'
import GooglePage from './modules/Google'
import Compliance from './modules/Compliance'
import { AccountModal } from './modules/Account'

export type Page = keyof typeof PAGES
export interface PageProps { go: (p: Page, id?: string) => void; openId?: string }

const PAGES = {
  connections: { label: 'Connexions', icon: Cloud, C: Connections, group: 'Réseau' },
  operations: { label: 'Pilotage', icon: ClipboardList, C: Operations, group: 'Général' },
  dashboard: { label: 'Tableau de bord', icon: LayoutDashboard, C: Dashboard, group: 'Général' },
  contacts: { label: 'Contacts & prospects', icon: Users, C: Contacts, group: 'CRM' },
  pipeline: { label: 'Pipeline', icon: KanbanSquare, C: Pipeline, group: 'CRM' },
  tasks: { label: 'Tâches', icon: CheckSquare, C: Tasks, group: 'CRM' },
  calendar: { label: 'Calendrier', icon: CalendarDays, C: CalendarPage, group: 'CRM' },
  visits: { label: 'Visites terrain', icon: ScanLine, C: Visits, group: 'Immobilier' },
  listings: { label: 'Inscriptions', icon: Home, C: Listings, group: 'Immobilier' },
  deals: { label: 'Dossiers & transactions', icon: FileCheck2, C: Deals, group: 'Immobilier' },
  compliance: { label: 'Conformité des dossiers', icon: ShieldCheck, C: Compliance, group: 'Immobilier' },
  showings: { label: 'Visites & rétroactions', icon: Eye, C: Showings, group: 'Immobilier' },
  marketing: { label: 'Studio marketing', icon: Megaphone, C: Marketing, group: 'Marketing' },
  templates: { label: 'Courriels & textos', icon: Mail, C: Templates, group: 'Marketing' },
  sop: { label: 'SOP & scripts', icon: BookOpen, C: Sop, group: 'Savoir' },
  guides: { label: 'Guides clients', icon: FileText, C: Guides, group: 'Savoir' },
  tools: { label: 'Calculateurs', icon: Calculator, C: Tools, group: 'Savoir' },
  platforms: { label: 'Plateformes', icon: Grid3x3, C: Platforms, group: 'Réseau' },
  google: { label: 'Google Drive & Agenda', icon: HardDrive, C: GooglePage, group: 'Réseau' },
  partners: { label: 'Partenaires', icon: Handshake, C: Partners, group: 'Réseau' },
  finance: { label: 'Comptabilité', icon: Wallet, C: Accounting, group: 'Agence' },
  team: { label: 'Équipe', icon: UserCog, C: Team, group: 'Agence' },
  settings: { label: 'Paramètres & données', icon: Settings, C: SettingsPage, group: 'Agence' },
} satisfies Record<string, { label: string; icon: ComponentType<{ size?: number }>; C: ComponentType<PageProps>; group: string }>

function readHash(): { page: Page; id?: string } {
  const [p, id] = location.hash.replace(/^#\/?/, '').split('/')
  return { page: (p in PAGES ? p : 'dashboard') as Page, id }
}

export default function App() {
  const { db, me, patch, mode, session, sync, syncError } = useStore()
  const [route, setRoute] = useState(readHash)
  const [account, setAccount] = useState(!!session?.user.mustChangePassword)
  const [nav, setNav] = useState(false)
  const [search, setSearch] = useState(false)

  useEffect(() => {
    const h = () => setRoute(readHash())
    window.addEventListener('hashchange', h)
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearch(true) } }
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('hashchange', h); window.removeEventListener('keydown', k) }
  }, [])

  const go = (page: Page, id?: string) => { location.hash = `/${page}${id ? `/${id}` : ''}`; setNav(false); window.scrollTo(0, 0) }
  const Cur = PAGES[route.page].C
  const inVisit = route.page === 'visits' && !!route.id
  const groups = [...new Set(Object.values(PAGES).map(p => p.group))]

  return (
    <div className="app-shell min-h-screen lg:pl-64">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-slate-300 transition-transform lg:translate-x-0 ${nav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {db.agency.logo ? <img src={db.agency.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5" /> : <img src="/immopilot-logo.png" alt="ImmoPilot" className="sidebar-logo" />}
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-white">{db.agency.logo ? db.agency.name : 'ImmoPilot'}</div>
              <div className="truncate text-xs text-slate-400">{db.agency.logo ? 'propulsé par ImmoPilot' : db.agency.name}</div>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setNav(false)}><X size={20} /></button>
        </div>
        <button onClick={() => setSearch(true)} className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400 hover:bg-white/10">
          <Search size={15} />{" "}{tr("Rechercher…")}{" "}<kbd className="ml-auto text-[10px]">Ctrl K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map(g => (
            <div key={g} className="mt-3">
              
              {(Object.entries(PAGES) as [Page, (typeof PAGES)[Page]][]).filter(([, p]) => p.group === g).map(([k, p]) => (
                <button key={k} onClick={() => go(k)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${route.page === k ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                  <p.icon size={16} /> {tr(p.label)}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          {mode === 'local' ? (
            <>
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Profil (démo)</span><a href="/connexion" className="normal-case text-brand-100 hover:underline">Se connecter →</a></div>
              <div className="flex items-center gap-2">
                <Avatar memberId={me.id} size={32} />
                <select className="min-w-0 flex-1 rounded-md bg-white/5 px-2 py-1.5 text-sm text-white outline-none" value={me.id} onChange={e => patch({ currentUserId: e.target.value })}>
                  {db.members.filter(m => m.active).map(m => <option key={m.id} value={m.id} className="text-slate-900">{m.name} — {ROLES[m.role]}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Avatar memberId={me.id} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{session?.user.name}</div>
                  <div className="truncate text-[11px] text-slate-400">{session?.user.role === 'superadmin' ? 'Super-admin' : ROLES[me.role]} · {session?.agency.name}</div>
                </div>
                <span title={syncError || (sync === 'ok' ? 'Enregistré' : 'Enregistrement…')}>{sync === 'ok' ? <Cloud size={16} className="text-emerald-400" /> : sync === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <CloudOff size={16} className="text-rose-400" />}</span>
              </div>
              <div className="mt-2 flex gap-1 text-xs">
                {session?.user.role === 'superadmin' && <a href="/admin" className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><Shield size={12} />{" "}{tr("Console")}</a>}
                <button onClick={() => setAccount(true)} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><KeyRound size={12} />{" "}{tr("Compte")}</button>
                <button onClick={async () => { await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); location.href = '/connexion' }} className="ml-auto flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><LogOut size={12} />{" "}{tr("Quitter")}</button>
              </div>
            </>
          )}
        </div>
      </aside>
      {nav && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNav(false)} />}

      <header className="no-print safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        {db.agency.logo ? <img src={db.agency.logo} alt="" className="h-7 w-7 rounded-lg object-contain" /> : <img src="/immopilot-logo.png" alt="" className="h-7 w-7" />}
        <span className="truncate font-semibold">{tr(PAGES[route.page].label)}</span>
        {mode === 'remote' && <span className="ml-auto">{sync === 'ok' ? <Cloud size={17} className="text-emerald-500" /> : sync === 'saving' ? <Loader2 size={17} className="animate-spin text-slate-400" /> : <CloudOff size={17} className="text-rose-500" />}</span>}
        <button className={mode === 'remote' ? '' : 'ml-auto'} onClick={() => setSearch(true)}><Search size={20} /></button>
      </header>

      {mode === 'local' && <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">{tr("Mode démonstration — données enregistrées dans ce navigateur seulement.")}{" "}<a href="/connexion" className="font-semibold underline">{tr("Se connecter")}</a>{" "}{tr("pour l’espace sécurisé partagé de votre agence.")}</div>}
      <main className={`mx-auto max-w-7xl p-4 sm:p-6 ${inVisit ? '' : 'max-lg:pb-32'}`}>
        <Cur key={route.page} go={go} openId={route.id} />
      </main>
      {!inVisit && <BubbleNav current={route.page} go={go} openMenu={() => setNav(true)} />}
      {search && <GlobalSearch go={go} onClose={() => setSearch(false)} />}
      {account && <AccountModal onClose={() => setAccount(false)} forced={!!session?.user.mustChangePassword} />}
    </div>
  )
}

// Menu mobile « bulle » : barre flottante; l'onglet actif s'ouvre en bulle avec son nom.
const BUBBLES: [Page, string, ComponentType<{ size?: number }>][] = [['dashboard', 'Accueil', LayoutDashboard], ['contacts', 'Contacts', Users], ['visits', 'Visite', ScanLine], ['deals', 'Dossiers', FileCheck2]]
function BubbleNav({ current, go, openMenu }: { current: Page; go: (p: Page) => void; openMenu: () => void }) {
  return (
    <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between rounded-full bg-ink/95 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        {BUBBLES.map(([page, label, Icon]) => {
          const on = current === page
          const center = page === 'visits'
          return (
            <button key={page} onClick={() => go(page)} aria-label={tr(label)}
              className={`flex items-center justify-center gap-1.5 rounded-full transition-all duration-300 ${center && !on ? 'h-12 w-12 bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg' : on ? 'h-12 bg-white px-4 text-brand-700' : 'h-12 w-12 text-slate-300'}`}>
              <Icon size={20} />{on && <span className="text-sm font-semibold">{tr(label)}</span>}
            </button>
          )
        })}
        <button onClick={openMenu} aria-label={tr("Plus")} className={`flex h-12 items-center justify-center gap-1.5 rounded-full px-3 transition-all ${!BUBBLES.some(b => b[0] === current) ? 'bg-white text-brand-700' : 'text-slate-300'}`}>
          <Menu size={20} />{!BUBBLES.some(b => b[0] === current) && <span className="max-w-24 truncate text-sm font-semibold">{tr("Plus")}</span>}
        </button>
      </div>
    </nav>
  )
}



