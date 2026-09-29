import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Send, Sparkles, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { aiAsk, aiDecide, aiStatus, type AiProposal } from '../lib/integrations/client'

interface Msg { role: 'user' | 'ia'; text: string; sources?: { ref: string; source: string; date: string }[]; proposals?: AiProposal[] }
const QUICK = ['Résume la situation de l’agence cette semaine', 'Quels changements et incohérences vois-tu dans les données?', 'Propose mes tâches prioritaires', 'Explique mes statistiques marketing']
const FOCUS: Record<string, string> = { contacts: 'ce contact', listings: 'cette inscription', deals: 'ce dossier' }

// Assistant IA d'ImmoPilot : aucune connexion ChatGPT; l'IA passe par le serveur, selon les permissions de l'agence.
export default function Assistant({ page, id }: { page: string; id?: string }) {
  const { mode, refresh } = useStore()
  const [open, setOpen] = useState(false)
  const [st, setSt] = useState<{ available: boolean; reason: string; model: string } | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [useFocus, setUseFocus] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (mode === 'remote' && open && !st) void aiStatus().then(s => { setSt(s); if (s.proposals.length) setMsgs([{ role: 'ia', text: 'Propositions en attente de votre validation :', proposals: s.proposals }]) }).catch(e => setSt({ available: false, reason: (e as Error).message, model: '' })) }, [mode, open, st])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  if (mode !== 'remote') return null
  const focus = id && FOCUS[page] && useFocus ? { coll: page, id } : undefined

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setMsgs(m => [...m, { role: 'user', text }]); setQ(''); setBusy(true)
    try {
      const r = await aiAsk(text, focus)
      setMsgs(m => [...m, { role: 'ia', text: r.answer, sources: r.sources, proposals: r.proposals }])
    } catch (e) { setMsgs(m => [...m, { role: 'ia', text: '⚠ ' + (e as Error).message }]) } finally { setBusy(false) }
  }
  const decide = async (p: AiProposal, accept: boolean) => {
    try {
      await aiDecide(p.id, accept)
      setMsgs(m => m.map(x => ({ ...x, proposals: x.proposals?.filter(y => y.id !== p.id) })))
      if (accept) await refresh()
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-label="Assistant IA" className="no-print fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl ring-4 ring-white transition hover:scale-105 lg:bottom-6 lg:right-6">
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>
      {open && (
        <div className="no-print fixed inset-x-2 bottom-40 top-16 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-[26rem] lg:bottom-24 lg:top-auto lg:h-[36rem]">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-3 text-white">
            <Sparkles size={16} /><div className="flex-1"><div className="text-sm font-semibold">Assistant ImmoPilot</div><div className="text-[11px] opacity-80">Données de votre agence, avec leur source et leur date</div></div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {!st ? <Loader2 className="animate-spin text-slate-400" /> : !st.available ? <p className="rounded-lg bg-slate-50 p-3 text-slate-600">{st.reason}</p> : msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-slate-600">Je lis les données autorisées de votre agence (et des outils connectés), je résume, je repère les incohérences et je propose des tâches. Je n’envoie, ne publie et ne signe rien : vous validez.</p>
                {QUICK.map(x => <button key={x} onClick={() => send(x)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-brand-300 hover:bg-brand-50">{x}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'ml-8 rounded-xl bg-brand-600 px-3 py-2 text-white' : 'mr-4 rounded-xl bg-slate-50 px-3 py-2'}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {!!m.sources?.length && <div className="mt-2 flex flex-wrap gap-1">{m.sources.slice(0, 8).map((s, j) => <span key={j} className="badge bg-white text-[10px] text-slate-500 ring-1 ring-slate-200" title={s.ref}>{s.source}{s.date ? ` · ${s.date.slice(0, 10)}` : ''}</span>)}</div>}
                {m.proposals?.map(p => (
                  <div key={p.id} className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-slate-500">Échéance {p.due} · priorité {p.priority}{p.reason ? ` — ${p.reason}` : ''}</div>
                    <div className="mt-1 flex gap-1"><button className="btn-primary py-0.5 text-xs" onClick={() => decide(p, true)}><Check size={12} /> Ajouter la tâche</button><button className="btn-ghost py-0.5 text-xs" onClick={() => decide(p, false)}>Ignorer</button></div>
                  </div>
                ))}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Analyse en cours…</div>}
            <div ref={end} />
          </div>
          {st?.available && (
            <div className="border-t border-slate-100 p-2">
              {id && FOCUS[page] && <label className="mb-1 flex items-center gap-1 px-1 text-[11px] text-slate-500"><input type="checkbox" checked={useFocus} onChange={e => setUseFocus(e.target.checked)} /> Limiter l’analyse à {FOCUS[page]}</label>}
              <form onSubmit={e => { e.preventDefault(); void send(q) }} className="flex gap-2">
                <input className="input" placeholder="Posez une question…" value={q} onChange={e => setQ(e.target.value)} />
                <button className="btn-primary px-3" disabled={busy || !q.trim()}><Send size={15} /></button>
              </form>
              <p className="mt-1 px-1 text-[10px] text-slate-400">API OpenAI via ImmoPilot ({st.model}) · aucun compte ChatGPT requis · réponses à vérifier</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
