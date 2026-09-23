import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Priority, Task } from '../lib/types'
import { newTask } from '../lib/seed'
import { Avatar, ContactSelect, DueBadge, Empty, Field, ListingSelect, MemberSelect, Modal, PageHeader, ScopeFilter } from '../lib/ui'
import { daysUntil, fullName } from '../lib/utils'

const CATS = ['Prospection', 'Suivi', 'Vendeur', 'Acheteur', 'Inscription', 'Transaction', 'Marketing', 'Administration', 'Formation']
const PRIO: Record<Priority, string> = { haute: 'bg-rose-100 text-rose-700', normale: 'bg-slate-100 text-slate-600', basse: 'bg-sky-50 text-sky-700' }

export default function Tasks({ go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [quick, setQuick] = useState('')
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const tasks = db.tasks.filter(t => mine(t.assigneeId)).filter(t => !cat || t.category === cat)
  const open = tasks.filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due))
  const groups: [string, Task[]][] = [
    ['En retard', open.filter(t => (daysUntil(t.due) ?? 0) < 0)],
    ['Aujourd’hui', open.filter(t => daysUntil(t.due) === 0)],
    ['Cette semaine', open.filter(t => { const n = daysUntil(t.due) ?? 0; return n > 0 && n <= 7 })],
    ['Plus tard', open.filter(t => (daysUntil(t.due) ?? 0) > 7)],
    ['Terminées', tasks.filter(t => t.done).slice(0, 20)],
  ]

  const add = () => { if (!quick.trim()) return; upsert('tasks', newTask(me.id, { title: quick.trim(), category: cat || 'Suivi' })); setQuick('') }

  return (
    <div>
      <PageHeader title="Tâches" subtitle="Suivis, relances et to-do de l’équipe"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value)}><option value="">Toutes catégories</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
          <button className="btn-primary" onClick={() => setEditing(newTask(me.id))}><Plus size={16} /> Tâche détaillée</button>
        </>} />
      <div className="card mb-4 flex gap-2 p-3">
        <input className="input" placeholder="Ajout rapide : « Rappeler M. Tremblay » puis Entrée" value={quick} onChange={e => setQuick(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn-primary" onClick={add}>Ajouter</button>
      </div>
      <div className="space-y-4">
        {groups.map(([label, items]) => items.length > 0 && (
          <section key={label} className="card">
            <h2 className={`border-b border-slate-100 px-4 py-2 text-sm font-semibold ${label === 'En retard' ? 'text-rose-600' : ''}`}>{label} <span className="text-slate-400">({items.length})</span></h2>
            <ul className="divide-y divide-slate-100">
              {items.map(t => {
                const contact = db.contacts.find(c => c.id === t.contactId)
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={t.done} onChange={() => upsert('tasks', { ...t, done: !t.done })} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                      <div className={`text-sm ${t.done ? 'text-slate-400 line-through' : ''}`}>{t.title}</div>
                      <div className="text-xs text-slate-500">{t.category}{contact && ` · ${fullName(contact)}`}</div>
                    </button>
                    {t.dealId && <button className="text-xs text-brand-600 hover:underline" onClick={() => go('deals', t.dealId)}>dossier</button>}
                    <span className={`badge ${PRIO[t.priority]}`}>{t.priority}</span>
                    {!t.done && <DueBadge days={daysUntil(t.due)} />}
                    <Avatar memberId={t.assigneeId} />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {tasks.length === 0 && <Empty>Aucune tâche.</Empty>}
      </div>
      {editing && <TaskForm task={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { upsert, remove, db } = useStore()
  const [t, setT] = useState(task)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT(x => ({ ...x, [k]: v }))
  const exists = db.tasks.some(x => x.id === t.id)
  return (
    <Modal title={exists ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('tasks', t.id); onClose() }}><Trash2 size={15} /> Supprimer</button>}
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { if (t.title.trim()) { upsert('tasks', t); onClose() } }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" className="sm:col-span-2"><input className="input" autoFocus value={t.title} onChange={e => set('title', e.target.value)} /></Field>
        <Field label="Échéance"><input className="input" type="date" value={t.due} onChange={e => set('due', e.target.value)} /></Field>
        <Field label="Priorité"><select className="input" value={t.priority} onChange={e => set('priority', e.target.value as Priority)}><option value="basse">Basse</option><option value="normale">Normale</option><option value="haute">Haute</option></select></Field>
        <Field label="Assignée à"><MemberSelect value={t.assigneeId} onChange={v => set('assigneeId', v)} /></Field>
        <Field label="Catégorie"><select className="input" value={t.category} onChange={e => set('category', e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Contact"><ContactSelect value={t.contactId} onChange={v => set('contactId', v)} /></Field>
        <Field label="Inscription"><ListingSelect value={t.listingId} onChange={v => set('listingId', v)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20" value={t.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
