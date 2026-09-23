import { tr } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { Check, Plus, RotateCcw, X } from 'lucide-react'
import type { MeasureOut } from './Measure'

// Ruban à mesurer en réalité augmentée (WebXR « immersive-ar » + hit-test).
// Disponible sur Android (Chrome + ARCore). Les mesures sont réelles (en mètres) grâce au suivi 3D de l'appareil.
/* eslint-disable @typescript-eslint/no-explicit-any */
type V3 = [number, number, number]

export async function arSupported(): Promise<boolean> {
  const xr = (navigator as any).xr
  if (!xr?.isSessionSupported) return false
  try { return await xr.isSessionSupported('immersive-ar') } catch { return false }
}

const d3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
function project(p: V3, view: any, w: number, h: number): [number, number] | null {
  const inv = view.transform.inverse.matrix as Float32Array
  const proj = view.projectionMatrix as Float32Array
  const m = (M: Float32Array, v: number[]) => [0, 1, 2, 3].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3])
  const c = m(proj, m(inv, [...p, 1]))
  if (c[3] <= 0) return null
  return [((c[0] / c[3]) * 0.5 + 0.5) * w, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * h]
}

export default function ArMeasure({ unit, onApply, onClose }: { unit: 'pi' | 'm'; onApply: (m: MeasureOut[]) => void; onClose: () => void }) {
  const overlay = useRef<HTMLDivElement>(null)
  const session = useRef<any>(null)
  const reticle = useRef<V3 | null>(null)
  const points = useRef<V3[]>([])
  const [screen, setScreen] = useState<{ pts: [number, number][]; ret: [number, number] | null }>({ pts: [], ret: null })
  const [segments, setSegments] = useState<{ label: string; meters: number }[]>([])
  const [status, setStatus] = useState('Démarrage de la réalité augmentée…')
  const [error, setError] = useState('')
  const [live, setLive] = useState(0)
  const conv = (m: number) => (unit === 'pi' ? m * 3.28084 : m)

  useEffect(() => {
    let stopped = false
    ;(async () => {
      try {
        const xr = (navigator as any).xr
        const s = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay.current } })
        session.current = s
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl', { xrCompatible: true }) as WebGLRenderingContext
        const XRWebGLLayer = (window as any).XRWebGLLayer
        s.updateRenderState({ baseLayer: new XRWebGLLayer(s, gl) })
        const refSpace = await s.requestReferenceSpace('local')
        const viewer = await s.requestReferenceSpace('viewer')
        const hitSource = await s.requestHitTestSource({ space: viewer })
        s.addEventListener('end', () => { if (!stopped) onClose() })
        s.addEventListener('select', () => addPoint())
        // les touches sur les boutons de l'interface ne doivent pas placer de point
        overlay.current?.querySelectorAll('[data-ui]').forEach(el => el.addEventListener('beforexrselect', ev => ev.preventDefault()))
        setStatus('Balayez lentement le plancher ou le mur avec la caméra…')
        const frame = (_t: number, f: any) => {
          if (stopped) return
          s.requestAnimationFrame(frame)
          const layer = s.renderState.baseLayer
          gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer)
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
          const hits = f.getHitTestResults(hitSource)
          const pose = f.getViewerPose(refSpace)
          if (hits.length) {
            const p = hits[0].getPose(refSpace).transform.position
            reticle.current = [p.x, p.y, p.z]
            setStatus('Surface détectée — touchez « Point » pour marquer une extrémité.')
          } else reticle.current = null
          if (pose) {
            const view = pose.views[0]
            const w = window.innerWidth, h = window.innerHeight
            setScreen({ pts: points.current.map(pt => project(pt, view, w, h)).filter(Boolean) as [number, number][], ret: reticle.current ? project(reticle.current, view, w, h) : null })
            const last = points.current[points.current.length - 1]
            setLive(last && reticle.current && points.current.length % 2 === 1 ? d3(last, reticle.current) : 0)
          }
        }
        s.requestAnimationFrame(frame)
      } catch (e) {
        setError('La réalité augmentée n’a pas pu démarrer sur cet appareil. Utilisez la mesure sur photo/vidéo. (' + (e as Error).message + ')')
      }
    })()
    return () => { stopped = true; session.current?.end?.().catch(() => undefined) }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const addPoint = () => {
    if (!reticle.current) return
    points.current = [...points.current, [...reticle.current] as V3]
    const n = points.current.length
    if (n % 2 === 0) {
      const m = d3(points.current[n - 2], points.current[n - 1])
      setSegments(s => [...s, { label: ['Longueur', 'Largeur', 'Hauteur'][Math.min(s.length, 2)] ?? 'Autre', meters: m }])
    }
  }
  const finish = () => {
    onApply(segments.map(s => ({ label: s.label, value: Math.round(conv(s.meters) * 100) / 100 })))
    session.current?.end?.()
    onClose()
  }

  return (
    <div ref={overlay} className="fixed inset-0 z-[70] text-white" style={{ background: error ? '#0f172a' : 'transparent' }}>
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <p>{error}</p><button className="btn-primary" onClick={onClose}>{tr("Fermer")}</button>
        </div>
      ) : (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {screen.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={7} fill="#8b5cf6" stroke="#fff" strokeWidth={2} />)}
            {screen.pts.map((p, i) => i % 2 === 1 && <line key={'l' + i} x1={screen.pts[i - 1][0]} y1={screen.pts[i - 1][1]} x2={p[0]} y2={p[1]} stroke="#8b5cf6" strokeWidth={4} />)}
            {screen.ret && screen.pts.length % 2 === 1 && <line x1={screen.pts[screen.pts.length - 1][0]} y1={screen.pts[screen.pts.length - 1][1]} x2={screen.ret[0]} y2={screen.ret[1]} stroke="#fff" strokeDasharray="8 6" strokeWidth={3} />}
            {screen.ret && <g><circle cx={screen.ret[0]} cy={screen.ret[1]} r={16} fill="none" stroke="#fff" strokeWidth={3} /><circle cx={screen.ret[0]} cy={screen.ret[1]} r={3} fill="#fff" /></g>}
          </svg>
          <div data-ui className="absolute left-0 right-0 top-0 flex items-center gap-2 bg-black/50 p-3 text-sm">
            <span className="flex-1">{status}</span>
            <button onClick={() => { session.current?.end?.(); onClose() }}><X /></button>
          </div>
          {live > 0 && <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-lg font-bold">{conv(live).toFixed(2)} {unit}</div>}
          <div data-ui className="absolute bottom-0 left-0 right-0 space-y-2 bg-black/60 p-3">
            {segments.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <select className="rounded bg-white/10 px-2 py-1" value={s.label} onChange={e => setSegments(x => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}>
                  {['Longueur', 'Largeur', 'Hauteur', 'Autre'].map(l => <option key={l} className="text-black">{l}</option>)}
                </select>
                <b>{conv(s.meters).toFixed(2)} {unit}</b>
              </div>
            ))}
            <div className="flex justify-center gap-3">
              <button className="btn border border-white/40 text-white" onClick={() => { points.current = []; setSegments([]) }}><RotateCcw size={16} /></button>
              <button className="btn-primary px-6 py-3 text-base" onClick={() => addPoint()}><Plus size={18} /> Point</button>
              <button className="btn bg-emerald-600 text-white" disabled={!segments.length} onClick={finish}><Check size={16} /> Terminer</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
