import { tr } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { Camera as CamIcon, Check, Circle, RefreshCw, Square, Upload, X } from 'lucide-react'

// Enregistreur vidéo plein écran (caméra arrière). Repli : sélection d'un fichier / appareil photo natif.
const pickVideoMime = () => {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (MediaRecorder.isTypeSupported?.(m)) return m
  return ''
}

export default function VideoRecorder({ title, onSave, onClose, onFrame }: { title: string; onSave: (blob: Blob) => Promise<void> | void; onClose: () => void; onFrame?: (dataUrl: string) => void }) {
  const live = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | undefined>(undefined)
  const [state, setState] = useState<'starting' | 'ready' | 'recording' | 'review' | 'error'>('starting')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setState('starting')
      try {
        stream.current?.getTracks().forEach(t => t.stop())
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true })
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        stream.current = s
        if (live.current) { live.current.srcObject = s; await live.current.play().catch(() => undefined) }
        setState('ready')
      } catch {
        setError('Caméra indisponible (autorisation refusée ou appareil non compatible). Utilisez « Importer une vidéo ».')
        setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [facing])

  useEffect(() => () => { stream.current?.getTracks().forEach(t => t.stop()); window.clearInterval(timer.current); if (result) URL.revokeObjectURL(result.url) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!stream.current) return
    chunks.current = []
    const mime = pickVideoMime()
    const mr = new MediaRecorder(stream.current, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined)
    mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
    mr.onstop = () => {
      const blob = new Blob(chunks.current, { type: (mime || 'video/webm').split(';')[0] })
      setResult({ blob, url: URL.createObjectURL(blob) })
      setState('review')
    }
    mr.start(1000)
    rec.current = mr
    setElapsed(0)
    timer.current = window.setInterval(() => setElapsed(e => { if (e >= 299) { stop(); return 300 } return e + 1 }), 1000)
    setState('recording')
  }
  const stop = () => { window.clearInterval(timer.current); if (rec.current?.state !== 'inactive') rec.current?.stop() }
  const retake = () => { if (result) URL.revokeObjectURL(result.url); setResult(null); setState('ready') }
  const save = async (blob: Blob) => { setSaving(true); try { await onSave(blob); stream.current?.getTracks().forEach(t => t.stop()); onClose() } catch (e) { setError((e as Error).message) } finally { setSaving(false) } }
  const snap = () => {
    const v = live.current
    if (!v || !onFrame) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    onFrame(c.toDataURL('image/jpeg', 0.9))
  }
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 p-3">
        <button onClick={() => { stream.current?.getTracks().forEach(t => t.stop()); onClose() }} aria-label={tr("Fermer")}><X /></button>
        <div className="flex-1 truncate font-semibold">🎥 {title}</div>
        {state === 'recording' && <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-sm"><Circle size={10} className="animate-pulse fill-white" /> {mmss(elapsed)}</span>}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {state !== 'review' && <video ref={live} className="max-h-full max-w-full" playsInline muted />}
        {state === 'review' && result && <video src={result.url} className="max-h-full max-w-full" controls playsInline />}
        {state === 'starting' && <div className="absolute text-sm text-white/70">Ouverture de la caméra…</div>}
        {state === 'error' && <div className="absolute max-w-sm p-6 text-center text-sm">{error}</div>}
        {(state === 'ready' || state === 'recording') && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-black/50 p-2 text-center text-xs">
            Filmez lentement le tour de la pièce : les 4 murs, le plancher et le plafond. Incluez une porte (référence de taille) pour la mesure.
          </div>
        )}
      </div>
      {error && state !== 'error' && <div className="bg-rose-600 p-2 text-center text-sm">{error}</div>}
      <div className="flex items-center justify-center gap-6 p-5">
        {state === 'review' ? (
          <>
            <button className="btn border border-white/40 text-white" onClick={retake}><RefreshCw size={16} />Reprendre</button>
            <button className="btn-primary" disabled={saving} onClick={() => result && save(result.blob)}><Check size={16} />{saving ? 'Envoi…' : 'Enregistrer la vidéo'}</button>
          </>
        ) : (
          <>
            <label className="btn cursor-pointer border border-white/40 text-white">
              <Upload size={16} /> Importer
              <input type="file" accept="video/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void save(f) }} />
            </label>
            {state === 'recording'
              ? <button onClick={stop} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white" aria-label="Arrêter"><Square className="fill-rose-600 text-rose-600" /></button>
              : <button onClick={start} disabled={state !== 'ready'} className="h-16 w-16 rounded-full border-4 border-white bg-rose-600 disabled:opacity-40" aria-label={tr("Enregistrer")} />}
            {onFrame && state !== 'error'
              ? <button className="btn border border-white/40 text-white" onClick={snap} disabled={state === 'starting'}><CamIcon size={16} /> Image → mesurer</button>
              : <button className="btn border border-white/40 text-white" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}><RefreshCw size={16} /></button>}
          </>
        )}
      </div>
    </div>
  )
}
