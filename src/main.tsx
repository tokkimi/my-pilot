import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider, type Session } from './lib/store'
import { setMediaContext } from './lib/media'
import type { DB } from './lib/types'
import Landing from './site/Landing'
import { language } from './lib/i18n'

document.documentElement.lang = language
function LanguageSwitch() {
  return <div className="language-switch no-print" aria-label="Language / Langue">{(['fr', 'en'] as const).map(code => <button key={code} aria-pressed={language === code} onClick={() => { if (code === language) return; localStorage.setItem('immopilot-language', code); location.reload() }}>{code.toUpperCase()}</button>)}</div>
}

const App = lazy(() => import('./App'))
const Admin = lazy(() => import('./site/Admin'))
const Login = lazy(() => import('./site/Login'))

const Loading = ({ text = 'Chargement…' }: { text?: string }) => <div className="flex min-h-screen items-center justify-center text-slate-500">{text}</div>

function RemoteApp() {
  const [state, setState] = useState<{ db: DB; session: Session; agency?: string } | { error: string } | null>(null)
  useEffect(() => {
    ;(async () => {
      const me = await fetch('/api/auth').then(r => r.json()).catch(() => null)
      if (!me?.user) { location.href = '/connexion'; return }
      const agency = new URLSearchParams(location.search).get('agency') ?? undefined
      if (me.user.role === 'superadmin' && !agency) { location.href = '/admin'; return }
      const r = await fetch('/api/data' + (agency ? `?agency=${encodeURIComponent(agency)}` : ''))
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { setState({ error: b.error || 'Impossible de charger l’espace.' }); return }
      setMediaContext(me.storage, b.agency.id, me.upload)
      setState({ db: b.db, session: { user: b.me, agency: b.agency }, agency })
    })()
  }, [])
  if (!state) return <Loading text="Ouverture de votre espace…" />
  if ('error' in state) return <div className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-md p-6 text-center"><p className="text-rose-600">{state.error}</p><a className="btn-primary mt-4" href="/connexion">Retour</a></div></div>
  return <StoreProvider mode="remote" initial={state.db} session={state.session} agencyParam={state.agency}><App /></StoreProvider>
}

const path = location.pathname.replace(/\/+$/, '') || '/'
const page =
  path === '/demo' ? <StoreProvider mode="local"><App /></StoreProvider>
  : path === '/app' ? <RemoteApp />
  : path === '/connexion' ? <Login />
  : path === '/admin' ? <Admin />
  : <Landing />

if ('serviceWorker' in navigator && location.hostname !== 'localhost') window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageSwitch /><Suspense fallback={<Loading />}>{page}</Suspense>
  </StrictMode>,
)
