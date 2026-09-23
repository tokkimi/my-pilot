import { tr } from '../lib/i18n'
import SendTemplate from '../components/SendTemplate'
import { useMemo, useRef, useState } from 'react'
import { Download, Mail, MessageSquare, Phone, Plus, Search, Trash2, Upload, Pencil } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { ActivityKind, Contact, ContactType, Stage } from '../lib/types'
import { newContact, newTask } from '../lib/seed'
import { createVisit } from './Visits'
import DocumentsPanel from '../components/DocumentsPanel'
import { Avatar, CONTACT_TYPES, Empty, Field, MemberSelect, Modal, PageHeader, ScopeFilter, STAGE_COLORS, STAGES, LISTING_STATUS } from '../lib/ui'
import { download, fmtDate, fullName, money, toCSV, today, uid } from '../lib/utils'

export default function Contacts({ openId, go }: PageProps) {
  const { db, mine, upsert } = useStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState<ContactType | ''>('')
  const [stage, setStage] = useState<Stage | ''>('')
  const [editing, setEditing] = useState<Contact | null>(null)
  const [viewing, setViewing] = useState<string | null>(openId ?? null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { me } = useStore()

  const list = useMemo(() => db.contacts.filter(c => mine(c.ownerId))
    .filter(c => !type || c.type === type).filter(c => !stage || c.stage === stage)
    .filter(c => !q || `${c.firstName} ${c.lastName} ${c.email} ${c.phone} ${c.city} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.lastName.localeCompare(b.lastName)), [db.contacts, mine, type, stage, q])

  const importCSV = async (f: File) => {
    const text = await f.text()
    const rows = parseCSV(text)
    if (rows.length < 2) return alert('Fichier vide')
    const head = rows[0].map(h => h.toLowerCase().trim())
    const col = (...names: string[]) => head.findIndex(h => names.some(n => h.includes(n)))
    const idx = { fn: col('prénom', 'prenom', 'first'), ln: head.findIndex(h => h === 'nom' || h.includes('nom de famille') || h.includes('last')), em: col('courriel', 'email', 'e-mail'), ph: col('tél', 'tel', 'phone', 'cell'), ci: col('ville', 'city'), ad: col('adresse', 'address') }
    let n = 0
    rows.slice(1).forEach(r => {
      const g = (i: number) => (i >= 0 ? r[i]?.trim() ?? '' : '')
      if (!g(idx.fn) && !g(idx.ln) && !g(idx.em)) return
      upsert('contacts', newContact(me.id, { firstName: g(idx.fn), lastName: g(idx.ln), email: g(idx.em), phone: g(idx.ph), city: g(idx.ci), address: g(idx.ad), source: 'Import CSV' }))
      n++
    })
    alert(`${n} contact(s) importé(s)`)
  }

  return (
    <div>
      <PageHeader title={tr("Contacts & prospects")} subtitle={`${list.length} contact(s) — vendeurs, acheteurs, anciens clients, sphère d’influence`}
        actions={<>
          <ScopeFilter />
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && importCSV(e.target.files[0])} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Importer CSV</button>
          <button className="btn-outline" onClick={() => download('contacts.csv', toCSV(list.map(({ id: _id, ...c }) => c)), 'text/csv')}><Download size={16} /> Exporter</button>
          <button className="btn-primary" onClick={() => setEditing(newContact(me.id))}><Plus size={16} />{" "}{tr("Nouveau contact")}</button>
        </>} />

      <div className="card mb-4 flex flex-wrap gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Nom, courriel, téléphone, ville, étiquette…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={type} onChange={e => setType(e.target.value as ContactType)}>
          <option value="">Tous les types</option>
          {Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto" value={stage} onChange={e => setStage(e.target.value as Stage)}>
          <option value="">Toutes les étapes</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className="th">{tr("Nom")}</th><th className="th">{tr("Type")}</th><th className="th">Étape</th><th className="th hidden md:table-cell">Coordonnées</th><th className="th hidden lg:table-cell">Source</th><th className="th hidden lg:table-cell">Dernier contact</th><th className="th">Resp.</th></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setViewing(c.id)}>
                <td className="td font-medium">{fullName(c)}<div className="text-xs font-normal text-slate-500">{c.city}</div></td>
                <td className="td">{CONTACT_TYPES[c.type]}</td>
                <td className="td"><span className={`badge ${STAGE_COLORS[c.stage]}`}>{STAGES[c.stage]}</span></td>
                <td className="td hidden text-xs md:table-cell">{c.phone}<div className="text-slate-500">{c.email}</div></td>
                <td className="td hidden text-xs lg:table-cell">{c.source}</td>
                <td className="td hidden text-xs lg:table-cell">{fmtDate(c.lastContact)}</td>
                <td className="td"><Avatar memberId={c.ownerId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-4"><Empty>Aucun contact.</Empty></div>}
      </div>

      {viewing && db.contacts.some(c => c.id === viewing) && <ContactDetail id={viewing} onClose={() => { setViewing(null); if (openId) go('contacts') }} onEdit={c => setEditing(c)} go={go} />}
      {editing && <ContactForm contact={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export function ContactForm({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { upsert } = useStore()
  const [c, setC] = useState(contact)
  const set = <K extends keyof Contact>(k: K, v: Contact[K]) => setC(x => ({ ...x, [k]: v }))
  const save = () => { if (!c.firstName && !c.lastName) return alert('Nom requis'); upsert('contacts', c); onClose() }
  return (
    <Modal title={contact.firstName ? `Modifier — ${fullName(contact)}` : 'Nouveau contact'} onClose={onClose}
      footer={<><button className="btn-ghost" onClick={onClose}>{tr("Annuler")}</button><button className="btn-primary" onClick={save}>{tr("Enregistrer")}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("Prénom")}><input className="input" value={c.firstName} onChange={e => set('firstName', e.target.value)} autoFocus /></Field>
        <Field label={tr("Nom")}><input className="input" value={c.lastName} onChange={e => set('lastName', e.target.value)} /></Field>
        <Field label={tr("Type")}><select className="input" value={c.type} onChange={e => set('type', e.target.value as ContactType)}>{Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Étape du pipeline"><select className="input" value={c.stage} onChange={e => set('stage', e.target.value as Stage)}>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Cellulaire"><input className="input" type="tel" value={c.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label={tr("Courriel")}><input className="input" type="email" value={c.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label={tr("Adresse")}><input className="input" value={c.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label={tr("Ville")}><input className="input" value={c.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="Date de fête"><input className="input" type="date" value={c.birthday} onChange={e => set('birthday', e.target.value)} /></Field>
        <Field label="Date d’achat / de vente (anniversaire)"><input className="input" type="date" value={c.closingDate} onChange={e => set('closingDate', e.target.value)} /></Field>
        <Field label="Source"><input className="input" list="sources" value={c.source} onChange={e => set('source', e.target.value)} />
          <datalist id="sources">{['Référence', 'Centris', 'Site Web', 'Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'DuProprio', 'Porte-à-porte', 'Visite libre', 'Pancarte', 'Sphère', 'Prospects', 'MonProspecteur', 'Linktree'].map(s => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Référé par"><input className="input" value={c.referredBy} onChange={e => set('referredBy', e.target.value)} /></Field>
        <Field label={tr("Responsable")}><MemberSelect value={c.ownerId} onChange={v => set('ownerId', v)} /></Field>
        <Field label="Étiquettes (séparées par des virgules)"><input className="input" value={c.tags.join(', ')} onChange={e => set('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Field>
        <Field label="Budget / valeur estimée"><input className="input" type="number" value={c.budget || ''} onChange={e => set('budget', +e.target.value)} /></Field>
        <Field label="Échéancier"><input className="input" value={c.timeline} placeholder="ex. 3-6 mois" onChange={e => set('timeline', e.target.value)} /></Field>
        <Field label="Critères de recherche" className="sm:col-span-2"><input className="input" value={c.criteria} onChange={e => set('criteria', e.target.value)} /></Field>
        <Field label="Motivation (raison de vendre / acheter)" className="sm:col-span-2"><input className="input" value={c.motivation} onChange={e => set('motivation', e.target.value)} /></Field>
        <Field label={tr("Notes")} className="sm:col-span-2"><textarea className="input min-h-24" value={c.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

const ACT: Record<ActivityKind, string> = { appel: '📞 Appel', courriel: '✉️ Courriel', texto: '💬 Texto', rencontre: '🤝 Rencontre', note: '📝 Note', visite: '🏠 Visite' }

export function ContactDetail({ id, onClose, onEdit, go }: { id: string; onClose: () => void; onEdit: (c: Contact) => void; go: PageProps['go'] }) {
  const { db, me, upsert, remove } = useStore()
  const c = db.contacts.find(x => x.id === id)!
  const [kind, setKind] = useState<ActivityKind>('appel')
  const [summary, setSummary] = useState('')
  const [tplId, setTplId] = useState('')
  const acts = db.activities.filter(a => a.contactId === id).sort((a, b) => b.date.localeCompare(a.date))
  const listings = db.listings.filter(l => l.sellerIds.includes(id))
  const deals = db.deals.filter(d => d.contactIds.includes(id))
  const tasks = db.tasks.filter(t => t.contactId === id && !t.done)

  const log = () => {
    if (!summary.trim()) return
    upsert('activities', { id: uid(), contactId: id, kind, date: today(), summary, memberId: me.id })
    upsert('contacts', { ...c, lastContact: today(), stage: c.stage === 'nouveau' ? 'contacte' : c.stage })
    setSummary('')
  }

  return (
    <Modal title={fullName(c)} onClose={onClose} wide>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className={`badge ${STAGE_COLORS[c.stage]}`}>{STAGES[c.stage]}</span>
            <span className="badge bg-slate-100">{CONTACT_TYPES[c.type]}</span>
            {c.tags.map(t => <span key={t} className="badge bg-brand-50 text-brand-700">{t}</span>)}
          </div>
          <div className="flex gap-2">
            {c.phone && <a className="btn-outline" href={`tel:${c.phone}`}><Phone size={15} /></a>}
            {c.phone && <a className="btn-outline" href={`sms:${c.phone}`}><MessageSquare size={15} /></a>}
            {c.email && <a className="btn-outline" href={`mailto:${c.email}`}><Mail size={15} /></a>}
            <button className="btn-outline" onClick={() => onEdit(c)}><Pencil size={15} /> Modifier</button>
          </div>
          <dl className="space-y-1.5 text-sm">
            {([['Cellulaire', c.phone], ['Courriel', c.email], ['Adresse', [c.address, c.city].filter(Boolean).join(', ')], ['Source', c.source], ['Référé par', c.referredBy],
              ['Fête', fmtDate(c.birthday)], ['Budget', c.budget ? money(c.budget) : ''], ['Échéancier', c.timeline], ['Critères', c.criteria], ['Motivation', c.motivation],
              ['Créé le', fmtDate(c.createdAt)], ['Dernier contact', fmtDate(c.lastContact)]] as [string, string][]).filter(([, v]) => v && v !== '—').map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
            ))}
            <div className="flex items-center gap-2"><dt className="w-28 text-slate-500">{tr("Responsable")}</dt><dd className="flex items-center gap-1"><Avatar memberId={c.ownerId} /> {db.members.find(m => m.id === c.ownerId)?.name}</dd></div>
          </dl>
          {c.notes && <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm">{c.notes}</p>}
          <button className="btn-ghost text-rose-600" onClick={() => { if (confirm('Supprimer ce contact?')) { remove('contacts', id); onClose() } }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Consigner une interaction</div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={kind} onChange={e => setKind(e.target.value as ActivityKind)}>{Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className="input min-w-40 flex-1" placeholder="Résumé…" value={summary} onChange={e => setSummary(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()} />
              <button className="btn-primary" onClick={log}>Ajouter</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={() => { upsert('tasks', newTask(me.id, { title: `Suivi — ${fullName(c)}`, contactId: id, due: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) })); alert('Tâche de suivi créée (J+3)') }}>+ Tâche de suivi J+3</button>
              <button className="btn-ghost text-xs" onClick={() => go('deals')}>+ Ouvrir un dossier</button>
              <button className="btn-ghost text-xs" onClick={() => { const v = createVisit(me.id, { type: c.type === 'acheteur' ? 'acheteur' : 'evaluation', contactIds: [c.id], title: `${c.type === 'acheteur' ? 'Visite' : 'Évaluation'} — ${fullName(c)}`, address: [c.address, c.city].filter(Boolean).join(', '), status: 'en_cours', startedAt: new Date().toISOString() }); upsert('visits', v); go('visits', v.id) }}>▶ Démarrer une visite</button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Envoyer un modèle</div>
            <select className="input" value="" onChange={e => setTplId(e.target.value)}>
              <option value="">— Choisir un modèle (courriel, texto) —</option>
              {db.templates.map(t => <option key={t.id} value={t.id}>{t.channel === 'texto' ? '💬' : t.channel === 'courriel' ? '✉️' : '📣'} {t.name}</option>)}
            </select>
            {tplId && <SendTemplate template={db.templates.find(t => t.id === tplId)} contactId={c.id} onClose={() => setTplId('')} />}
          </div>

          {(listings.length > 0 || deals.length > 0 || tasks.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-3">
              {listings.map(l => <button key={l.id} onClick={() => go('listings', l.id)} className="rounded-lg border p-2 text-left text-sm hover:bg-slate-50">🏠 {l.address}<div className="text-xs text-slate-500">{LISTING_STATUS[l.status]}</div></button>)}
              {deals.map(d => <button key={d.id} onClick={() => go('deals', d.id)} className="rounded-lg border p-2 text-left text-sm hover:bg-slate-50">📁 {d.title}<div className="text-xs text-slate-500">{money(d.price)}</div></button>)}
              {tasks.map(t => <div key={t.id} className="rounded-lg border p-2 text-sm">☑️ {t.title}<div className="text-xs text-slate-500">{fmtDate(t.due)}</div></div>)}
            </div>
          )}

          <DocumentsPanel title="Classeur du client" docs={c.documents ?? []} onChange={documents => upsert('contacts', { ...c, documents })} />
          <div>
            <div className="mb-2 text-sm font-semibold">Historique</div>
            {acts.length === 0 ? <Empty>Aucune interaction consignée.</Empty> : (
              <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                {acts.map(a => (
                  <li key={a.id} className="text-sm">
                    <div className="text-xs text-slate-500">{fmtDate(a.date)} · {ACT[a.kind]} · {db.members.find(m => m.id === a.memberId)?.name}</div>
                    <div>{a.summary}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}
