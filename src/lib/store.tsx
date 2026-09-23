import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Coll, DB, ID, Member } from './types'
import { seed } from './seed'

const KEY = 'immopilot-db-v1'

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...seed(), ...JSON.parse(raw) }
  } catch { /* stockage indisponible : on repart des données de démonstration */ }
  return seed()
}

type Item<C extends Coll> = DB[C][number]

interface Store {
  db: DB
  me: Member
  scope: 'moi' | 'equipe'
  setScope: (s: 'moi' | 'equipe') => void
  upsert: <C extends Coll>(coll: C, item: Item<C>) => void
  remove: (coll: Coll, id: ID) => void
  patch: (p: Partial<DB>) => void
  replace: (db: DB) => void
  mine: (ownerId: ID | undefined) => boolean
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load)
  const [scope, setScope] = useState<'moi' | 'equipe'>('equipe')

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota dépassé */ }
  }, [db])

  const upsert = useCallback(<C extends Coll>(coll: C, item: Item<C>) => {
    setDb(d => {
      const list = d[coll] as Item<C>[]
      const exists = list.some(x => x.id === item.id)
      return { ...d, [coll]: exists ? list.map(x => (x.id === item.id ? item : x)) : [item, ...list] }
    })
  }, [])

  const remove = useCallback((coll: Coll, id: ID) => {
    setDb(d => ({ ...d, [coll]: (d[coll] as { id: ID }[]).filter(x => x.id !== id) }))
  }, [])

  const patch = useCallback((p: Partial<DB>) => setDb(d => ({ ...d, ...p })), [])
  const replace = useCallback((n: DB) => setDb(n), [])

  const me = db.members.find(m => m.id === db.currentUserId) ?? db.members[0]
  const mine = useCallback((ownerId: ID | undefined) => scope === 'equipe' || ownerId === me.id, [scope, me.id])

  const value = useMemo(() => ({ db, me, scope, setScope, upsert, remove, patch, replace, mine }), [db, me, scope, upsert, remove, patch, replace, mine])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider manquant')
  return s
}

export const resetDemo = () => { localStorage.removeItem(KEY); location.reload() }
