import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coll, DB, ID, Member } from './types'
import { seed } from './seed'

const KEY = 'immopilot-db-v1'

export type Mode = 'local' | 'remote'
export interface Session { user: { id: string; name: string; email: string; role: string; mustChangePassword?: boolean }; agency: { id: string; name: string; plan: string; seats: number } }

function loadLocal(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...seed(), ...JSON.parse(raw) }
  } catch { /* stockage indisponible : on repart des données de démonstration */ }
  return seed()
}

type Item<C extends Coll> = DB[C][number]
type Op = { t: 'upsert'; c: Coll; item: unknown } | { t: 'remove'; c: Coll; id: ID } | { t: 'patch'; p: Partial<DB> }

interface Store {
  db: DB
  me: Member
  mode: Mode
  session: Session | null
  sync: 'ok' | 'saving' | 'error'
  syncError: string
  isAdmin: boolean
  scope: 'moi' | 'equipe'
  setScope: (s: 'moi' | 'equipe') => void
  upsert: <C extends Coll>(coll: C, item: Item<C>) => void
  remove: (coll: Coll, id: ID) => void
  patch: (p: Partial<DB>) => void
  replace: (db: DB) => void
  mine: (ownerId: ID | undefined) => boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, mode, initial, session, agencyParam }: { children: ReactNode; mode: Mode; initial?: DB; session?: Session | null; agencyParam?: string }) {
  const [db, setDb] = useState<DB>(() => initial ?? loadLocal())
  const [scope, setScope] = useState<'moi' | 'equipe'>('equipe')
  const [sync, setSync] = useState<'ok' | 'saving' | 'error'>('ok')
  const [syncError, setSyncError] = useState('')
  const queue = useRef<Op[]>([])
  const timer = useRef<number | undefined>(undefined)
  const q = agencyParam ? `?agency=${encodeURIComponent(agencyParam)}` : ''

  useEffect(() => {
    if (mode !== 'local') return
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota dépassé */ }
  }, [db, mode])

  const flush = useCallback(async () => {
    if (!queue.current.length) return
    // on ne garde que la dernière version de chaque élément modifié
    const seen = new Set<string>()
    const ops = queue.current.reverse().filter(o => {
      const k = o.t === 'patch' ? 'patch' : `${o.c}:${o.t === 'upsert' ? (o.item as { id: string }).id : o.id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).reverse()
    queue.current = []
    setSync('saving')
    try {
      const r = await fetch('/api/data' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) })
      const body = await r.json().catch(() => ({}))
      if (r.status === 401) { location.href = '/connexion'; return }
      if (!r.ok) throw new Error(body.error || 'Erreur d’enregistrement')
      if (body.errors?.length) { setSyncError(body.errors.join(' ')); setSync('error'); alert(body.errors.join('\n')) }
      else { setSync(queue.current.length ? 'saving' : 'ok'); setSyncError('') }
      if (ops.some(o => o.t !== 'patch' && o.c === 'members')) void refresh()
    } catch (e) {
      queue.current = [...ops, ...queue.current]
      setSync('error'); setSyncError((e as Error).message)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, 5000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const push = useCallback((op: Op) => {
    if (mode !== 'remote') return
    queue.current.push(op)
    setSync('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 600)
  }, [mode, flush])

  const refresh = useCallback(async () => {
    if (mode !== 'remote' || queue.current.length) return
    const r = await fetch('/api/data' + q)
    if (r.status === 401) { location.href = '/connexion'; return }
    if (!r.ok) return
    const body = await r.json()
    if (!queue.current.length) setDb(d => ({ ...body.db, currentUserId: d.currentUserId && body.db.members.some((m: Member) => m.id === d.currentUserId) && session?.user.role === 'superadmin' ? d.currentUserId : body.db.currentUserId }))
  }, [mode, q, session])

  // Rafraîchissement périodique pour voir les changements des collègues
  useEffect(() => {
    if (mode !== 'remote') return
    const i = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const beforeUnload = (e: BeforeUnloadEvent) => { if (queue.current.length) { void flush(); e.preventDefault() } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.clearInterval(i); window.removeEventListener('beforeunload', beforeUnload) }
  }, [mode, refresh, flush])

  const upsert = useCallback(<C extends Coll>(coll: C, item: Item<C>) => {
    setDb(d => {
      const list = (d[coll] ?? []) as Item<C>[]
      const exists = list.some(x => x.id === item.id)
      return { ...d, [coll]: exists ? list.map(x => (x.id === item.id ? item : x)) : [item, ...list] }
    })
    push({ t: 'upsert', c: coll, item })
  }, [push])

  const remove = useCallback((coll: Coll, id: ID) => {
    setDb(d => ({ ...d, [coll]: (d[coll] as { id: ID }[]).filter(x => x.id !== id) }))
    push({ t: 'remove', c: coll, id })
  }, [push])

  const patch = useCallback((p: Partial<DB>) => {
    setDb(d => ({ ...d, ...p }))
    if (p.agency) push({ t: 'patch', p: { agency: p.agency } })
  }, [push])
  const replace = useCallback((n: DB) => setDb(n), [])

  const me = db.members.find(m => m.id === db.currentUserId) ?? db.members[0]
  const isAdmin = mode === 'local' ? me.role === 'admin' : session?.user.role === 'admin' || session?.user.role === 'superadmin'
  const mine = useCallback((ownerId: ID | undefined) => scope === 'equipe' || ownerId === me.id, [scope, me.id])

  const value = useMemo(() => ({ db, me, mode, session: session ?? null, sync, syncError, isAdmin, scope, setScope, upsert, remove, patch, replace, mine, refresh }),
    [db, me, mode, session, sync, syncError, isAdmin, scope, upsert, remove, patch, replace, mine, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider manquant')
  return s
}

export const resetDemo = () => { localStorage.removeItem(KEY); location.reload() }
