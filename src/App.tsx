import { useEffect, useState, type ComponentType } from 'react'
import {
  LayoutDashboard, Users, KanbanSquare, Home, FileCheck2, CheckSquare, CalendarDays, Eye, Megaphone, Mail, BookOpen, Calculator,
  FileText, Grid3x3, Handshake, UserCog, Wallet, Settings, Menu, X, Search, ScanLine, LogOut, Cloud, CloudOff, Loader2, KeyRound, Shield,
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
import Marketing from './modules/Marketing'
import Templates from './modules/Templates'
import Sop from './modules/Sop'
import Tools from './modules/Tools'
import Guides from './modules/Guides'
import Platforms from './modules/Platforms'
import Partners from './modules/Partners'
import Team from './modules/Team'
import Finance from './modules/Finance'
import SettingsPage from './modules/Settings'
import GlobalSearch from './modules/GlobalSearch'
import Visits from './modules/Visits'
import { AccountModal } from './modules/Account'

export type Page = keyof typeof PAGES
export interface PageProps { go: (p: Page, id?: string) => void; openId?: string }

const PAGES = {
  dashboard: { label: 'Tableau de bord', icon: LayoutDashboard, C: Dashboard, group: 'Général' },
  contacts: { label: 'Contacts & prospects', icon: Users, C: Contacts, group: 'CRM' },
  pipeline: { label: 'Pipeline', icon: KanbanSquare, C: Pipeline, group: 'CRM' },
  tasks: { label: 'Tâches', icon: CheckSquare, C: Tasks, group: 'CRM' },
  calendar: { label: 'Calendrier', icon: CalendarDays, C: CalendarPage, group: 'CRM' },
  visits: { label: 'Visites terrain', icon: ScanLine, C: Visits, group: 'Immobilier' },
  listings: { label: 'Inscriptions', icon: Home, C: Listings, group: 'Immobilier' },
  deals: { label: 'Dossiers & transactions', icon: FileCheck2, C: Deals, group: 'Immobilier' },
  showings: { label: 'Visites & rétroactions', icon: Eye, C: Showings, group: 'Immobilier' },
  marketing: { label: 'Marketing & réseaux', icon: Megaphone, C: Marketing, group: 'Marketing' },
  templates: { label: 'Courriels & textos', icon: Mail, C: Templates, group: 'Marketing' },
  sop: { label: 'SOP & scripts', icon: BookOpen, C: Sop, group: 'Savoir' },
  guides: { label: 'Guides clients', icon: FileText, C: Guides, group: 'Savoir' },
  tools: { label: 'Calculateurs', icon: Calculator, C: Tools, group: 'Savoir' },
  platforms: { label: 'Plateformes', icon: Grid3x3, C: Platforms, group: 'Réseau' },
  partners: { label: 'Partenaires', icon: Handshake, C: Partners, group: 'Réseau' },
  finance: { label: 'Commissions & dépenses', icon: Wallet, C: Finance, group: 'Agence' },
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
  const groups = [...new Set(Object.values(PAGES).map(p => p.group))]

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-slate-300 transition-transform lg:translate-x-0 ${nav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-lg font-bold text-white">🏡 ImmoPilot</div>
            <div className="truncate text-xs text-slate-400">{db.agency.name}</div>
          </div>
          <button className="lg:hidden" onClick={() => setNav(false)}><X size={20} /></button>
        </div>
        <button onClick={() => setSearch(true)} className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400 hover:bg-white/10">
          <Search size={15} /> Rechercher… <kbd className="ml-auto text-[10px]">Ctrl K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map(g => (
            <div key={g} className="mt-3">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g}</div>
              {(Object.entries(PAGES) as [Page, (typeof PAGES)[Page]][]).filter(([, p]) => p.group === g).map(([k, p]) => (
                <button key={k} onClick={() => go(k)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${route.page === k ? 'bg-brand-600 text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                  <p.icon size={16} /> {p.label}
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
                {session?.user.role === 'superadmin' && <a href="/admin" className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><Shield size={12} /> Console</a>}
                <button onClick={() => setAccount(true)} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><KeyRound size={12} /> Compte</button>
                <button onClick={async () => { await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); location.href = '/connexion' }} className="ml-auto flex items-center gap-1 rounded bg-white/5 px-2 py-1 hover:bg-white/10"><LogOut size={12} /> Quitter</button>
              </div>
            </>
          )}
        </div>
      </aside>
      {nav && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNav(false)} />}

      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setNav(true)}><Menu size={22} /></button>
        <span className="font-semibold">{PAGES[route.page].label}</span>
        <button className="ml-auto" onClick={() => setSearch(true)}><Search size={20} /></button>
      </header>

      {mode === 'local' && <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">Mode démonstration — données enregistrées dans ce navigateur seulement. <a href="/connexion" className="font-semibold underline">Se connecter</a> pour l’espace sécurisé partagé de votre agence.</div>}
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Cur key={route.page} go={go} openId={route.id} />
      </main>
      {search && <GlobalSearch go={go} onClose={() => setSearch(false)} />}
      {account && <AccountModal onClose={() => setAccount(false)} forced={!!session?.user.mustChangePassword} />}
    </div>
  )
}
