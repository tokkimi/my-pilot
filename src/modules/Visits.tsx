import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines, Camera, CheckCircle2, ChevronLeft, Clapperboard, FileText, Image as ImageIcon, Mail, MapPin, Mic, Play, Plus, Printer,
  Ruler, ScanLine, Sparkles, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { FloorPlan, MediaRef, Measure, Visit, VisitRoom, VisitType, Visitor } from '../lib/types'
import { newContact, newShowing, newTask } from '../lib/seed'
import { SOP_SELLER } from '../lib/content'
import { Avatar, Empty, Field, ListingSelect, MemberSelect, Modal, MultiContact, PageHeader, ScopeFilter, Stat } from '../lib/ui'
import { daysUntil, fmtDate, fullName, isoDateTime, uid } from '../lib/utils'
import { deleteMedia, saveMedia, useMediaUrl } from '../lib/media'
import VoiceRecorder, { type VoiceResult } from '../visit/VoiceRecorder'
import VideoRecorder from '../visit/Camera'
import MeasureTool, { type MeasureOut } from '../visit/Measure'
import ArMeasure, { arSupported } from '../visit/ArMeasure'
import PlanEditor, { PlanPreview } from '../visit/PlanEditor'
import { analyzeDictation, type Analysis } from '../visit/analyze'

export const VISIT_TYPES: Record<VisitType, { label: string; icon: string; desc: string }> = {
  evaluation: { label: 'Évaluation / prise d’inscription', icon: '🏡', desc: 'RDV vendeur : questions de découverte du SOP, relevé des pièces, plan.' },
  acheteur: { label: 'Visite avec acheteur', icon: '🔑', desc: 'Impressions par pièce, coups de cœur, points négatifs, intérêt.' },
  libre: { label: 'Visite libre', icon: '🪧', desc: 'Registre des visiteurs, ajout automatique aux prospects.' },
  photo: { label: 'Relevé de mesures / séance photo', icon: '📐', desc: 'Vidéo et mesures de chaque pièce, plan de la propriété.' },
  inspection: { label: 'Inspection / vérification', icon: '🔍', desc: 'Observations, points à surveiller, photos à l’appui.' },
}
const LEVELS = ['RDC', '2e étage', '3e étage', 'Sous-sol', 'Extérieur']
const QUICK_ROOMS: [string, string][] = [['Hall d’entrée', 'RDC'], ['Salon', 'RDC'], ['Cuisine', 'RDC'], ['Salle à manger', 'RDC'], ['Salle de bain', 'RDC'], ['Salle d’eau', 'RDC'], ['Chambre principale', '2e étage'], ['Chambre 2', '2e étage'], ['Chambre 3', '2e étage'], ['Salle de bain', '2e étage'], ['Bureau', 'RDC'], ['Salle familiale', 'Sous-sol'], ['Salle de lavage', 'Sous-sol'], ['Rangement', 'Sous-sol'], ['Garage', 'Extérieur'], ['Terrasse', 'Extérieur']]
const FLOORS = ['Bois franc', 'Céramique', 'Flottant', 'Vinyle', 'Parqueterie', 'Béton', 'Tapis', 'Époxy', 'Autre']
const CONDITION: Record<string, string> = { excellent: 'Excellent', bon: 'Bon', moyen: 'Moyen', a_renover: 'À rénover' }
const QUESTIONS: Partial<Record<VisitType, string[]>> = {
  evaluation: [...(SOP_SELLER.sections.find(s => s.id === 's3')?.quotes ?? []), 'Quel est votre échéancier idéal?', 'Avez-vous un prix en tête? Sur quoi est-il basé?', 'Vente avec rachat, succession ou indivision?', 'Travaux réalisés (année, factures)?', 'Inclusions et exclusions?', 'Certificat de localisation : année?'],
  acheteur: ['Premier coup de cœur?', 'Ce qui ne convient pas?', 'Le prix vous semble-t-il juste?', 'Prochaine étape souhaitée (2e visite, offre)?'],
  inspection: ['Toiture', 'Fondation / sous-sol', 'Fenêtres / portes', 'Électricité', 'Plomberie / chauffe-eau', 'Chauffage / climatisation', 'Humidité / infiltrations'],
}

export function createVisit(agentId: string, p: Partial<Visit> = {}): Visit {
  return {
    id: uid(), type: 'evaluation', title: '', address: '', listingId: '', contactIds: [], agentId, date: isoDateTime(new Date()), startedAt: '', endedAt: '',
    status: 'planifiee', rooms: [], voiceNotes: [], notes: '', plans: [], answers: {}, visitors: [], rating: 0, interest: '', summary: '', photos: [], createdAt: new Date().toISOString(), ...p,
  }
}
/** Complète une visite partielle (données anciennes ou incomplètes) avec les valeurs par défaut. */
export function normalizeVisit(v: Visit): Visit {
  const base = createVisit(v.agentId ?? '')
  return { ...base, ...v, rooms: (v.rooms ?? []).map(r => ({ ...newRoom(r.name ?? 'Pièce'), ...r, media: r.media ?? [], measures: r.measures ?? [] })), voiceNotes: v.voiceNotes ?? [], plans: v.plans ?? [], answers: v.answers ?? {}, visitors: v.visitors ?? [], photos: v.photos ?? [] }
}
const newRoom = (name: string, level = 'RDC', unit: 'pi' | 'm' = 'pi'): VisitRoom => ({ id: uid(), name, level, length: 0, width: 0, height: 0, unit, floor: '', condition: '', notes: '', likes: '', dislikes: '', media: [], measures: [] })
const area = (r: VisitRoom) => Math.round(r.length * r.width * 10) / 10
const mediaCount = (v: Visit) => v.rooms.reduce((s, r) => s + r.media.length, 0) + v.photos.length + v.voiceNotes.length

// ---------------------------------------------------------------- Liste
export default function Visits({ openId, go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [open, setOpen] = useState<string | null>(openId ?? null)
  const [starting, setStarting] = useState(false)
  const [status, setStatus] = useState<'' | Visit['status']>('')
  const normalized = useMemo(() => (db.visits ?? []).map(normalizeVisit), [db.visits])
  const visits = normalized.filter(v => mine(v.agentId)).filter(v => !status || v.status === status).sort((a, b) => b.date.localeCompare(a.date))
  const all = normalized.filter(v => mine(v.agentId))
  useEffect(() => { if (openId) setOpen(openId) }, [openId])
  const current = normalized.find(v => v.id === open)

  if (current) return <VisitSession visit={current} onClose={() => { setOpen(null); if (openId) go('visits') }} go={go} />

  return (
    <div>
      <PageHeader title="Visites terrain" subtitle="Démarrez une visite : notes, dictée vocale transcrite, vidéo et mesures de chaque pièce, plan de la propriété"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value as Visit['status'])}><option value="">Toutes</option><option value="planifiee">Planifiées</option><option value="en_cours">En cours</option><option value="terminee">Terminées</option></select>
          <button className="btn-primary" onClick={() => setStarting(true)}><Play size={16} /> Démarrer une visite</button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visites" value={all.length} sub={`${all.filter(v => v.status === 'en_cours').length} en cours`} icon={<ScanLine size={20} />} />
        <Stat label="Pièces relevées" value={all.reduce((s, v) => s + v.rooms.length, 0)} sub={`${all.reduce((s, v) => s + v.rooms.filter(r => r.length && r.width).length, 0)} mesurées`} icon={<Ruler size={20} />} tone="sky" />
        <Stat label="Médias" value={all.reduce((s, v) => s + mediaCount(v), 0)} sub="vidéos, photos, notes vocales" icon={<Clapperboard size={20} />} tone="amber" />
        <Stat label="Plans créés" value={all.reduce((s, v) => s + v.plans.filter(p => p.shapes.length || p.image).length, 0)} icon={<MapPin size={20} />} tone="green" />
      </div>
      {visits.length === 0 ? <Empty>Aucune visite. Cliquez sur « Démarrer une visite ».</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visits.map(v => (
            <button key={v.id} onClick={() => setOpen(v.id)} className="card p-4 text-left hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{VISIT_TYPES[v.type].icon} {VISIT_TYPES[v.type].label}</div>
                  <div className="truncate font-semibold">{v.title || v.address || 'Visite sans titre'}</div>
                  <div className="text-xs text-slate-500">{fmtDate(v.date, true)}</div>
                </div>
                <Avatar memberId={v.agentId} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className={`badge ${v.status === 'terminee' ? 'bg-emerald-100 text-emerald-700' : v.status === 'en_cours' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100'}`}>{v.status === 'terminee' ? 'Terminée' : v.status === 'en_cours' ? '● En cours' : 'Planifiée'}</span>
                <span className="badge bg-slate-100">{v.rooms.length} pièce(s)</span>
                <span className="badge bg-slate-100">{mediaCount(v)} média(s)</span>
                {v.visitors.length > 0 && <span className="badge bg-slate-100">{v.visitors.length} visiteur(s)</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {starting && <StartVisit onClose={() => setStarting(false)} onStart={v => { upsert('visits', v); setStarting(false); setOpen(v.id) }} agentId={me.id} />}
    </div>
  )
}

export function StartVisit({ onClose, onStart, agentId, preset = {} }: { onClose: () => void; onStart: (v: Visit) => void; agentId: string; preset?: Partial<Visit> }) {
  const { db } = useStore()
  const [v, setV] = useState<Visit>(() => createVisit(agentId, preset))
  const listing = db.listings.find(l => l.id === v.listingId)
  const go = (now: boolean) => {
    const title = v.title || (listing ? listing.address : v.address) || VISIT_TYPES[v.type].label
    onStart({ ...v, title, address: v.address || (listing ? `${listing.address}, ${listing.city}` : ''), status: now ? 'en_cours' : 'planifiee', startedAt: now ? new Date().toISOString() : '' })
  }
  return (
    <Modal title="Démarrer une visite" onClose={onClose} footer={<><button className="btn-ghost" onClick={() => go(false)}>Planifier</button><button className="btn-primary" onClick={() => go(true)}><Play size={15} /> Démarrer maintenant</button></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(VISIT_TYPES) as VisitType[]).map(t => (
          <button key={t} onClick={() => setV({ ...v, type: t })} className={`rounded-xl border p-3 text-left ${v.type === t ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-300'}`}>
            <div className="font-semibold">{VISIT_TYPES[t].icon} {VISIT_TYPES[t].label}</div>
            <div className="text-xs text-slate-500">{VISIT_TYPES[t].desc}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Inscription (facultatif)"><ListingSelect value={v.listingId} onChange={id => setV({ ...v, listingId: id })} /></Field>
        <Field label="Adresse"><input className="input" value={v.address} placeholder={listing ? `${listing.address}, ${listing.city}` : 'Adresse de la propriété'} onChange={e => setV({ ...v, address: e.target.value })} /></Field>
        <Field label="Client(s)" className="sm:col-span-2"><MultiContact value={v.contactIds} onChange={ids => setV({ ...v, contactIds: ids })} /></Field>
        <Field label="Date et heure"><input className="input" type="datetime-local" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Courtier"><MemberSelect value={v.agentId} onChange={id => setV({ ...v, agentId: id })} /></Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Session de visite
type Tab = 'infos' | 'pieces' | 'notes' | 'visiteurs' | 'plan' | 'resume'

function VisitSession({ visit: v, onClose, go }: { visit: Visit; onClose: () => void; go: PageProps['go'] }) {
  const { db, me, mode, upsert, remove } = useStore()
  const remote = mode === 'remote'
  const [tab, setTab] = useState<Tab>(v.rooms.length ? 'pieces' : 'infos')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [openRoom, setOpenRoom] = useState<string | null>(v.rooms[0]?.id ?? null)
  const [camera, setCamera] = useState<string | null>(null)
  const [measure, setMeasure] = useState<{ roomId: string; src: string; isVideo: boolean } | null>(null)
  const [ar, setAr] = useState<string | null>(null)
  const [hasAr, setHasAr] = useState(false)
  const [viewer, setViewer] = useState<MediaRef | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [unit, setUnit] = useState<'pi' | 'm'>(v.rooms[0]?.unit ?? 'pi')
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => { void arSupported().then(setHasAr) }, [])
  useEffect(() => {
    if (v.status !== 'en_cours' || !v.startedAt) return
    const t = () => setElapsed(Math.floor((Date.now() - new Date(v.startedAt).getTime()) / 1000))
    t(); const i = window.setInterval(t, 1000)
    return () => window.clearInterval(i)
  }, [v.status, v.startedAt])

  const save = (p: Partial<Visit>) => upsert('visits', { ...v, ...p })
  const setRoom = (id: string, p: Partial<VisitRoom>) => save({ rooms: v.rooms.map(r => (r.id === id ? { ...r, ...p } : r)) })
  const listing = db.listings.find(l => l.id === v.listingId)

  const store = async (blob: Blob, kind: MediaRef['kind'], name: string) => {
    setErr(''); setBusy(`Enregistrement du fichier (${(blob.size / 1048576).toFixed(1)} Mo)…`)
    try { return await saveMedia(blob, kind, name, remote, p => setBusy(`Envoi… ${Math.round(p * 100)} %`)) }
    catch (e) { setErr((e as Error).message); return null } finally { setBusy('') }
  }
  const addRoomMedia = async (roomId: string, blob: Blob, kind: MediaRef['kind'], name: string) => {
    const ref = await store(blob, kind, name)
    if (!ref) return
    upsert('visits', { ...v, rooms: v.rooms.map(r => (r.id === roomId ? { ...r, media: [...r.media, ref] } : r)) })
  }
  const applyMeasures = (roomId: string, out: MeasureOut[], method: Measure['method']) => {
    const room = v.rooms.find(r => r.id === roomId)!
    const p: Partial<VisitRoom> = { measures: [...room.measures, ...out.map(o => ({ id: uid(), label: o.label, value: o.value, unit: room.unit, method, note: '' }))] }
    for (const o of out) {
      if (o.label === 'Longueur') p.length = o.value
      if (o.label === 'Largeur') p.width = o.value
      if (o.label === 'Hauteur') p.height = o.value
    }
    setRoom(roomId, p)
  }
  const addVoice = async (r: VoiceResult, roomId = '') => {
    const audio = r.blob ? await store(r.blob, 'audio', `note-${new Date().toISOString().slice(11, 19)}.webm`) : null
    const note = { id: uid(), transcript: r.transcript, audio: audio ?? undefined, duration: r.duration, createdAt: new Date().toISOString(), roomId }
    let rooms = v.rooms
    if (roomId && r.transcript) {
      // dimensions dictées pour cette pièce : « 12 par 14 », « hauteur 8 pieds »
      const found = analyzeDictation(`${v.rooms.find(x => x.id === roomId)?.name ?? ''} ${r.transcript}`).rooms[0]
      if (found) rooms = rooms.map(x => (x.id === roomId ? { ...x, length: found.length, width: found.width, height: found.height || x.height, measures: [...x.measures, { id: uid(), label: 'Dictée', value: found.length * found.width, unit: x.unit, method: 'vocal' as const, note: found.source }] } : x))
    }
    upsert('visits', { ...v, rooms, voiceNotes: [...v.voiceNotes, note] })
  }
  const finish = () => { save({ status: 'terminee', endedAt: new Date().toISOString() }); setTab('resume') }
  const mmss = (s: number) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ' h ' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const tabs: [Tab, string][] = [['infos', 'Infos'], ['pieces', `Pièces (${v.rooms.length})`], ['notes', `Notes (${v.voiceNotes.length})`], ...(v.type === 'libre' ? [['visiteurs', `Visiteurs (${v.visitors.length})`] as [Tab, string]] : []), ['plan', 'Plan'], ['resume', 'Résumé']]

  return (
    <div className="-m-4 min-h-screen bg-slate-50 sm:-m-6">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur no-print">
        <div className="flex items-center gap-2 px-3 py-2">
          <button className="btn-ghost p-1.5" onClick={onClose}><ChevronLeft size={20} /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{v.title || 'Visite'}</div>
            <div className="truncate text-xs text-slate-500">{VISIT_TYPES[v.type].icon} {VISIT_TYPES[v.type].label} · {v.address || fmtDate(v.date, true)}</div>
          </div>
          {v.status === 'en_cours' && <span className="badge bg-rose-100 text-rose-700">● {mmss(elapsed)}</span>}
          {v.status === 'planifiee' && <button className="btn-primary py-1.5" onClick={() => save({ status: 'en_cours', startedAt: new Date().toISOString() })}><Play size={14} /> Démarrer</button>}
          {v.status === 'en_cours' && <button className="btn bg-emerald-600 py-1.5 text-white hover:bg-emerald-700" onClick={finish}><CheckCircle2 size={14} /> Terminer</button>}
        </div>
        <div className="flex gap-1 overflow-x-auto px-2">
          {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>{l}</button>)}
        </div>
      </div>
      {(busy || err) && <div className={`sticky top-[92px] z-20 px-4 py-2 text-sm ${err ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white'}`}>{err || busy}{err && <button className="ml-2 underline" onClick={() => setErr('')}>OK</button>}</div>}

      <div className="mx-auto max-w-5xl p-3 sm:p-5">
        {tab === 'infos' && (
          <div className="card grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Type de visite"><select className="input" value={v.type} onChange={e => save({ type: e.target.value as VisitType })}>{(Object.keys(VISIT_TYPES) as VisitType[]).map(t => <option key={t} value={t}>{VISIT_TYPES[t].label}</option>)}</select></Field>
            <Field label="Titre"><input className="input" value={v.title} onChange={e => save({ title: e.target.value })} /></Field>
            <Field label="Inscription liée"><ListingSelect value={v.listingId} onChange={id => save({ listingId: id })} /></Field>
            <Field label="Adresse"><input className="input" value={v.address} onChange={e => save({ address: e.target.value })} /></Field>
            <Field label="Client(s)" className="sm:col-span-2"><MultiContact value={v.contactIds} onChange={ids => save({ contactIds: ids })} /></Field>
            <Field label="Date"><input className="input" type="datetime-local" value={v.date} onChange={e => save({ date: e.target.value })} /></Field>
            <Field label="Courtier"><MemberSelect value={v.agentId} onChange={id => save({ agentId: id })} /></Field>
            <Field label="Unité de mesure"><select className="input" value={unit} onChange={e => { const u = e.target.value as 'pi' | 'm'; setUnit(u); save({ rooms: v.rooms.map(r => ({ ...r, unit: u })) }) }}><option value="pi">Pieds (pi)</option><option value="m">Mètres (m)</option></select></Field>
            {v.address && <a className="btn-outline self-end" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/${encodeURIComponent(v.address)}`}><MapPin size={15} /> Itinéraire / Street View</a>}
            {(QUESTIONS[v.type] ?? []).length > 0 && (
              <div className="sm:col-span-2">
                <div className="mb-2 mt-2 text-sm font-semibold">{v.type === 'evaluation' ? 'Questions de découverte (SOP)' : v.type === 'inspection' ? 'Points d’inspection' : 'Questions à l’acheteur'}</div>
                <div className="grid gap-2">
                  {QUESTIONS[v.type]!.map(q => (
                    <label key={q} className="block text-sm"><span className="text-slate-600">{q}</span>
                      <textarea className="input mt-1 min-h-12" value={v.answers[q] ?? ''} onChange={e => save({ answers: { ...v.answers, [q]: e.target.value } })} />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {v.type === 'acheteur' && <>
              <Field label="Appréciation globale"><input type="range" min={0} max={5} value={v.rating} onChange={e => save({ rating: +e.target.value })} className="w-full" /><div className="text-amber-500">{'★'.repeat(v.rating)}{'☆'.repeat(5 - v.rating)}</div></Field>
              <Field label="Intérêt"><select className="input" value={v.interest} onChange={e => save({ interest: e.target.value as Visit['interest'] })}><option value="">—</option><option value="faible">Faible</option><option value="moyen">Moyen</option><option value="fort">Fort</option></select></Field>
            </>}
          </div>
        )}

        {tab === 'pieces' && (
          <div className="space-y-3">
            <div className="card p-3">
              <div className="mb-2 text-sm font-semibold">Ajouter une pièce</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ROOMS.map(([n, l], i) => <button key={i} className="badge border border-slate-200 bg-white px-2.5 py-1 hover:border-brand-400" onClick={() => { const r = newRoom(n, l, unit); save({ rooms: [...v.rooms, r] }); setOpenRoom(r.id) }}>+ {n} <span className="ml-1 text-slate-400">{l}</span></button>)}
                <button className="badge border border-dashed border-brand-400 px-2.5 py-1 text-brand-700" onClick={() => { const n = prompt('Nom de la pièce'); if (n) { const r = newRoom(n, 'RDC', unit); save({ rooms: [...v.rooms, r] }); setOpenRoom(r.id) } }}>+ Autre…</button>
              </div>
              {hasAr && <p className="mt-2 text-xs text-emerald-700">✓ Cet appareil prend en charge la mesure en réalité augmentée.</p>}
            </div>
            {v.rooms.length === 0 && <Empty>Ajoutez les pièces au fil de la visite.</Empty>}
            {v.rooms.map(r => (
              <RoomCard key={r.id} room={r} open={openRoom === r.id} onToggle={() => setOpenRoom(openRoom === r.id ? null : r.id)} hasAr={hasAr}
                voiceNotes={v.voiceNotes.filter(n => n.roomId === r.id)}
                onChange={p => setRoom(r.id, p)}
                onDelete={() => { if (confirm(`Supprimer « ${r.name} » et ses médias?`)) { r.media.forEach(m => void deleteMedia(m)); save({ rooms: v.rooms.filter(x => x.id !== r.id) }) } }}
                onFilm={() => setCamera(r.id)}
                onPhoto={f => addRoomMedia(r.id, f, 'photo', f.name)}
                onMeasureMedia={async m => { const url = m.path ? '/api/media?p=' + encodeURIComponent(m.path) : m.local ? URL.createObjectURL((await import('../lib/media').then(x => x.mediaBlob(m)))!) : ''; setMeasure({ roomId: r.id, src: url, isVideo: m.kind === 'video' }) }}
                onMeasurePhoto={f => setMeasure({ roomId: r.id, src: URL.createObjectURL(f), isVideo: false })}
                onAr={() => setAr(r.id)}
                onView={setViewer}
                onRemoveMedia={m => { void deleteMedia(m); setRoom(r.id, { media: r.media.filter(x => x.id !== m.id) }) }}
                onVoice={res => addVoice(res, r.id)} />
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-4">
            <VoiceRecorder label="Dicter une note générale" onSave={r => addVoice(r)} />
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">Notes vocales transcrites</div>
                <button className="btn-outline py-1.5 text-xs" onClick={() => setAnalysis(analyzeDictation([v.notes, ...v.voiceNotes.map(n => `${v.rooms.find(r => r.id === n.roomId)?.name ?? ''} ${n.transcript}`)].join('. ')))}><Sparkles size={14} /> Analyser les dictées</button>
              </div>
              {v.voiceNotes.length === 0 ? <Empty>Aucune note vocale.</Empty> : (
                <ul className="space-y-2">
                  {v.voiceNotes.map(n => (
                    <li key={n.id} className="rounded-lg border border-slate-200 p-2">
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><AudioLines size={13} /> {new Date(n.createdAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} · {n.roomId ? v.rooms.find(r => r.id === n.roomId)?.name : 'Général'} · {n.duration}s
                        <button className="ml-auto text-rose-600" onClick={() => { if (n.audio) void deleteMedia(n.audio); save({ voiceNotes: v.voiceNotes.filter(x => x.id !== n.id) }) }}><Trash2 size={13} /></button></div>
                      <textarea className="input min-h-14 text-sm" value={n.transcript} onChange={e => save({ voiceNotes: v.voiceNotes.map(x => (x.id === n.id ? { ...x, transcript: e.target.value } : x)) })} />
                      {n.audio && <AudioPlayer media={n.audio} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {analysis && <AnalysisPanel analysis={analysis} visit={v} onClose={() => setAnalysis(null)} onApplyRooms={rooms => { save({ rooms }); setAnalysis(null); setTab('pieces') }} onSummary={t => save({ summary: [v.summary, t].filter(Boolean).join('\n') })} />}
            <div className="card p-4">
              <Field label="Notes écrites"><textarea className="input min-h-32" value={v.notes} onChange={e => save({ notes: e.target.value })} /></Field>
              <Field label="Résumé pour le client / le dossier" className="mt-3"><textarea className="input min-h-24" value={v.summary} onChange={e => save({ summary: e.target.value })} /></Field>
            </div>
            <div className="card p-4">
              <div className="mb-2 font-semibold">Photos générales</div>
              <label className="btn-outline cursor-pointer"><Camera size={15} /> Prendre / ajouter des photos
                <input type="file" accept="image/*" capture="environment" multiple hidden onChange={async e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; const refs: MediaRef[] = []; for (const f of files) { const r = await store(f, 'photo', f.name); if (r) refs.push(r) } if (refs.length) save({ photos: [...v.photos, ...refs] }) }} />
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">{v.photos.map(p => <Thumb key={p.id} media={p} onClick={() => setViewer(p)} onRemove={() => { void deleteMedia(p); save({ photos: v.photos.filter(x => x.id !== p.id) }) }} />)}</div>
            </div>
          </div>
        )}

        {tab === 'visiteurs' && <VisitorsTab visit={v} save={save} />}

        {tab === 'plan' && <PlanTab visit={v} unit={unit} save={save} store={store} />}

        {tab === 'resume' && <Report visit={v} go={go} onDelete={() => { if (confirm('Supprimer cette visite et tous ses médias?')) { v.rooms.forEach(r => r.media.forEach(m => void deleteMedia(m))); v.voiceNotes.forEach(n => n.audio && void deleteMedia(n.audio)); v.photos.forEach(m => void deleteMedia(m)); remove('visits', v.id); onClose() } }} listingName={listing?.address} me={me.name} />}
      </div>

      {camera && <VideoRecorder title={v.rooms.find(r => r.id === camera)?.name ?? 'Pièce'} onClose={() => setCamera(null)}
        onSave={blob => addRoomMedia(camera, blob, 'video', `video-${v.rooms.find(r => r.id === camera)?.name ?? 'piece'}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`)}
        onFrame={src => { const id = camera; setCamera(null); setMeasure({ roomId: id, src, isVideo: false }) }} />}
      {measure && <MeasureTool src={measure.src} isVideo={measure.isVideo} unit={v.rooms.find(r => r.id === measure.roomId)?.unit ?? unit} onClose={() => setMeasure(null)} onApply={out => applyMeasures(measure.roomId, out, 'reference')} />}
      {ar && <ArMeasure unit={v.rooms.find(r => r.id === ar)?.unit ?? unit} onClose={() => setAr(null)} onApply={out => applyMeasures(ar, out, 'ar')} />}
      {viewer && <MediaViewer media={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

function RoomCard({ room: r, open, onToggle, hasAr, voiceNotes, onChange, onDelete, onFilm, onPhoto, onMeasureMedia, onMeasurePhoto, onAr, onView, onRemoveMedia, onVoice }: {
  room: VisitRoom; open: boolean; onToggle: () => void; hasAr: boolean; voiceNotes: Visit['voiceNotes']
  onChange: (p: Partial<VisitRoom>) => void; onDelete: () => void; onFilm: () => void; onPhoto: (f: File) => void; onMeasureMedia: (m: MediaRef) => void
  onMeasurePhoto: (f: File) => void; onAr: () => void; onView: (m: MediaRef) => void; onRemoveMedia: (m: MediaRef) => void; onVoice: (r: VoiceResult) => void
}) {
  const measured = r.length > 0 && r.width > 0
  const videos = r.media.filter(m => m.kind === 'video')
  return (
    <div className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-3 text-left" onClick={onToggle}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${measured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{measured ? <CheckCircle2 size={18} /> : <Ruler size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{r.name} <span className="text-xs font-normal text-slate-500">· {r.level}</span></div>
          <div className="text-xs text-slate-500">{measured ? `${r.length} × ${r.width}${r.height ? ` × ${r.height}` : ''} ${r.unit} · ${area(r)} ${r.unit}²` : 'Non mesurée'} · {videos.length} vidéo(s) · {r.media.length - videos.length} photo(s) · {voiceNotes.length} note(s)</div>
        </div>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Nom"><input className="input" value={r.name} onChange={e => onChange({ name: e.target.value })} /></Field>
            <Field label="Niveau"><select className="input" value={r.level} onChange={e => onChange({ level: e.target.value })}>{LEVELS.map(l => <option key={l}>{l}</option>)}</select></Field>
            <Field label="Revêtement de plancher"><select className="input" value={r.floor} onChange={e => onChange({ floor: e.target.value })}><option value="">—</option>{FLOORS.map(l => <option key={l}>{l}</option>)}</select></Field>
            <Field label="État"><select className="input" value={r.condition} onChange={e => onChange({ condition: e.target.value as VisitRoom['condition'] })}><option value="">—</option>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label={`Longueur (${r.unit})`}><input className="input" type="number" step="0.1" inputMode="decimal" value={r.length || ''} onChange={e => onChange({ length: +e.target.value })} /></Field>
            <Field label={`Largeur (${r.unit})`}><input className="input" type="number" step="0.1" inputMode="decimal" value={r.width || ''} onChange={e => onChange({ width: +e.target.value })} /></Field>
            <Field label={`Hauteur (${r.unit})`}><input className="input" type="number" step="0.1" inputMode="decimal" value={r.height || ''} onChange={e => onChange({ height: +e.target.value })} /></Field>
            <div className="flex flex-col justify-end rounded-lg bg-brand-50 p-2 text-sm text-brand-700"><span className="text-xs">Surface</span><b>{area(r)} {r.unit}²</b>{r.height > 0 && <span className="text-xs">Volume {Math.round(area(r) * r.height)} {r.unit}³</span>}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button className="btn-primary justify-center py-3" onClick={onFilm}><Clapperboard size={17} /> Filmer la pièce</button>
            <label className="btn-outline cursor-pointer justify-center py-3"><Camera size={17} /> Photo<input type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} /></label>
            {hasAr
              ? <button className="btn bg-emerald-600 justify-center py-3 text-white hover:bg-emerald-700" onClick={onAr}><ScanLine size={17} /> Mesure AR</button>
              : <label className="btn-outline cursor-pointer justify-center py-3"><Ruler size={17} /> Mesurer (photo)<input type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onMeasurePhoto(f) }} /></label>}
            {videos[0]
              ? <button className="btn-outline justify-center py-3" onClick={() => onMeasureMedia(videos[videos.length - 1])}><Ruler size={17} /> Mesurer la vidéo</button>
              : <button className="btn-outline justify-center py-3" disabled title="Filmez d’abord la pièce"><Ruler size={17} /> Mesurer la vidéo</button>}
          </div>

          {r.media.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {r.media.map(m => <Thumb key={m.id} media={m} onClick={() => onView(m)} onRemove={() => onRemoveMedia(m)} onMeasure={() => onMeasureMedia(m)} />)}
            </div>
          )}

          <VoiceRecorder compact label={`Dicter pour « ${r.name} » (ex. « 12 par 14 pieds, plafond 8 pieds, plancher de bois »)`} onSave={onVoice} />
          {voiceNotes.length > 0 && <ul className="space-y-1 text-sm">{voiceNotes.map(n => <li key={n.id} className="flex gap-2 rounded bg-slate-50 p-2"><Mic size={14} className="mt-0.5 shrink-0 text-brand-600" />{n.transcript || '(audio sans transcription)'}</li>)}</ul>}

          {r.measures.length > 0 && (
            <div className="text-xs text-slate-600">
              <b>Historique des mesures :</b> {r.measures.map(m => `${m.label} ${m.value} ${m.unit} (${m.method === 'ar' ? 'AR' : m.method === 'reference' ? 'photo' : m.method === 'vocal' ? 'dictée' : 'manuel'})`).join(' · ')}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Observations"><textarea className="input min-h-16" value={r.notes} onChange={e => onChange({ notes: e.target.value })} /></Field>
            <Field label="Points forts / coups de cœur"><textarea className="input min-h-16" value={r.likes} onChange={e => onChange({ likes: e.target.value })} /></Field>
            <Field label="Points faibles / à surveiller"><textarea className="input min-h-16" value={r.dislikes} onChange={e => onChange({ dislikes: e.target.value })} /></Field>
          </div>
          <button className="btn-ghost text-xs text-rose-600" onClick={onDelete}><Trash2 size={13} /> Supprimer la pièce</button>
        </div>
      )}
    </div>
  )
}

function Thumb({ media, onClick, onRemove, onMeasure }: { media: MediaRef; onClick: () => void; onRemove?: () => void; onMeasure?: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-slate-200">
      <button className="h-full w-full" onClick={onClick}>
        {media.thumb ? <img src={media.thumb} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">{media.kind === 'video' ? '🎥' : media.kind === 'audio' ? '🎙' : '📄'}</span>}
        {media.kind === 'video' && <span className="absolute inset-0 flex items-center justify-center"><Play className="fill-white text-white drop-shadow" /></span>}
      </button>
      <div className="absolute right-1 top-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {onMeasure && media.kind !== 'audio' && <button className="rounded bg-white/90 p-1" title="Mesurer" onClick={onMeasure}><Ruler size={12} /></button>}
        {onRemove && <button className="rounded bg-white/90 p-1 text-rose-600" title="Supprimer" onClick={() => confirm('Supprimer ce média?') && onRemove()}><X size={12} /></button>}
      </div>
    </div>
  )
}

function AudioPlayer({ media }: { media: MediaRef }) {
  const url = useMediaUrl(media)
  return url ? <audio controls preload="none" src={url} className="mt-1 h-9 w-full" /> : null
}

function MediaViewer({ media, onClose }: { media: MediaRef; onClose: () => void }) {
  const url = useMediaUrl(media)
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex justify-end p-3 text-white"><button><X /></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={e => e.stopPropagation()}>
        {!url ? <span className="text-white">Chargement…</span>
          : media.kind === 'video' ? <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
          : media.kind === 'audio' ? <audio src={url} controls autoPlay />
          : media.mime === 'application/pdf' ? <iframe src={url} className="h-full w-full bg-white" title="Document" />
          : <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="p-3 text-center text-xs text-white/70">{media.name} · {(media.size / 1048576).toFixed(1)} Mo · {url && <a href={url} download={media.name} className="underline" onClick={e => e.stopPropagation()}>Télécharger</a>}</div>
    </div>
  )
}

function AnalysisPanel({ analysis, visit, onClose, onApplyRooms, onSummary }: { analysis: Analysis; visit: Visit; onClose: () => void; onApplyRooms: (rooms: VisitRoom[]) => void; onSummary: (t: string) => void }) {
  const unit = visit.rooms[0]?.unit ?? 'pi'
  const apply = () => {
    let rooms = [...visit.rooms]
    for (const p of analysis.rooms) {
      const i = rooms.findIndex(r => r.name.toLowerCase() === p.name.toLowerCase())
      if (i >= 0) rooms[i] = { ...rooms[i], length: p.length, width: p.width, height: p.height || rooms[i].height, unit: p.unit }
      else rooms = [...rooms, { ...newRoom(p.name, /chambre/i.test(p.name) ? '2e étage' : /sous-sol|lavage/i.test(p.name) ? 'Sous-sol' : 'RDC', p.unit), length: p.length, width: p.width, height: p.height }]
    }
    onApplyRooms(rooms)
  }
  return (
    <div className="card border-brand-200 p-4">
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-brand-600" /> Analyse des dictées</div><button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button></div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Dimensions détectées</div>
          {analysis.rooms.length === 0 ? <p className="text-sm text-slate-500">Aucune. Dictez par ex. « le salon fait 14 par 16 pieds ».</p> : (
            <ul className="text-sm">{analysis.rooms.map((r, i) => <li key={i}>• <b>{r.name}</b> : {r.length} × {r.width}{r.height ? ` × ${r.height}` : ''} {r.unit || unit}</li>)}</ul>
          )}
          {analysis.rooms.length > 0 && <button className="btn-primary mt-2 text-xs" onClick={apply}>Appliquer aux pièces</button>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Points à surveiller</div>
          {analysis.watch.length ? <ul className="text-sm text-rose-700">{analysis.watch.map(w => <li key={w}>⚠ {w}</li>)}</ul> : <p className="text-sm text-slate-500">Aucun.</p>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Points forts</div>
          {analysis.highlights.length ? <ul className="text-sm text-emerald-700">{analysis.highlights.map(w => <li key={w}>✓ {w}</li>)}</ul> : <p className="text-sm text-slate-500">Aucun.</p>}
        </div>
      </div>
      {(analysis.watch.length > 0 || analysis.highlights.length > 0) && <button className="btn-outline mt-3 text-xs" onClick={() => onSummary([analysis.highlights.length ? `Points forts : ${analysis.highlights.join(', ')}.` : '', analysis.watch.length ? `À surveiller : ${analysis.watch.join(', ')}.` : ''].filter(Boolean).join('\n'))}>Ajouter au résumé</button>}
    </div>
  )
}

function VisitorsTab({ visit: v, save }: { visit: Visit; save: (p: Partial<Visit>) => void }) {
  const { db, me, upsert } = useStore()
  const empty = (): Visitor => ({ id: uid(), name: '', phone: '', email: '', broker: '', interest: 'moyen', consent: true, notes: '' })
  const [f, setF] = useState<Visitor>(empty)
  const add = () => { if (!f.name.trim()) return; save({ visitors: [...v.visitors, f] }); setF(empty()) }
  const toContacts = () => {
    let n = 0
    for (const x of v.visitors) {
      if (!x.consent || db.contacts.some(c => (x.email && c.email === x.email) || (x.phone && c.phone === x.phone))) continue
      const [firstName, ...rest] = x.name.split(' ')
      upsert('contacts', newContact(me.id, { firstName, lastName: rest.join(' '), phone: x.phone, email: x.email, type: 'prospect', source: 'Visite libre', stage: 'contacte', lastContact: v.date.slice(0, 10), notes: `Visite libre — ${v.title}. Intérêt : ${x.interest}. ${x.broker ? `Courtier : ${x.broker}. ` : ''}${x.notes}` }))
      if (x.interest === 'fort') upsert('tasks', newTask(me.id, { title: `Relancer ${x.name} (visite libre ${v.title})`, due: new Date(Date.now() + 86400000).toISOString().slice(0, 10), priority: 'haute', category: 'Prospection' }))
      n++
    }
    alert(`${n} visiteur(s) ajouté(s) aux contacts (les doublons et visiteurs sans consentement sont ignorés).`)
  }
  return (
    <div className="space-y-4">
      <div className="card grid gap-2 p-4 sm:grid-cols-3">
        <Field label="Nom"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Courriel"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Accompagné d’un courtier?"><input className="input" value={f.broker} onChange={e => setF({ ...f, broker: e.target.value })} /></Field>
        <Field label="Intérêt"><select className="input" value={f.interest} onChange={e => setF({ ...f, interest: e.target.value as Visitor['interest'] })}><option value="faible">Faible</option><option value="moyen">Moyen</option><option value="fort">Fort</option></select></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand-600" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} /> Consent à être recontacté (Loi 25)</label>
        <button className="btn-primary justify-center" onClick={add}><UserPlus size={15} /> Ajouter le visiteur</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full"><thead><tr><th className="th">Visiteur</th><th className="th">Coordonnées</th><th className="th">Courtier</th><th className="th">Intérêt</th><th /></tr></thead>
          <tbody>{v.visitors.map(x => <tr key={x.id}><td className="td">{x.name}{!x.consent && <span className="badge ml-1 bg-slate-100">sans consentement</span>}</td><td className="td text-xs">{x.phone}<div>{x.email}</div></td><td className="td text-xs">{x.broker}</td><td className="td">{x.interest}</td><td className="td"><button className="text-rose-600" onClick={() => save({ visitors: v.visitors.filter(y => y.id !== x.id) })}><Trash2 size={14} /></button></td></tr>)}</tbody></table>
        {v.visitors.length === 0 && <p className="p-4 text-sm text-slate-500">Aucun visiteur inscrit.</p>}
      </div>
      {v.visitors.length > 0 && <button className="btn-outline" onClick={toContacts}><Users size={15} /> Ajouter les visiteurs aux contacts (prospects)</button>}
    </div>
  )
}

function PlanTab({ visit: v, unit, save, store }: { visit: Visit; unit: 'pi' | 'm'; save: (p: Partial<Visit>) => void; store: (b: Blob, k: MediaRef['kind'], n: string) => Promise<MediaRef | null> }) {
  const levels = useMemo(() => [...new Set([...v.rooms.map(r => r.level || 'RDC'), ...v.plans.map(p => p.level)])], [v.rooms, v.plans])
  const [level, setLevel] = useState(levels[0] ?? 'RDC')
  const plan: FloorPlan = v.plans.find(p => p.level === level) ?? { id: uid(), level, shapes: [], imageOpacity: 0.5, imageScale: 1 }
  const setPlan = (p: FloorPlan) => save({ plans: v.plans.some(x => x.id === p.id) ? v.plans.map(x => (x.id === p.id ? p : x)) : [...v.plans, p] })
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Niveau :</span>
        {[...new Set([...levels, ...LEVELS.slice(0, 4)])].map(l => <button key={l} onClick={() => setLevel(l)} className={`badge border px-3 py-1 ${l === level ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200'}`}>{l}{v.plans.find(p => p.level === l)?.shapes.length ? ' ✓' : ''}</button>)}
      </div>
      <PlanEditor plan={plan} rooms={v.rooms} unit={unit} onChange={setPlan} onImage={f => store(f, 'plan', f.name)} />
    </div>
  )
}

function Report({ visit: v, go, onDelete, listingName, me }: { visit: Visit; go: PageProps['go']; onDelete: () => void; listingName?: string; me: string }) {
  const { db, upsert } = useStore()
  const clients = v.contactIds.map(id => db.contacts.find(c => c.id === id)).filter(Boolean)
  const unit = v.rooms[0]?.unit ?? 'pi'
  const total = v.rooms.filter(r => r.level !== 'Extérieur').reduce((s, r) => s + area(r), 0)
  const listing = db.listings.find(l => l.id === v.listingId)
  const duration = v.startedAt && v.endedAt ? Math.round((new Date(v.endedAt).getTime() - new Date(v.startedAt).getTime()) / 60000) : 0

  const toListing = () => {
    if (!listing) return alert('Liez d’abord une inscription dans l’onglet Infos.')
    const rooms = v.rooms.map(r => ({ name: r.name, level: r.level, dim: r.length && r.width ? `${r.length} x ${r.width} ${r.unit}` : '', floor: r.floor }))
    upsert('listings', { ...listing, rooms, livingArea: listing.livingArea || `${Math.round(total)} ${unit}²`, intInfo: [listing.intInfo, v.summary].filter(Boolean).join('\n') })
    alert(`${rooms.length} pièce(s) copiée(s) dans la fiche de l’inscription (onglet Pièces).`)
  }
  const toShowing = () => {
    if (!v.listingId) return alert('Liez d’abord une inscription.')
    upsert('showings', newShowing({ listingId: v.listingId, date: v.date, buyer: clients.map(c => fullName(c!)).join(', '), interest: v.interest || 'moyen', rating: v.rating || 3, feedback: [v.summary, ...v.rooms.filter(r => r.likes || r.dislikes).map(r => `${r.name} : ${[r.likes && '+ ' + r.likes, r.dislikes && '− ' + r.dislikes].filter(Boolean).join(' ')}`)].filter(Boolean).join('\n') }))
    alert('Rétroaction de visite créée.')
  }
  const followUp = () => { upsert('tasks', newTask(v.agentId, { title: `Suivi de la visite — ${v.title}`, due: new Date(Date.now() + 86400000).toISOString().slice(0, 10), contactId: v.contactIds[0] ?? '', listingId: v.listingId, category: 'Suivi' })); alert('Tâche de suivi créée pour demain.') }
  const text = [`Résumé de visite — ${v.title}`, v.address, fmtDate(v.date, true), '', v.summary, '', 'Pièces :', ...v.rooms.map(r => `• ${r.name} (${r.level}) : ${r.length && r.width ? `${r.length} × ${r.width} ${r.unit} — ${area(r)} ${r.unit}²` : 'non mesurée'}${r.floor ? ` — ${r.floor}` : ''}`), '', `Superficie habitable estimée : ${Math.round(total)} ${unit}²`, '', me].join('\n')
  const print = () => {
    const el = document.getElementById('visit-report')
    const w = window.open('', '_blank')
    if (!el || !w) return
    w.document.write(`<html><head><title>Visite — ${v.title}</title><style>body{font-family:system-ui;padding:24px;color:#0f172a}h1{margin:0 0 4px}h2{border-bottom:2px solid #7c3aed;padding-bottom:4px;margin-top:22px;font-size:15px;text-transform:uppercase}table{width:100%;border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:4px 6px;font-size:12px;text-align:left}img{border-radius:6px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.no-print{display:none}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close(); setTimeout(() => w.print(), 400)
  }
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-2 p-3 no-print">
        <button className="btn-primary" onClick={print}><Printer size={15} /> Imprimer / PDF</button>
        {clients.some(c => c!.email) && <a className="btn-outline" href={`mailto:${clients.map(c => c!.email).filter(Boolean).join(',')}?subject=${encodeURIComponent('Résumé de visite — ' + v.title)}&body=${encodeURIComponent(text)}`}><Mail size={15} /> Envoyer au client</a>}
        <button className="btn-outline" onClick={toListing}><FileText size={15} /> Copier les pièces dans l’inscription</button>
        {v.type === 'acheteur' && <button className="btn-outline" onClick={toShowing}><ImageIcon size={15} /> Créer la rétroaction</button>}
        <button className="btn-outline" onClick={followUp}><Plus size={15} /> Tâche de suivi</button>
        {listing && <button className="btn-ghost" onClick={() => go('listings', listing.id)}>Ouvrir l’inscription →</button>}
        <button className="btn-ghost ml-auto text-rose-600" onClick={onDelete}><Trash2 size={15} /> Supprimer la visite</button>
      </div>
      <div id="visit-report" className="card space-y-3 p-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">{db.agency.name}</div>
          <h1 className="text-xl font-bold">{v.title}</h1>
          <div className="text-sm text-slate-600">{VISIT_TYPES[v.type].label} · {v.address || listingName} · {fmtDate(v.date, true)}{duration ? ` · ${duration} min` : ''}</div>
          <div className="text-sm text-slate-600">Clients : {clients.map(c => fullName(c!)).join(', ') || '—'} · Courtier : {db.members.find(m => m.id === v.agentId)?.name}</div>
        </div>
        {v.summary && <><h2 className="font-semibold">Résumé</h2><p className="whitespace-pre-wrap text-sm">{v.summary}</p></>}
        <h2 className="font-semibold">Pièces — superficie estimée {Math.round(total)} {unit}²</h2>
        <table className="w-full text-sm"><thead><tr><th className="th">Niveau</th><th className="th">Pièce</th><th className="th">Dimensions</th><th className="th">Surface</th><th className="th">Plancher</th><th className="th">État / observations</th></tr></thead>
          <tbody>{v.rooms.map(r => <tr key={r.id}><td className="td">{r.level}</td><td className="td">{r.name}</td><td className="td">{r.length && r.width ? `${r.length} × ${r.width}${r.height ? ` × ${r.height}` : ''} ${r.unit}` : '—'}</td><td className="td">{area(r) || '—'} {area(r) ? `${r.unit}²` : ''}</td><td className="td">{r.floor}</td><td className="td">{[CONDITION[r.condition], r.notes, r.likes && '+ ' + r.likes, r.dislikes && '− ' + r.dislikes].filter(Boolean).join(' · ')}</td></tr>)}</tbody></table>
        {Object.entries(v.answers).filter(([, a]) => a).length > 0 && <><h2 className="font-semibold">Réponses</h2>{Object.entries(v.answers).filter(([, a]) => a).map(([q, a]) => <p key={q} className="text-sm"><b>{q}</b><br />{a}</p>)}</>}
        {v.voiceNotes.length > 0 && <><h2 className="font-semibold">Notes vocales (transcriptions)</h2>{v.voiceNotes.map(n => <p key={n.id} className="text-sm">• {n.roomId ? <b>{v.rooms.find(r => r.id === n.roomId)?.name} : </b> : null}{n.transcript}</p>)}</>}
        {v.notes && <><h2 className="font-semibold">Notes</h2><p className="whitespace-pre-wrap text-sm">{v.notes}</p></>}
        {v.plans.filter(p => p.shapes.length).map(p => <div key={p.id}><h2 className="font-semibold">Plan — {p.level}</h2><PlanPreview plan={p} unit={unit} /></div>)}
        {[...v.photos, ...v.rooms.flatMap(r => r.media)].some(m => m.thumb) && <><h2 className="font-semibold">Photos et vidéos</h2><div className="grid grid-cols-4 gap-2">{[...v.photos, ...v.rooms.flatMap(r => r.media)].filter(m => m.thumb).map(m => <img key={m.id} src={m.thumb} alt="" className="aspect-square w-full rounded object-cover" />)}</div></>}
        {v.visitors.length > 0 && <><h2 className="font-semibold">Visiteurs ({v.visitors.length})</h2><p className="text-sm">{v.visitors.map(x => `${x.name} (${x.interest})`).join(', ')}</p></>}
      </div>
    </div>
  )
}

/** Visites à venir (pour le tableau de bord). */
export function upcomingVisits(visits: Visit[]) {
  return visits.filter(v => v.status !== 'terminee' && (daysUntil(v.date.slice(0, 10)) ?? -1) >= 0).sort((a, b) => a.date.localeCompare(b.date))
}
