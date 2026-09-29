import { useEffect, useState } from 'react'
import type { ExtDoc } from '../lib/types'
import type { SourceRef } from '../lib/integrations/types'
import { CONNECTORS } from '../lib/integrations/catalog'
import { getOverview } from '../lib/integrations/client'
import { useStore } from '../lib/store'

const name = (p: string) => CONNECTORS[p as keyof typeof CONNECTORS]?.name.split(' (')[0] ?? p
const when = (s: string) => new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })

/** Provenance d'une fiche : outils sources et date de dernière lecture. */
export function Sources({ src }: { src?: SourceRef[] }) {
  if (!src?.length) return null
  return <p className="text-[11px] text-slate-500">Sources : {src.map(s => <span key={s.p + s.x} className="mr-2">{s.url ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{name(s.p)}</a> : name(s.p)} (lu {when(s.at)})</span>)}</p>
}

/** Documents lus dans les outils connectés (ex. dossier Google Drive), avec leur date. */
export function ExtDocs({ docs }: { docs?: ExtDoc[] }) {
  if (!docs?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="mb-1 font-semibold">Documents des outils connectés</div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">{docs.map(d => <li key={d.id}><a className="hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.name}</a> <span className="text-slate-400">· {name(d.provider)} · modifié {d.modifiedAt?.slice(0, 10)}</span></li>)}</ul>
      <p className="mt-1 text-[10px] text-slate-400">Lu le {when(docs[0].fetchedAt)}</p>
    </div>
  )
}

let mapsKey: Promise<string> | null = null
/** Carte et Street View intégrés (Google Maps Embed API) si la clé est configurée par la plateforme. */
export function StreetView({ address }: { address: string }) {
  const { mode } = useStore()
  const [key, setKey] = useState('')
  const [view, setView] = useState<'place' | 'streetview'>('place')
  useEffect(() => { if (mode === 'remote') { mapsKey ??= getOverview().then(o => o.maps?.key ?? '').catch(() => ''); void mapsKey.then(setKey) } }, [mode])
  if (!key || !address) return null
  const q = encodeURIComponent(address)
  const src = view === 'place' ? `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&language=fr` : `https://www.google.com/maps/embed/v1/search?key=${key}&q=${q}&maptype=satellite`
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex gap-1 p-1 text-xs"><button className={`rounded px-2 py-0.5 ${view === 'place' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setView('place')}>Carte</button><button className={`rounded px-2 py-0.5 ${view === 'streetview' ? 'bg-brand-600 text-white' : ''}`} onClick={() => setView('streetview')}>Satellite</button></div>
      <iframe title="Carte" src={src} className="h-56 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
    </div>
  )
}
