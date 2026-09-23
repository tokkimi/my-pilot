import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useStore } from './store'
import type { ContactType, EventType, ListingStatus, PartnerCat, Stage } from './types'
import { fullName } from './utils'

export const CONTACT_TYPES: Record<ContactType, string> = {
  prospect: 'Prospect', vendeur: 'Vendeur', acheteur: 'Acheteur', ancien_client: 'Ancien client', sphere: 'Sphère d’influence', investisseur: 'Investisseur', locataire: 'Locataire',
}
export const STAGES: Record<Stage, string> = {
  nouveau: 'Nouveau lead', contacte: 'Contacté', rdv: 'RDV planifié', mandat: 'Mandat signé', actif: 'Actif', sous_offre: 'Sous offre', conclu: 'Conclu', perdu: 'Perdu',
}
export const STAGE_COLORS: Record<Stage, string> = {
  nouveau: 'bg-slate-100 text-slate-700', contacte: 'bg-sky-100 text-sky-700', rdv: 'bg-indigo-100 text-indigo-700', mandat: 'bg-violet-100 text-violet-700',
  actif: 'bg-emerald-100 text-emerald-700', sous_offre: 'bg-amber-100 text-amber-800', conclu: 'bg-green-600 text-white', perdu: 'bg-rose-100 text-rose-700',
}
export const LISTING_STATUS: Record<ListingStatus, string> = {
  preparation: 'En préparation', active: 'En vigueur', pa_acceptee: 'P.A. acceptée', conditions_realisees: 'Conditions réalisées', vendu: 'Vendu', expire: 'Expiré', retire: 'Retiré',
}
export const LISTING_COLORS: Record<ListingStatus, string> = {
  preparation: 'bg-slate-100 text-slate-700', active: 'bg-emerald-100 text-emerald-700', pa_acceptee: 'bg-amber-100 text-amber-800', conditions_realisees: 'bg-orange-100 text-orange-800',
  vendu: 'bg-green-600 text-white', expire: 'bg-rose-100 text-rose-700', retire: 'bg-slate-200 text-slate-600',
}
export const EVENT_TYPES: Record<EventType, { label: string; color: string }> = {
  rdv_vendeur: { label: 'RDV vendeur', color: '#7c3aed' }, rdv_acheteur: { label: 'RDV acheteur', color: '#2563eb' }, visite: { label: 'Visite', color: '#0891b2' },
  visite_libre: { label: 'Visite libre', color: '#059669' }, photo: { label: 'Séance photo', color: '#ea580c' }, inspection: { label: 'Inspection', color: '#ca8a04' },
  notaire: { label: 'Notaire', color: '#16a34a' }, suivi: { label: 'Suivi', color: '#64748b' }, autre: { label: 'Autre', color: '#94a3b8' },
}
export const PARTNER_CATS: Record<PartnerCat, string> = {
  notaire: 'Notaire', arpenteur: 'Arpenteur-géomètre', inspecteur: 'Inspecteur', hypothecaire: 'Courtier hypothécaire', photographe: 'Photographe / drone', home_staging: 'Home staging',
  entrepreneur: 'Entrepreneur', demenageur: 'Déménageur', evaluateur: 'Évaluateur agréé', avocat: 'Avocat / fiscaliste', autre: 'Autre',
}
export const ROLES = { admin: 'Administrateur', courtier: 'Courtier', adjointe: 'Adjointe', agent: 'Membre d’équipe' }

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/40 sm:items-start sm:p-8" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} max-sm:min-h-[92vh] max-sm:rounded-b-none max-sm:rounded-t-3xl sm:my-auto`} onMouseDown={e => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4 sm:max-h-[75vh] sm:p-5">{children}</div>
        {footer && <div className="safe-bottom sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2 no-print">{actions}</div>
    </div>
  )
}

export function Stat({ label, value, sub, icon, tone = 'brand' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'green' | 'amber' | 'rose' | 'sky' }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', sky: 'bg-sky-50 text-sky-600' }
  return (
    <div className="card flex items-center gap-3 p-4">
      {icon && <div className={`rounded-lg p-2.5 ${tones[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="truncate text-xl font-bold text-slate-900">{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>
}

export function Avatar({ memberId, size = 24 }: { memberId: string; size?: number }) {
  const { db } = useStore()
  const m = db.members.find(x => x.id === memberId)
  if (!m) return null
  const initials = m.name.split(' ').map(s => s[0]).slice(0, 2).join('')
  return (
    <span title={m.name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ background: m.color, width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  )
}

export function MemberSelect({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const { db } = useStore()
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      {allowEmpty && <option value="">— Aucun —</option>}
      {db.members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

export function ContactSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db } = useStore()
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Aucun —</option>
      {[...db.contacts].sort((a, b) => a.lastName.localeCompare(b.lastName)).map(c => <option key={c.id} value={c.id}>{fullName(c)} · {CONTACT_TYPES[c.type]}</option>)}
    </select>
  )
}

export function ListingSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db } = useStore()
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Aucune —</option>
      {db.listings.map(l => <option key={l.id} value={l.id}>{l.address || 'Sans adresse'}{l.city ? `, ${l.city}` : ''}</option>)}
    </select>
  )
}

export function MultiContact({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { db } = useStore()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map(id => {
          const c = db.contacts.find(x => x.id === id)
          return (
            <span key={id} className="badge gap-1 bg-brand-50 text-brand-700">
              {fullName(c)}
              <button onClick={() => onChange(value.filter(v => v !== id))}><X size={12} /></button>
            </span>
          )
        })}
      </div>
      <ContactSelect value="" onChange={v => v && !value.includes(v) && onChange([...value, v])} />
    </div>
  )
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 no-print">
      {tabs.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function DueBadge({ days }: { days: number | null }) {
  if (days === null) return null
  const cls = days < 0 ? 'bg-rose-100 text-rose-700' : days <= 2 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
  const txt = days < 0 ? `En retard de ${-days} j` : days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `Dans ${days} j`
  return <span className={`badge whitespace-nowrap ${cls}`}>{txt}</span>
}

export function ScopeFilter() {
  const { scope, setScope } = useStore()
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
      {(['moi', 'equipe'] as const).map(s => (
        <button key={s} onClick={() => setScope(s)} className={`rounded-md px-3 py-1.5 font-medium ${scope === s ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
          {s === 'moi' ? 'Mes dossiers' : 'Toute l’équipe'}
        </button>
      ))}
    </div>
  )
}

/** En-tête de marque de l'agence (logo, coordonnées) pour les documents imprimables. */
export function Letterhead({ title, subtitle, memberId }: { title?: string; subtitle?: string; memberId?: string }) {
  const { db } = useStore()
  const a = db.agency
  const m = db.members.find(x => x.id === memberId)
  const color = a.brandColor || '#6d28d9'
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b-4 pb-3" style={{ borderColor: color }}>
      <div className="flex items-center gap-3">
        {a.logo && <img src={a.logo} alt={a.name} className="h-16 w-auto max-w-[180px] object-contain" />}
        <div>
          <div className="text-lg font-bold" style={{ color }}>{a.name}</div>
          <div className="text-xs text-slate-600">{[a.address || a.office, a.phone, a.email, a.website].filter(Boolean).join(' · ')}</div>
          {m && <div className="text-xs text-slate-600">{m.name}{m.title ? ` — ${m.title}` : ''}{m.licence ? ` · Permis ${m.licence}` : ''}{m.phone ? ` · ${m.phone}` : ''}</div>}
        </div>
      </div>
      {title && <div className="text-right"><div className="text-xl font-extrabold uppercase tracking-wide" style={{ color }}>{title}</div>{subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}</div>}
    </div>
  )
}
