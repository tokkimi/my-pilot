import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Page } from '../App'
import { useStore } from '../lib/store'
import { CONTACT_TYPES, LISTING_STATUS } from '../lib/ui'
import { fullName } from '../lib/utils'

export default function GlobalSearch({ go, onClose }: { go: (p: Page, id?: string) => void; onClose: () => void }) {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const s = q.toLowerCase().trim()
  const results: { label: string; sub: string; page: Page; id?: string; url?: string }[] = !s ? [] : [
    ...db.contacts.filter(c => `${fullName(c)} ${c.email} ${c.phone} ${c.city}`.toLowerCase().includes(s)).map(c => ({ label: fullName(c), sub: `Contact · ${CONTACT_TYPES[c.type]}`, page: 'contacts' as Page, id: c.id })),
    ...db.listings.filter(l => `${l.address} ${l.city} ${l.centris}`.toLowerCase().includes(s)).map(l => ({ label: l.address, sub: `Inscription · ${LISTING_STATUS[l.status]}`, page: 'listings' as Page, id: l.id })),
    ...db.deals.filter(d => d.title.toLowerCase().includes(s)).map(d => ({ label: d.title, sub: 'Dossier', page: 'deals' as Page, id: d.id })),
    ...db.platforms.filter(p => p.name.toLowerCase().includes(s)).map(p => ({ label: p.name, sub: 'Plateforme — ouvrir', page: 'platforms' as Page, url: p.url })),
    ...db.partners.filter(p => `${p.name} ${p.company}`.toLowerCase().includes(s)).map(p => ({ label: p.name, sub: 'Partenaire', page: 'partners' as Page })),
    ...db.templates.filter(t => t.name.toLowerCase().includes(s)).map(t => ({ label: t.name, sub: 'Modèle', page: 'templates' as Page })),
  ].slice(0, 12)

  const pick = (r: (typeof results)[number]) => { if (r.url) window.open(r.url, '_blank'); else go(r.page, r.id); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" onMouseDown={onClose}>
      <div className="card w-full max-w-xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <Search size={18} className="text-slate-400" />
          <input autoFocus className="w-full py-3 outline-none" placeholder="Contacts, adresses, # Centris, dossiers, plateformes…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && results[0]) pick(results[0]) }} />
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <li key={i}><button className="w-full px-4 py-2 text-left hover:bg-brand-50" onClick={() => pick(r)}><div className="text-sm font-medium">{r.label}</div><div className="text-xs text-slate-500">{r.sub}</div></button></li>
          ))}
          {s && results.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Aucun résultat</li>}
        </ul>
      </div>
    </div>
  )
}
