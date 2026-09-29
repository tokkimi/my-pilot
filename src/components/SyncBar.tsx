import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { ago, getReviews, refreshAll, resolveReview, syncStatus, syncStep } from '../lib/integrations/client'
import type { ReviewItem, SyncStatus } from '../lib/integrations/types'
import { CONNECTORS } from '../lib/integrations/catalog'

// Bouton « Actualiser » du tableau de bord : lance la collecte de tous les outils réellement connectés,
// suit la progression, puis recharge toutes les données. Affiche honnêtement les outils en erreur.
export default function SyncBar({ onOpenPlatforms }: { onOpenPlatforms: () => void }) {
  const { mode, refresh } = useStore()
  const [st, setSt] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [open, setOpen] = useState(false)
  const lastRunId = useRef<string | undefined>(undefined)

  const loadReviews = useCallback(() => getReviews().then(r => setReviews(r.reviews)).catch(() => undefined), [])
  const follow = useCallback(async (s: SyncStatus) => {
    setSt(s)
    let cur = s
    while (cur.run) { cur = await syncStep(); setSt(cur) }
    return cur
  }, [])
  const done = useCallback(async (s: SyncStatus) => {
    lastRunId.current = s.lastRun?.id
    await refresh()
    await loadReviews()
  }, [refresh, loadReviews])

  useEffect(() => {
    if (mode !== 'remote') return
    let alive = true
    const tick = async () => {
      const s = await syncStatus().catch(() => null)
      if (!alive || !s) return
      setSt(s)
      // une synchronisation automatique s'est terminée entre-temps : on recharge les données
      if (lastRunId.current && s.lastRun?.id && s.lastRun.id !== lastRunId.current && !s.run) await done(s)
      lastRunId.current = s.lastRun?.id
    }
    void tick(); void loadReviews()
    const i = window.setInterval(() => { if (document.visibilityState === 'visible') void tick() }, 60000)
    return () => { alive = false; window.clearInterval(i) }
  }, [mode, done, loadReviews])

  if (mode !== 'remote') return null

  const run = async () => {
    setBusy(true); setMsg('')
    try {
      const s = await refreshAll()
      if (s.message) setMsg(s.message)
      await done(await follow(s))
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const running = busy || !!st?.run
  const jobs = st?.run?.jobs ?? []
  const finished = jobs.filter(j => j.state !== 'attente' && j.state !== 'en_cours').length
  const current = jobs.find(j => j.state === 'en_cours') ?? jobs.find(j => j.state === 'attente')
  const last = st?.lastRun

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm">
        <button onClick={run} disabled={running} className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-1.5 font-semibold text-white shadow transition hover:shadow-md disabled:opacity-80">
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} className="transition group-hover:rotate-90" />} {running ? 'Actualisation…' : 'Actualiser'}
        </button>
        {running && jobs.length > 0 ? (
          <div className="flex min-w-48 flex-1 items-center gap-2 text-xs text-slate-600">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.round((finished / jobs.length) * 100)}%` }} /></div>
            <span>{finished}/{jobs.length} outils{current ? ` · ${current.label}` : ''}</span>
          </div>
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{st?.lastRefreshAt ? <>Dernière actualisation {ago(st.lastRefreshAt)}</> : 'Jamais actualisé'}</span>
            {st && <span>{st.toolsOk} outil{st.toolsOk > 1 ? 's' : ''} à jour</span>}
            {!!st?.toolsError.length && <button onClick={onOpenPlatforms} className="inline-flex items-center gap-1 text-amber-700 hover:underline"><AlertTriangle size={12} /> Non actualisés : {st.toolsError.join(', ')}</button>}
            {st && st.connections.length === 0 && <button onClick={onOpenPlatforms} className="text-brand-700 hover:underline">Reliez vos outils →</button>}
          </div>
        )}
        {reviews.length > 0 && (
          <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            À vérifier · {reviews.length} {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {msg && <p className="mt-1 px-1 text-xs text-slate-500">{msg}</p>}
      {last?.aiSummary && !running && <p className="mt-1 flex items-start gap-1 px-1 text-xs text-slate-500"><Sparkles size={12} className="mt-0.5 shrink-0 text-brand-500" />{last.aiSummary}{last.insights?.length ? ` — ${last.insights.join(' · ')}` : ''}</p>}
      {open && <ReviewList reviews={reviews} onDone={async () => { await refresh(); await loadReviews() }} />}
    </div>
  )
}

const show = (v: unknown) => (v === '' || v === undefined || v === null ? <i className="text-slate-400">vide</i> : typeof v === 'object' ? JSON.stringify(v) : String(v))
const src = (s: string) => CONNECTORS[s as keyof typeof CONNECTORS]?.name ?? s

function ReviewList({ reviews, onDone }: { reviews: ReviewItem[]; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState('')
  const act = async (r: ReviewItem, accept: boolean) => {
    setBusy(r.id)
    try { await resolveReview(r.id, accept); await onDone() } catch (e) { alert((e as Error).message) } finally { setBusy('') }
  }
  return (
    <div className="mt-2 space-y-2">
      {reviews.slice(0, 50).map(r => {
        const dup = r.field === '_duplicate', del = r.field === '_deleted', inc = r.kind === 'incoherence'
        return (
          <div key={r.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.entityLabel} <span className="text-slate-400">· {r.fieldLabel}</span></div>
              <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                <div className="rounded bg-slate-50 px-2 py-1"><span className="text-slate-400">{dup ? 'Fiche existante' : 'Dans ImmoPilot'} ({src(r.currentSource)}{r.currentAt ? `, ${r.currentAt.slice(0, 10)}` : ''}) :</span> {show(r.current)}</div>
                <div className="rounded bg-amber-50 px-2 py-1"><span className="text-amber-700">{dup ? 'Nouvelle fiche' : 'Proposé'} ({src(r.proposedSource)}, {r.proposedAt.slice(0, 10)}) :</span> {show(r.proposed)}</div>
              </div>
              {r.note && <div className="mt-1 text-[11px] text-slate-500">{r.note}</div>}
            </div>
            <div className="flex gap-1.5">
              <button disabled={!!busy} className="btn-ghost py-1 text-xs" onClick={() => act(r, false)}>{inc ? 'Ignorer' : dup ? 'Garder séparés' : 'Garder ImmoPilot'}</button>
              {!inc && <button disabled={!!busy} className="btn-primary py-1 text-xs" onClick={() => act(r, true)}>{busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {dup ? 'Fusionner' : del ? 'Retirer d’ImmoPilot' : 'Accepter'}</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
