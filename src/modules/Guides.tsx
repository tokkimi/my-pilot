import { useState } from 'react'
import { Printer } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { BUYER_GUIDE, SELLER_GUIDE } from '../lib/content'
import { PageHeader, Tabs } from '../lib/ui'

export default function Guides(_: PageProps) {
  const { db, me } = useStore()
  const [tab, setTab] = useState<'acheteur' | 'vendeur'>('acheteur')
  const guide = tab === 'acheteur' ? BUYER_GUIDE : SELLER_GUIDE
  const brokers = db.members.filter(m => m.active && (m.role === 'courtier' || m.role === 'admin'))
  return (
    <div>
      <PageHeader title="Guides clients" subtitle="Guides acheteur et vendeur prêts à imprimer ou à envoyer en PDF"
        actions={<button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Imprimer / PDF</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['acheteur', 'Guide acheteur'], ['vendeur', 'Guide vendeur']]} />
      <article className="card mx-auto max-w-3xl p-8">
        <div className="mb-6 border-b-4 border-brand-600 pb-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">{db.agency.name}</div>
          <h1 className="mt-1 text-2xl font-bold">DÉMARRONS ENSEMBLE VOTRE PROJET {tab === 'acheteur' ? 'D’ACHAT' : 'DE VENTE'} IMMOBILIER</h1>
          <p className="mt-2 text-sm text-slate-600">
            {tab === 'acheteur'
              ? 'Mon objectif : rendre votre parcours d’achat simple, efficace et sécurisant, du tout premier échange jusqu’à la remise des clés chez le notaire — et même après.'
              : 'Mon objectif : rendre votre parcours de vente fluide, stratégique et sécurisant, de notre premier échange jusqu’à la signature chez le notaire — et au-delà.'}
          </p>
        </div>
        <ol className="space-y-4">
          {guide.map((g, i) => (
            <li key={g.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <div><h2 className="font-semibold">{g.title}</h2><p className="text-sm text-slate-600">{g.body}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          {(brokers.length ? brokers : [me]).map(m => (
            <div key={m.id} className="text-sm"><div className="font-semibold">{m.name}</div><div className="text-slate-500">{m.title}</div><div>📞 {m.phone}</div><div>✉ {m.email}</div></div>
          ))}
        </div>
      </article>
    </div>
  )
}
