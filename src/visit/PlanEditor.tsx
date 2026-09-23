import { useRef, useState } from 'react'
import { Copy, Download, ImagePlus, LayoutGrid, Plus, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import type { FloorPlan, MediaRef, PlanShape, VisitRoom } from '../lib/types'
import { useMediaUrl } from '../lib/media'
import { download, uid } from '../lib/utils'

// Éditeur de plan 2D : pièces à l'échelle (générées depuis les mesures de la visite), portes, fenêtres,
// escaliers, glisser-déposer, redimensionnement, image de plan existant en arrière-plan.
const KIND_STYLE: Record<PlanShape['kind'], { fill: string; stroke: string }> = {
  piece: { fill: '#ede9fe', stroke: '#6d28d9' }, porte: { fill: '#fef3c7', stroke: '#b45309' },
  fenetre: { fill: '#e0f2fe', stroke: '#0369a1' }, escalier: { fill: '#f1f5f9', stroke: '#475569' },
}
const snap = (v: number) => Math.round(v * 2) / 2

export function autoLayout(rooms: VisitRoom[], level: string): PlanShape[] {
  const list = rooms.filter(r => (r.level || 'RDC') === level && r.length > 0 && r.width > 0)
  const total = list.reduce((s, r) => s + r.length * r.width, 0)
  const rowMax = Math.max(12, Math.sqrt(total) * 1.4)
  let x = 0, y = 0, rowH = 0
  return list.map(r => {
    const w = Math.max(r.length, r.width), h = Math.min(r.length, r.width)
    if (x > 0 && x + w > rowMax) { x = 0; y += rowH; rowH = 0 }
    const s: PlanShape = { id: uid(), roomId: r.id, label: r.name, x, y, w, h, kind: 'piece' }
    x += w; rowH = Math.max(rowH, h)
    return s
  })
}

export default function PlanEditor({ plan, rooms, unit, onChange, onImage }: {
  plan: FloorPlan; rooms: VisitRoom[]; unit: 'pi' | 'm'
  onChange: (p: FloorPlan) => void; onImage: (file: File) => Promise<MediaRef | null>
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(unit === 'm' ? 60 : 18)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; orig: PlanShape } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const bg = useMediaUrl(plan.image)
  const shapes = plan.shapes
  const selected = shapes.find(s => s.id === sel)
  const set = (s: PlanShape[]) => onChange({ ...plan, shapes: s })
  const upd = (id: string, p: Partial<PlanShape>) => set(shapes.map(s => (s.id === id ? { ...s, ...p } : s)))

  const maxX = Math.max(30, ...shapes.map(s => s.x + s.w)) + 6
  const maxY = Math.max(20, ...shapes.map(s => s.y + s.h)) + 6
  const toUnits = (e: React.PointerEvent) => {
    const p = svg.current!.createSVGPoint(); p.x = e.clientX; p.y = e.clientY
    const r = p.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }
  const down = (e: React.PointerEvent, s: PlanShape, mode: 'move' | 'resize') => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setSel(s.id)
    drag.current = { id: s.id, mode, start: toUnits(e), orig: s }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toUnits(e)
    const dx = p.x - d.start.x, dy = p.y - d.start.y
    if (d.mode === 'move') upd(d.id, { x: Math.max(0, snap(d.orig.x + dx)), y: Math.max(0, snap(d.orig.y + dy)) })
    else upd(d.id, { w: Math.max(0.5, snap(d.orig.w + dx)), h: Math.max(0.5, snap(d.orig.h + dy)) })
  }
  const add = (kind: PlanShape['kind']) => {
    const dims = kind === 'piece' ? [10, 10] : kind === 'porte' ? [unit === 'm' ? 0.9 : 3, 0.5] : kind === 'fenetre' ? [unit === 'm' ? 1.2 : 4, 0.4] : [unit === 'm' ? 1 : 3.5, unit === 'm' ? 3 : 10]
    const s: PlanShape = { id: uid(), roomId: '', label: kind === 'piece' ? 'Pièce' : kind === 'porte' ? 'Porte' : kind === 'fenetre' ? 'Fenêtre' : 'Escalier', x: 1, y: 1, w: dims[0], h: dims[1], kind }
    set([...shapes, s]); setSel(s.id)
  }
  const area = shapes.filter(s => s.kind === 'piece').reduce((t, s) => t + s.w * s.h, 0)

  const exportSvg = () => {
    const el = svg.current
    if (!el) return
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.querySelectorAll('[data-handle],image').forEach(n => n.remove())
    download(`plan-${plan.level}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml')
  }
  const exportPng = () => {
    const el = svg.current
    if (!el) return
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.querySelectorAll('[data-handle],image').forEach(n => n.remove())
    const w = maxX * zoom, h = maxY * zoom
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `plan-${plan.level}.png`; a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button className="btn-outline py-1.5 text-xs" onClick={() => { const s = autoLayout(rooms, plan.level); if (!s.length) alert(`Aucune pièce mesurée au niveau « ${plan.level} ». Entrez longueur et largeur dans l’onglet Pièces.`); else if (!shapes.length || confirm('Remplacer le plan actuel par la disposition automatique des pièces mesurées?')) set(s) }}><LayoutGrid size={14} /> Générer depuis les pièces</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => add('piece')}><Plus size={14} /> Pièce</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => add('porte')}>🚪 Porte</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => add('fenetre')}>🪟 Fenêtre</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => add('escalier')}>🪜 Escalier</button>
          <label className="btn-outline cursor-pointer py-1.5 text-xs"><ImagePlus size={14} /> Insérer un plan (image)
            <input type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const ref = await onImage(f); if (ref) onChange({ ...plan, image: ref }) } }} />
          </label>
          <span className="ml-auto flex gap-1">
            <button className="btn-ghost p-1.5" onClick={() => setZoom(z => z * 1.25)}><ZoomIn size={16} /></button>
            <button className="btn-ghost p-1.5" onClick={() => setZoom(z => z / 1.25)}><ZoomOut size={16} /></button>
          </span>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: '65vh', touchAction: 'none' }}>
          <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={maxX * zoom} height={maxY * zoom} viewBox={`0 0 ${maxX} ${maxY}`} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerDown={() => setSel(null)} fontFamily="system-ui, sans-serif">
            <defs>
              <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth={0.03} /></pattern>
              <pattern id="grid5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5e1" strokeWidth={0.06} /></pattern>
            </defs>
            <rect width={maxX} height={maxY} fill="url(#grid)" /><rect width={maxX} height={maxY} fill="url(#grid5)" />
            {bg && <image href={bg} x={0} y={0} width={maxX * plan.imageScale} opacity={plan.imageOpacity} preserveAspectRatio="xMinYMin meet" />}
            {shapes.map(s => {
              const st = KIND_STYLE[s.kind]
              const on = s.id === sel
              const fs = Math.min(1.1, Math.max(0.35, Math.min(s.w, s.h) / 5))
              return (
                <g key={s.id} onPointerDown={e => down(e, s, 'move')} style={{ cursor: 'move' }}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={st.fill} fillOpacity={0.85} stroke={on ? '#f43f5e' : st.stroke} strokeWidth={s.kind === 'piece' ? 0.18 : 0.1} />
                  {s.kind === 'piece' && s.w > 2 && <>
                    <text x={s.x + s.w / 2} y={s.y + s.h / 2 - fs * 0.2} fontSize={fs} fontWeight={700} textAnchor="middle" fill="#1e1b4b">{s.label}</text>
                    <text x={s.x + s.w / 2} y={s.y + s.h / 2 + fs * 1} fontSize={fs * 0.75} textAnchor="middle" fill="#475569">{s.w} × {s.h} {unit} · {Math.round(s.w * s.h)} {unit}²</text>
                  </>}
                  {s.kind === 'escalier' && Array.from({ length: Math.floor(s.h) }).map((_, i) => <line key={i} x1={s.x} x2={s.x + s.w} y1={s.y + i + 1} y2={s.y + i + 1} stroke={st.stroke} strokeWidth={0.05} />)}
                  {on && <rect data-handle x={s.x + s.w - 0.4} y={s.y + s.h - 0.4} width={0.8} height={0.8} fill="#f43f5e" style={{ cursor: 'nwse-resize' }} onPointerDown={e => down(e, s, 'resize')} />}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>Grille : 1 carreau = 1 {unit} · glissez pour déplacer, poignée rouge pour redimensionner.</span>
          <span className="font-semibold text-slate-700">Superficie des pièces : {Math.round(area)} {unit}²</span>
        </div>
      </div>

      <div className="space-y-3">
        {selected ? (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-2 font-semibold">Élément sélectionné</div>
            <label className="label">Nom</label>
            <input className="input" value={selected.label} onChange={e => upd(selected.id, { label: e.target.value })} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><label className="label">Largeur ({unit})</label><input className="input" type="number" step="0.5" value={selected.w} onChange={e => upd(selected.id, { w: Math.max(0.5, +e.target.value) })} /></div>
              <div><label className="label">Profondeur ({unit})</label><input className="input" type="number" step="0.5" value={selected.h} onChange={e => upd(selected.id, { h: Math.max(0.5, +e.target.value) })} /></div>
            </div>
            {selected.kind === 'piece' && (
              <select className="input mt-2" value={selected.roomId} onChange={e => { const r = rooms.find(x => x.id === e.target.value); upd(selected.id, r ? { roomId: r.id, label: r.name, w: Math.max(r.length, r.width) || selected.w, h: Math.min(r.length, r.width) || selected.h } : { roomId: '' }) }}>
                <option value="">— Lier à une pièce mesurée —</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.length} × {r.width})</option>)}
              </select>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              <button className="btn-outline py-1 text-xs" onClick={() => upd(selected.id, { w: selected.h, h: selected.w })}><RotateCw size={13} /> Pivoter</button>
              <button className="btn-outline py-1 text-xs" onClick={() => { const c = { ...selected, id: uid(), x: selected.x + 1, y: selected.y + 1 }; set([...shapes, c]); setSel(c.id) }}><Copy size={13} /> Dupliquer</button>
              <button className="btn-ghost py-1 text-xs text-rose-600" onClick={() => { set(shapes.filter(s => s.id !== selected.id)); setSel(null) }}><Trash2 size={13} /> Supprimer</button>
            </div>
          </div>
        ) : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Touchez un élément du plan pour le modifier.</p>}

        {plan.image && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 font-semibold">Plan importé (arrière-plan)</div>
            <label className="label">Opacité</label>
            <input type="range" min={0.1} max={1} step={0.05} value={plan.imageOpacity} onChange={e => onChange({ ...plan, imageOpacity: +e.target.value })} className="w-full" />
            <label className="label">Échelle de l’image</label>
            <input type="range" min={0.2} max={3} step={0.05} value={plan.imageScale} onChange={e => onChange({ ...plan, imageScale: +e.target.value })} className="w-full" />
            <p className="text-xs text-slate-500">Ajustez l’échelle pour aligner le plan importé sur la grille, puis tracez les pièces par-dessus.</p>
            <button className="btn-ghost mt-1 text-xs text-rose-600" onClick={() => onChange({ ...plan, image: undefined })}>Retirer l’image</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-xs" onClick={exportPng}><Download size={14} /> PNG</button>
          <button className="btn-outline text-xs" onClick={exportSvg}><Download size={14} /> SVG</button>
        </div>
      </div>
    </div>
  )
}

/** Rendu statique d'un plan (rapport imprimable). */
export function PlanPreview({ plan, unit }: { plan: FloorPlan; unit: 'pi' | 'm' }) {
  const maxX = Math.max(10, ...plan.shapes.map(s => s.x + s.w)) + 1
  const maxY = Math.max(6, ...plan.shapes.map(s => s.y + s.h)) + 1
  return (
    <svg viewBox={`-0.5 -0.5 ${maxX} ${maxY}`} className="w-full" style={{ maxHeight: 420 }} fontFamily="system-ui, sans-serif">
      {plan.shapes.map(s => {
        const st = KIND_STYLE[s.kind]
        const fs = Math.min(1, Math.max(0.3, Math.min(s.w, s.h) / 5))
        return (
          <g key={s.id}>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={st.fill} stroke={st.stroke} strokeWidth={s.kind === 'piece' ? 0.15 : 0.08} />
            {s.kind === 'piece' && <><text x={s.x + s.w / 2} y={s.y + s.h / 2} fontSize={fs} fontWeight={700} textAnchor="middle">{s.label}</text>
              <text x={s.x + s.w / 2} y={s.y + s.h / 2 + fs * 1.1} fontSize={fs * 0.7} textAnchor="middle" fill="#475569">{s.w} × {s.h} {unit}</text></>}
          </g>
        )
      })}
    </svg>
  )
}
