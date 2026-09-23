// Utiliser un modèle : choix du client et du dossier, variables remplies automatiquement,
// texte modifiable, puis envoi (courriel par Resend, texto par l'appareil) et trace dans l'historique du client.
import { useMemo, useState } from 'react'
import { Copy, Mail, MessageSquare, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Template } from '../lib/types'
import { sendEmail } from '../lib/email'
import { Field, Modal } from '../lib/ui'
import { copy, fillTemplate, fmtDate, fullName, money, toFriendly, today, uid, unfilledFields } from '../lib/utils'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export default function SendTemplate({ template, contactId = '', onClose }: { template?: Template; contactId?: string; onClose: () => void }) {
  const { db, me, upsert } = useStore()
  const [tplId, setTplId] = useState(template?.id ?? '')
  const [cid, setCid] = useState(contactId)
  const tpl = template && template.id === tplId ? template : db.templates.find(t => t.id === tplId)
  const c = db.contacts.find(x => x.id === cid)
  const deals = db.deals.filter(d => c && d.contactIds.includes(c.id))
  const listings = db.listings.filter(l => c && l.sellerIds.includes(c.id))
  const [dealId, setDealId] = useState('')
  const deal = db.deals.find(d => d.id === dealId) ?? deals[0]
  const listing = db.listings.find(l => l.id === deal?.listingId) ?? listings[0]
  const vars = useMemo<Record<string, string>>(() => ({
    prenom: c?.firstName ?? '', nom: c?.lastName ?? '', courtier: me.name, date: fmtDate(today()), annee: String(new Date().getFullYear()),
    adresse: listing?.address || c?.address || '', ville: listing?.city || c?.city || '', prix: listing?.price ? money(listing.price) : deal?.price ? money(deal.price) : '',
    lien: listing?.centris ? `https://www.centris.ca/fr/propriete~a-vendre/${listing.centris}` : '',
    inspection: deal?.dates.inspection ? fmtDate(deal.dates.inspection) : '', financement: deal?.dates.financement ? fmtDate(deal.dates.financement) : '',
    acte: deal?.dates.acte ? fmtDate(deal.dates.acte) : '', occupation: deal?.dates.occupation ? fmtDate(deal.dates.occupation) : '',
  }), [c, me.name, listing, deal])
  const [edited, setEdited] = useState<{ key: string; subject: string; body: string } | null>(null)
  const key = `${tpl?.id}|${cid}|${deal?.id}`
  const subject = edited?.key === key ? edited.subject : toFriendly(fillTemplate(tpl?.subject ?? '', vars))
  const body = edited?.key === key ? edited.body : toFriendly(fillTemplate(tpl?.body ?? '', vars))
  const missing = unfilledFields(subject + body)
  const [busy, setBusy] = useState(false)

  const log = (kind: 'courriel' | 'texto') => {
    if (!c) return
    upsert('activities', { id: uid(), contactId: c.id, kind, date: new Date().toISOString(), summary: `${tpl?.name ?? 'Message'}${kind === 'courriel' ? ` — « ${subject} »` : ''}`, memberId: me.id })
    upsert('contacts', { ...c, lastContact: today() })
  }
  const email = async () => {
    if (!c?.email) return alert('Ce contact n’a pas de courriel.')
    setBusy(true)
    try {
      const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:640px">${esc(body).replace(/\n/g, '<br>')}<p style="color:#64748b;font-size:13px">${esc(me.name)} — ${esc(db.agency.name)}${me.phone ? ` · ${esc(me.phone)}` : ''}</p></div>`
      const how = await sendEmail({ to: [c.email], subject, html, text: body })
      log('courriel')
      alert(how === 'sent' ? `Courriel envoyé à ${c.email}.` : 'Votre logiciel de courriel s’ouvre avec le message prêt.')
      onClose()
    } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Utiliser un modèle" onClose={onClose} wide
      footer={<>
        <button className="btn-ghost mr-auto" onClick={() => copy(tpl?.channel === 'courriel' ? `${subject}\n\n${body}` : body)}><Copy size={15} /> Copier</button>
        {tpl?.channel === 'texto' && <a className={`btn-outline ${!c?.phone ? 'pointer-events-none opacity-50' : ''}`} href={c?.phone ? `sms:${c.phone}?&body=${encodeURIComponent(body)}` : undefined} onClick={() => log('texto')}><MessageSquare size={15} /> Ouvrir en texto</a>}
        {tpl?.channel === 'courriel' && <button className="btn-primary" disabled={busy || !c?.email} onClick={email}>{busy ? 'Envoi…' : <><Send size={15} /> Envoyer le courriel</>}</button>}
      </>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Modèle"><select className="input" value={tplId} onChange={e => setTplId(e.target.value)}>
          <option value="">— Choisir —</option>{db.templates.map(t => <option key={t.id} value={t.id}>{t.channel === 'texto' ? '💬' : t.channel === 'courriel' ? '✉️' : '📣'} {t.name}</option>)}
        </select></Field>
        <Field label="Client"><select className="input" value={cid} onChange={e => { setCid(e.target.value); setDealId('') }}>
          <option value="">— Choisir —</option>{[...db.contacts].sort((a, b) => fullName(a).localeCompare(fullName(b))).map(x => <option key={x.id} value={x.id}>{fullName(x)}</option>)}
        </select></Field>
        <Field label="Dossier (dates, adresse, prix)"><select className="input" value={deal?.id ?? ''} onChange={e => setDealId(e.target.value)} disabled={!deals.length}>
          {!deals.length && <option value="">Aucun dossier</option>}{deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select></Field>
      </div>
      {c && <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">{c.email && <span><Mail size={12} className="inline" /> {c.email}</span>}{c.phone && <span><MessageSquare size={12} className="inline" /> {c.phone}</span>}</div>}
      {tpl && (
        <div className="mt-3 space-y-3">
          {tpl.channel === 'courriel' && <Field label="Objet"><input className="input" value={subject} onChange={e => setEdited({ key, subject: e.target.value, body })} /></Field>}
          <Field label="Message (modifiable)"><textarea className="input min-h-64 text-sm" value={body} onChange={e => setEdited({ key, subject, body: e.target.value })} /></Field>
          {missing.length > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">À compléter avant l’envoi (remplacez le texte entre crochets) : {missing.join(', ')}</div>}
        </div>
      )}
    </Modal>
  )
}
