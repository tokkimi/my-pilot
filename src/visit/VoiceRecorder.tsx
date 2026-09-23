import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Mic, Square, Trash2 } from 'lucide-react'

// Enregistre une note vocale et la transcrit en direct avec la reconnaissance vocale du navigateur (fr-CA).
// Repris de l'outil de visite MG Pro. Sans micro ni reconnaissance, la note peut être saisie au clavier.
export type VoiceResult = { transcript: string; blob: Blob | null; mime: string; duration: number }
type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void }
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) if (MediaRecorder.isTypeSupported?.(m)) return m
  return ''
}
const speechCtor = () => (typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as (new () => SR) | undefined : undefined)

export default function VoiceRecorder({ onSave, label = 'Note vocale', compact }: { onSave: (r: VoiceResult) => void | Promise<void>; label?: string; compact?: boolean }) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'review'>('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const recognition = useRef<SR | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const stopping = useRef(false)
  const mime = useRef('')
  const supported = !!speechCtor()

  useEffect(() => () => cleanup(), [])
  function cleanup() {
    stopping.current = true
    try { if (rec.current && rec.current.state !== 'inactive') rec.current.stop() } catch { /* */ }
    try { recognition.current?.stop() } catch { /* */ }
    stream.current?.getTracks().forEach(t => t.stop())
    window.clearInterval(timer.current)
  }
  async function start() {
    setError(''); setTranscript(''); setInterim(''); setElapsed(0); chunks.current = []; stopping.current = false
    let got = false
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.current = s; got = true
        mime.current = pickMime()
        const mr = new MediaRecorder(s, mime.current ? { mimeType: mime.current, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 })
        rec.current = mr
        mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
        mr.start(1000)
      }
    } catch { setError('Micro indisponible — dictez ou saisissez la note ci-dessous.') }
    const Ctor = speechCtor()
    if (Ctor) {
      try {
        const r = new Ctor()
        r.lang = 'fr-CA'; r.continuous = true; r.interimResults = true
        r.onresult = (e: any) => {
          let fin = '', intm = ''
          for (let i = e.resultIndex; i < e.results.length; i++) { const tr = e.results[i][0].transcript; if (e.results[i].isFinal) fin += tr; else intm += tr }
          if (fin) setTranscript(p => (p ? p + ' ' : '') + fin.trim())
          setInterim(intm)
        }
        r.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Transcription refusée — saisissez la note manuellement.') }
        r.onend = () => { if (!stopping.current) { try { r.start() } catch { /* */ } } }
        r.start(); recognition.current = r
      } catch { /* */ }
    }
    timer.current = window.setInterval(() => setElapsed(e => { if (e >= 599) { stop(); return 600 } return e + 1 }), 1000)
    setMode('recording')
    if (!got && !Ctor) setError('Enregistrement audio non pris en charge sur cet appareil. Saisissez la note ci-dessous.')
  }
  function stop() {
    stopping.current = true
    window.clearInterval(timer.current)
    setInterim('')
    try { recognition.current?.stop() } catch { /* */ }
    const mr = rec.current
    if (mr && mr.state !== 'inactive') { mr.onstop = () => { stream.current?.getTracks().forEach(t => t.stop()); setMode('review') }; mr.stop() }
    else { stream.current?.getTracks().forEach(t => t.stop()); setMode('review') }
  }
  async function save() {
    setBusy(true)
    try {
      const blob = chunks.current.length ? new Blob(chunks.current, { type: mime.current || 'audio/webm' }) : null
      await onSave({ transcript: transcript.trim(), blob, mime: mime.current || 'audio/webm', duration: elapsed })
      reset()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function reset() { setMode('idle'); setTranscript(''); setInterim(''); setElapsed(0); setError(''); chunks.current = [] }
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mode === 'recording' ? 'bg-rose-500 text-white' : 'bg-brand-50 text-brand-600'}`}>
          {mode === 'recording' ? <span className="flex h-4 items-end gap-0.5">{Array.from({ length: 5 }).map((_, i) => <i key={i} className="w-0.5 animate-pulse rounded bg-white" style={{ height: `${40 + ((i * 37) % 60)}%`, animationDelay: `${i * 120}ms` }} />)}</span> : <Mic size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-xs text-slate-500">{mode === 'recording' ? `Enregistrement… ${mmss(elapsed)}` : mode === 'review' ? `Note de ${mmss(elapsed)} prête — vérifiez la transcription` : supported ? 'Dictez : la transcription se fait en direct.' : 'Dictez puis corrigez, ou saisissez la note.'}</div>
        </div>
        {mode === 'idle' && <button type="button" className="btn-primary" onClick={start}><Mic size={15} />Dicter</button>}
        {mode === 'recording' && <button type="button" className="btn bg-rose-600 text-white hover:bg-rose-700" onClick={stop}><Square size={14} />Arrêter</button>}
      </div>
      {(mode === 'recording' || mode === 'review') && (
        <textarea className="input mt-2 min-h-24" value={transcript + (interim ? (transcript ? ' ' : '') + interim : '')} onChange={e => { setTranscript(e.target.value); setInterim('') }}
          placeholder="La transcription apparaît ici. Vous pouvez la corriger avant d’enregistrer." />
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {mode === 'review' && (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={reset}><Trash2 size={14} />Reprendre</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || (!transcript.trim() && !chunks.current.length)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Enregistrer la note</button>
        </div>
      )}
    </div>
  )
}
