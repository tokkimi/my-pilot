import { tr } from '../lib/i18n'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Contact, ContactType, Stage } from '../lib/types'
import { newContact } from '../lib/seed'
import { Avatar, CONTACT_TYPES, PageHeader, ScopeFilter, STAGES } from '../lib/ui'
import { fullName, money, daysUntil } from '../lib/utils'
import { ContactDetail, ContactForm } from './Contacts'

export default function Pipeline({ go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [type, setType] = useState<ContactType | ''>('')
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<Contact | null>(null)
  const contacts = db.contacts.filter(c => mine(c.ownerId)).filter(c => !type || c.type === type)

  const drop = (s: Stage) => {
    const c = db.contacts.find(x => x.id === drag)
    if (c && c.stage !== s) upsert('contacts', { ...c, stage: s })
    setDrag(null); setOver(null)
  }

  return (
    <div>
      <PageHeader title={tr("Pipeline")} subtitle="Glissez-déposez les cartes pour faire avancer vos prospects"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={type} onChange={e => setType(e.target.value as ContactType)}>
            <option value="">Tous les types</option>
            {Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setEditing(newContact(me.id))}><Plus size={16} /> Lead</button>
        </>} />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {(Object.keys(STAGES) as Stage[]).map(s => {
          const items = contacts.filter(c => c.stage === s)
          const value = items.reduce((t, c) => t + (c.budget || 0), 0)
          return (
            <div key={s} onDragOver={e => { e.preventDefault(); setOver(s) }} onDragLeave={() => setOver(null)} onDrop={() => drop(s)}
              className={`flex w-64 shrink-0 flex-col rounded-xl p-2 ${over === s ? 'bg-brand-100' : 'bg-slate-100'}`}>
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-sm font-semibold">{STAGES[s]}</span>
                <span className="badge bg-white">{items.length}</span>
              </div>
              {value > 0 && <div className="px-1 pb-2 text-xs text-slate-500">{money(value)}</div>}
              <div className="flex min-h-24 flex-col gap-2">
                {items.map(c => {
                  const stale = c.lastContact ? (daysUntil(c.lastContact) ?? 0) < -30 : true
                  return (
                    <div key={c.id} draggable onDragStart={() => setDrag(c.id)} onClick={() => setViewing(c.id)}
                      className="card cursor-grab p-3 text-sm hover:border-brand-300 active:cursor-grabbing">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{fullName(c)}</span>
                        <Avatar memberId={c.ownerId} size={20} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{CONTACT_TYPES[c.type]}{c.city ? ` · ${c.city}` : ''}</div>
                      {c.budget > 0 && <div className="mt-1 text-xs font-medium text-emerald-700">{money(c.budget)}</div>}
                      {stale && s !== 'conclu' && s !== 'perdu' && <div className="mt-1 text-[11px] text-rose-600">⚠ Sans suivi depuis 30 j+</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {viewing && <ContactDetail id={viewing} onClose={() => setViewing(null)} onEdit={setEditing} go={go} />}
      {editing && <ContactForm contact={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
