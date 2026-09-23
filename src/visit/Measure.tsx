import { useMemo, useRef, useState } from 'react'
import { Check, Crosshair, Ruler, Trash2, Undo2, X } from 'lucide-react'

// Mesure assistée sur une image (photo de la pièce ou image extraite de la vidéo).
// Principe : on trace un objet de taille connue (ex. hauteur d'une porte standard = 80 po),
// puis chaque ligne tracée sur le même plan est convertie en dimension réelle.
export interface MeasureOut { label: string; value: number }
type Pt = { x: number; y: number }
type Line = { a: Pt; b: Pt; label: string }

const REFS: { label: string; inches: number }[] = [
  { label: 'Hauteur d’une porte standard (80 po / 2,03 m)', inches: 80 },
  { label: 'Largeur porte extérieure (36 po / 91 cm)', inches: 36 },
  { label: 'Largeur porte intérieure (30 po / 76 cm)', inches: 30 },
  { label: 'Hauteur de comptoir de cuisine (36 po / 91 cm)', inches: 36 },
  { label: 'Carreau de céramique (12 po / 30 cm)', inches: 12 },
  { label: 'Feuille lettre, grand côté (11 po / 28 cm)', inches: 11 },
  { label: 'Plaque de prise électrique (4,5 po / 11,4 cm)', inches: 4.5 },
]
const LABELS = ['Longueur', 'Largeur', 'Hauteur', 'Autre']
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export default function MeasureTool({ src, isVideo, unit, onApply, onClose }: { src: string; isVideo: boolean; unit: 'pi' | 'm'; onApply: (m: MeasureOut[]) => void; onClose: () => void }) {
  const [image, setImage] = useState<string>(isVideo ? '' : src)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ref, setRef] = useState<Line | null>(null)
  const [refKnown, setRefKnown] = useState(REFS[0].inches)
  const [custom, setCustom] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [pending, setPending] = useState<Pt | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const mode: 'ref' | 'measure' = ref ? 'measure' : 'ref'

  // longueur connue de la référence exprimée dans l'unité de la visite
  const knownInUnit = useMemo(() => {
    const inches = custom ? parseFloat(custom.replace(',', '.')) * (unit === 'pi' ? 12 : 39.3701) : refKnown
    return unit === 'pi' ? inches / 12 : inches * 0.0254
  }, [refKnown, custom, unit])
  const scale = ref ? knownInUnit / dist(ref.a, ref.b) : 0
  const valueOf = (l: Line) => Math.round(dist(l.a, l.b) * scale * 100) / 100

  const grabFrame = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setImage(c.toDataURL('image/jpeg', 0.92))
  }
  const toImg = (e: React.PointerEvent): Pt => {
    const s = svg.current!
    const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY
    const r = p.matrixTransform(s.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }
  const tap = (e: React.PointerEvent) => {
    const p = toImg(e)
    if (!pending) { setPending(p); return }
    const line: Line = { a: pending, b: p, label: mode === 'ref' ? 'Référence' : LABELS[Math.min(lines.length, 2)] }
    if (mode === 'ref') setRef(line)
    else setLines(l => [...l, line])
    setPending(null)
  }
  const stroke = Math.max(2, size.w / 400)

  if (!image) {
    return (
      <Shell title="Choisir l’image à mesurer" onClose={onClose}>
        <video ref={video} src={src} className="max-h-[60vh] w-full bg-black" controls playsInline crossOrigin="anonymous" />
        <p className="mt-2 text-sm text-slate-600">Mettez la vidéo en pause sur une image où l’on voit bien le mur à mesurer <b>et</b> une porte (référence), puis :</p>
        <button className="btn-primary mt-2" onClick={grabFrame}><Crosshair size={16} /> Utiliser cette image</button>
      </Shell>
    )
  }

  return (
    <Shell title="Mesure assistée" onClose={onClose}>
      <div className={`mb-2 rounded-lg p-2 text-sm ${mode === 'ref' ? 'bg-amber-50 text-amber-900' : 'bg-brand-50 text-brand-700'}`}>
        {mode === 'ref'
          ? <><b>Étape 1 — Référence :</b> touchez les deux extrémités d’un objet de taille connue (ex. le haut et le bas d’une porte).</>
          : <><b>Étape 2 — Mesures :</b> touchez les deux extrémités de chaque dimension, sur le même mur que la référence.</>}
      </div>
      <div className="relative select-none overflow-hidden rounded-lg bg-slate-900" style={{ touchAction: 'none' }}>
        <img src={image} alt="" className="block w-full" onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {size.w > 0 && (
          <svg ref={svg} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 h-full w-full cursor-crosshair" onPointerDown={tap} onPointerMove={e => pending && setHover(toImg(e))}>
            {ref && <LineView l={ref} color="#f59e0b" w={stroke} text={`Réf. ${knownInUnit.toFixed(2)} ${unit}`} />}
            {lines.map((l, i) => <LineView key={i} l={l} color="#8b5cf6" w={stroke} text={`${l.label} ${valueOf(l)} ${unit}`} />)}
            {pending && <>
              <circle cx={pending.x} cy={pending.y} r={stroke * 3} fill="#fff" stroke="#000" strokeWidth={stroke / 2} />
              {hover && <line x1={pending.x} y1={pending.y} x2={hover.x} y2={hover.y} stroke="#fff" strokeDasharray={`${stroke * 3}`} strokeWidth={stroke} />}
            </>}
          </svg>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-1 text-sm font-semibold">Objet de référence</div>
          <select className="input" value={refKnown} onChange={e => { setRefKnown(+e.target.value); setCustom('') }}>
            {REFS.map(r => <option key={r.label} value={r.inches}>{r.label}</option>)}
          </select>
          <input className="input mt-2" placeholder={`ou longueur personnalisée (${unit})`} value={custom} onChange={e => setCustom(e.target.value)} />
          <div className="mt-2 flex gap-2">
            {ref && <button className="btn-ghost text-xs" onClick={() => { setRef(null); setPending(null) }}><Undo2 size={13} /> Retracer la référence</button>}
            {pending && <button className="btn-ghost text-xs" onClick={() => setPending(null)}><X size={13} /> Annuler le point</button>}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Ruler size={15} /> Mesures</div>
          {lines.length === 0 && <p className="text-xs text-slate-500">Aucune mesure tracée.</p>}
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm">
              <select className="input w-32 py-1" value={l.label} onChange={e => setLines(ls => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}>{LABELS.map(x => <option key={x}>{x}</option>)}</select>
              <b className="flex-1">{valueOf(l)} {unit}</b>
              <button className="btn-ghost p-1 text-rose-600" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="btn-primary mt-2 w-full justify-center" disabled={!lines.length} onClick={() => { onApply(lines.map(l => ({ label: l.label, value: valueOf(l) }))); onClose() }}><Check size={15} /> Appliquer à la pièce</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Précision : ± 5 à 10 % si la référence et la mesure sont sur le même plan et filmées bien de face. Pour une mesure au centimètre, utilisez la mesure AR (Android) ou un télémètre laser.</p>
    </Shell>
  )
}

function LineView({ l, color, w, text }: { l: Line; color: string; w: number; text: string }) {
  const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2
  return (
    <g>
      <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={color} strokeWidth={w * 1.5} strokeLinecap="round" />
      {[l.a, l.b].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={w * 2.5} fill={color} stroke="#fff" strokeWidth={w / 2} />)}
      <text x={mx} y={my - w * 4} fill="#fff" stroke="#000" strokeWidth={w / 1.5} paintOrder="stroke" fontSize={w * 9} fontWeight={700} textAnchor="middle">{text}</text>
    </g>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 p-2 sm:p-6">
      <div className="card mx-auto max-w-4xl p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">📏 {title}</h2><button className="btn-ghost p-1" onClick={onClose}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  )
}
