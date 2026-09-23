import { tr } from '../lib/i18n'
import { useState } from 'react'
import { ExternalLink, Plus, Printer, Trash2, MapPin } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Listing, ListingStatus, Room } from '../lib/types'
import { newDeal, newListing, newShowing } from '../lib/seed'
import { DAYS, FLOORINGS, LISTING_DOCS, MARKETING_PLAN, PROPERTY_FEATURES, ROOM_PRESETS, VISIT_INFO } from '../lib/content'
import { Letterhead, Avatar, Empty, Field, LISTING_COLORS, LISTING_STATUS, MemberSelect, Modal, MultiContact, PageHeader, Progress, ScopeFilter, Tabs, DueBadge } from '../lib/ui'
import { daysUntil, fmtDate, fullName, money, printElement } from '../lib/utils'
import { ShowingForm } from './Showings'
import { createVisit } from './Visits'
import DrivePanel from '../components/DrivePanel'
import DocumentsPanel from '../components/DocumentsPanel'

export default function Listings({ openId, go }: PageProps) {
  const { db, me, mine, upsert } = useStore()
  const [status, setStatus] = useState<ListingStatus | ''>('')
  const [open, setOpen] = useState<Listing | null>(() => db.listings.find(l => l.id === openId) ?? null)
  const list = db.listings.filter(l => mine(l.agentId)).filter(l => !status || l.status === status)

  const create = () => { const l = newListing(me.id); upsert('listings', l); setOpen(l) }

  return (
    <div>
      <PageHeader title={tr("Inscriptions")} subtitle="Fiches propriétés, documents requis, plan de mise en marché et visites"
        actions={<>
          <ScopeFilter />
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value as ListingStatus)}>
            <option value="">Tous les statuts</option>
            {Object.entries(LISTING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary" onClick={create}><Plus size={16} />{" "}{tr("Nouvelle inscription")}</button>
        </>} />
      {list.length === 0 ? <Empty>Aucune inscription.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(l => {
            const mk = MARKETING_PLAN.flatMap(g => g.items)
            const mkPct = (mk.filter(i => l.marketing[i]).length / mk.length) * 100
            const docs = LISTING_DOCS[0].items
            const docPct = (docs.filter(i => l.docs[i]).length / docs.length) * 100
            const shows = db.showings.filter(s => s.listingId === l.id).length
            const dom = l.status !== 'preparation' ? -(daysUntil(l.mandateStart) ?? 0) : 0
            return (
              <button key={l.id} onClick={() => setOpen(l)} className="card flex flex-col overflow-hidden text-left transition hover:shadow-md">
                <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-brand-100 to-sky-100 bg-cover bg-center" style={l.photoUrl ? { backgroundImage: `url(${l.photoUrl})` } : {}}>
                  {!l.photoUrl && <span className="text-4xl">🏡</span>}
                </div>
                <div className="w-full space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{l.address || 'Nouvelle inscription'}</div>
                      <div className="text-xs text-slate-500">{l.city} {l.centris && `· Centris ${l.centris}`}</div>
                    </div>
                    <Avatar memberId={l.agentId} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${LISTING_COLORS[l.status]}`}>{LISTING_STATUS[l.status]}</span>
                    <span className="text-sm font-bold">{money(l.price)}</span>
                  </div>
                  <div className="text-xs text-slate-500">{l.propertyType} · {l.bedrooms} CAC · {l.bathrooms} SDB · {shows} visite(s){dom > 0 ? ` · ${dom} j sur le marché` : ''}</div>
                  <div className="text-xs">Marketing <Progress value={mkPct} /></div>
                  <div className="text-xs">Documents <Progress value={docPct} /></div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {open && <ListingDetail id={open.id} onClose={() => { setOpen(null); if (openId) go('listings') }} go={go} />}
    </div>
  )
}

type Tab = 'infos' | 'fiche' | 'pieces' | 'docs' | 'classeur' | 'marketing' | 'visites' | 'horaire' | 'print'

function ListingDetail({ id, onClose, go }: { id: string; onClose: () => void; go: PageProps['go'] }) {
  const { db, upsert, remove } = useStore()
  const l = db.listings.find(x => x.id === id)
  const [tab, setTab] = useState<Tab>('infos')
  const [showing, setShowing] = useState(false)
  if (!l) return null
  const set = <K extends keyof Listing>(k: K, v: Listing[K]) => upsert('listings', { ...l, [k]: v })
  const toggle = (k: 'marketing' | 'docs', item: string) => set(k, { ...l[k], [item]: !l[k][item] })
  const toggleFeature = (g: string, o: string) => {
    const cur = l.features[g] ?? []
    set('features', { ...l.features, [g]: cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o] })
  }
  const setRoom = (i: number, r: Partial<Room>) => set('rooms', l.rooms.map((x, j) => (j === i ? { ...x, ...r } : x)))
  const deal = db.deals.find(d => d.listingId === id)
  const showings = db.showings.filter(s => s.listingId === id).sort((a, b) => b.date.localeCompare(a.date))
  const gross = l.price * l.commissionPct / 100
  const mandateDays = daysUntil(l.mandateEnd)

  return (
    <Modal title={l.address || 'Nouvelle inscription'} onClose={onClose} wide>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[['infos', 'Infos & mandat'], ['fiche', 'Caractéristiques'], ['pieces', 'Pièces'], ['docs', 'Documents requis'], ['classeur', `Classeur (${l.documents?.length ?? 0})`], ['marketing', 'Plan marketing'], ['horaire', 'Horaire visites'], ['visites', `Rétroactions (${showings.length})`], ['print', 'Fiche imprimable']]} />

      {tab === 'infos' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <Field label={tr("Adresse")}><input className="input" value={l.address} onChange={e => set('address', e.target.value)} /></Field>
            <Field label={tr("Ville")}><input className="input" value={l.city} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="No Centris"><input className="input" value={l.centris} onChange={e => set('centris', e.target.value)} /></Field>
            <Field label="Type de propriété"><input className="input" list="ptypes" value={l.propertyType} onChange={e => set('propertyType', e.target.value)} />
              <datalist id="ptypes">{['Maison', 'Maison à étages', 'Maison plain-pied', 'Condo', 'Duplex', 'Triplex', 'Quadruplex', 'Quintuplex', 'Multilogement', 'Terrain', 'Chalet', 'Commercial', 'Prestige'].map(x => <option key={x} value={x} />)}</datalist>
            </Field>
            <Field label={tr("Statut")}><select className="input" value={l.status} onChange={e => set('status', e.target.value as ListingStatus)}>{Object.entries(LISTING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Prix demandé"><input className="input" type="number" value={l.price || ''} onChange={e => set('price', +e.target.value)} /></Field>
            <Field label="Chambres"><input className="input" type="number" value={l.bedrooms || ''} onChange={e => set('bedrooms', +e.target.value)} /></Field>
            <Field label="Salles de bain + salles d’eau"><input className="input" type="number" value={l.bathrooms || ''} onChange={e => set('bathrooms', +e.target.value)} /></Field>
            <Field label="Année de construction"><input className="input" type="number" value={l.yearBuilt || ''} onChange={e => set('yearBuilt', +e.target.value)} /></Field>
            <Field label="Superficie habitable"><input className="input" value={l.livingArea} onChange={e => set('livingArea', e.target.value)} /></Field>
            <Field label="Terrain (dimensions / superficie)"><input className="input" value={l.lot} onChange={e => set('lot', e.target.value)} /></Field>
            <Field label="Taxes municipales / an"><input className="input" type="number" value={l.taxesMun || ''} onChange={e => set('taxesMun', +e.target.value)} /></Field>
            <Field label="Taxes scolaires / an"><input className="input" type="number" value={l.taxesScol || ''} onChange={e => set('taxesScol', +e.target.value)} /></Field>
            <Field label="Frais de copropriété / mois"><input className="input" type="number" value={l.condoFees || ''} onChange={e => set('condoFees', +e.target.value)} /></Field>
            <Field label="Solde hypothécaire"><input className="input" type="number" value={l.mortgageBalance || ''} onChange={e => set('mortgageBalance', +e.target.value)} /></Field>
            <Field label="URL photo principale"><input className="input" value={l.photoUrl} onChange={e => set('photoUrl', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Vendeur(s)" className="sm:col-span-2"><MultiContact value={l.sellerIds} onChange={v => set('sellerIds', v)} /></Field>
            <Field label={tr("Notes")} className="sm:col-span-2"><textarea className="input min-h-20" value={l.notes} onChange={e => set('notes', e.target.value)} /></Field>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold">Mandat</div>
              <div className="grid gap-2">
                <Field label="Courtier inscripteur"><MemberSelect value={l.agentId} onChange={v => set('agentId', v)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={tr("Début")}><input className="input" type="date" value={l.mandateStart} onChange={e => set('mandateStart', e.target.value)} /></Field>
                  <Field label={tr("Fin")}><input className="input" type="date" value={l.mandateEnd} onChange={e => set('mandateEnd', e.target.value)} /></Field>
                  <Field label="Rétribution %"><input className="input" type="number" step="0.25" value={l.commissionPct} onChange={e => set('commissionPct', +e.target.value)} /></Field>
                  <Field label="Collaborateur %"><input className="input" type="number" step="0.25" value={l.collabPct} onChange={e => set('collabPct', +e.target.value)} /></Field>
                </div>
                <div className="flex items-center justify-between text-sm"><span>Échéance du mandat</span><DueBadge days={mandateDays} /></div>
                <div className="text-sm">Commission brute estimée : <b>{money(gross)}</b></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="mb-2 font-semibold">Certificat de localisation</div>
              <Field label="À refaire ?"><select className="input" value={l.certificatRedo} onChange={e => set('certificatRedo', e.target.value)}><option value="">—</option><option>Oui</option><option>Non</option></select></Field>
              <Field label="Si non, quelle année ?" className="mt-2"><input className="input" value={l.certificatYear} onChange={e => set('certificatYear', e.target.value)} /></Field>
              <p className="mt-2 text-xs text-slate-500">L’adjointe contacte le vendeur par courriel pour approbation avant toute commande à l’arpenteur.</p>
            </div>
            <DrivePanel category="Inscriptions" name={[l.address, l.city].filter(Boolean).join(', ')} folderId={l.driveFolderId} url={l.driveUrl} subfolders={['01 Contrat de courtage', '02 Identification et conformité', '03 Documents de la propriété', '04 Photos et marketing', '05 Promesses d’achat', '06 Notaire']} onLink={(id, u) => upsert('listings', { ...l, driveFolderId: id, driveUrl: u })} />
            <div className="flex flex-col gap-2">
              {l.address && <a className="btn-outline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/${encodeURIComponent(l.address + ' ' + l.city)}`}><MapPin size={15} /> Street View / carte</a>}
              {l.centris && <a className="btn-outline" target="_blank" rel="noreferrer" href={`https://www.centris.ca/fr/propriete~a-vendre?q=${l.centris}`}><ExternalLink size={15} /> Voir sur Centris</a>}
              <button className="btn-primary" onClick={() => { const v = createVisit(l.agentId, { type: l.status === 'preparation' ? 'evaluation' : 'photo', listingId: l.id, title: l.address, address: `${l.address}, ${l.city}`, contactIds: l.sellerIds, status: 'en_cours', startedAt: new Date().toISOString() }); upsert('visits', v); go('visits', v.id) }}>▶ Démarrer une visite (mesures, vidéo, plan)</button>
              {deal ? <button className="btn-outline" onClick={() => go('deals', deal.id)}>📁 Ouvrir le dossier de vente</button>
                : <button className="btn-primary" onClick={() => { const d = newDeal(l.agentId, { kind: 'vente', title: `Vente — ${l.address}`, listingId: l.id, contactIds: l.sellerIds, price: l.price, commissionPct: l.commissionPct }); upsert('deals', d); go('deals', d.id) }}>Créer le dossier de vente</button>}
              <button className="btn-ghost text-rose-600" onClick={() => { if (confirm('Supprimer cette inscription?')) { remove('listings', l.id); onClose() } }}><Trash2 size={15} />{" "}{tr("Supprimer")}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'fiche' && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(PROPERTY_FEATURES).map(([g, opts]) => (
            <div key={g} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {opts.map(o => {
                  const on = l.features[g]?.includes(o)
                  return <button key={o} onClick={() => toggleFeature(g, o)} className={`badge border px-2.5 py-1 ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'}`}>{o}</button>
                })}
              </div>
            </div>
          ))}
          <Field label="Informations supplémentaires — extérieur"><textarea className="input min-h-24" value={l.extInfo} onChange={e => set('extInfo', e.target.value)} /></Field>
          <Field label="Informations supplémentaires — intérieur"><textarea className="input min-h-24" value={l.intInfo} onChange={e => set('intInfo', e.target.value)} /></Field>
        </div>
      )}

      {tab === 'pieces' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => set('rooms', [...l.rooms, { name: '', level: 'RDC', dim: '', floor: '' }])}><Plus size={15} /> Ajouter une pièce</button>
            {l.rooms.length === 0 && <button className="btn-ghost" onClick={() => set('rooms', ROOM_PRESETS.map(([name, level]) => ({ name, level, dim: '', floor: '' })))}>Pré-remplir la liste type (Guide du courtier)</button>}
          </div>
          {l.rooms.length === 0 ? <Empty>Aucune pièce mesurée.</Empty> : (
            <table className="w-full">
              <thead><tr><th className="th">Niveau</th><th className="th">Pièce</th><th className="th">Dimensions</th><th className="th">Revêtement de plancher</th><th /></tr></thead>
              <tbody>
                {l.rooms.map((r, i) => (
                  <tr key={i}>
                    <td className="td"><select className="input" value={r.level} onChange={e => setRoom(i, { level: e.target.value })}>{['RDC', '2e étage', '3e étage', 'Sous-sol', 'Extérieur'].map(x => <option key={x}>{x}</option>)}</select></td>
                    <td className="td"><input className="input" value={r.name} onChange={e => setRoom(i, { name: e.target.value })} /></td>
                    <td className="td"><input className="input" value={r.dim} placeholder="12 x 14 pi" onChange={e => setRoom(i, { dim: e.target.value })} /></td>
                    <td className="td"><select className="input" value={r.floor} onChange={e => setRoom(i, { floor: e.target.value })}><option value="">—</option>{FLOORINGS.map(x => <option key={x}>{x}</option>)}</select></td>
                    <td className="td"><button className="btn-ghost p-1 text-rose-600" onClick={() => set('rooms', l.rooms.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'docs' && (
        <div className="grid gap-4 md:grid-cols-3">
          {LISTING_DOCS.map(g => (
            <div key={g.group} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold">{g.group}</div>
              {g.items.map(i => (
                <label key={i} className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-brand-600" checked={!!l.docs[i]} onChange={() => toggle('docs', i)} /> {i}
                </label>
              ))}
            </div>
          ))}
          <p className="text-xs text-slate-500 md:col-span-3">Le courtier reconnaît avoir reçu les documents ci-haut lors de la prise du contrat de courtage. Les fichiers sont conservés dans la GED de l’agence.</p>
        </div>
      )}

      {tab === 'classeur' && <DocumentsPanel title="Classeur de l’inscription" docs={l.documents ?? []} onChange={documents => upsert('listings', { ...l, documents })} />}

      {tab === 'marketing' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MARKETING_PLAN.map(g => (
            <div key={g.group} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold">{g.group}</div>
              {g.items.map(i => (
                <label key={i} className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-brand-600" checked={!!l.marketing[i]} onChange={() => toggle('marketing', i)} /> {i}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'horaire' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Horaire des visites</div>
            {DAYS.map(d => (
              <div key={d} className="flex items-center gap-2 py-1 text-sm">
                <span className="w-24">{d}</span>
                <input className="input" placeholder="ex. 10h à 20h" value={l.schedule[d] ?? ''} onChange={e => set('schedule', { ...l.schedule, [d]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Informations sur les visites</div>
            {VISIT_INFO.map(q => (
              <div key={q} className="py-1 text-sm">
                <div className="mb-1">{q}</div>
                <input className="input" placeholder="Oui / Non / date / détails" value={l.visitInfo[q] ?? ''} onChange={e => set('visitInfo', { ...l.visitInfo, [q]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'visites' && (
        <div>
          <button className="btn-primary mb-3" onClick={() => setShowing(true)}><Plus size={15} /> Ajouter une rétroaction</button>
          {showings.length === 0 ? <Empty>Aucune visite consignée.</Empty> : (
            <div className="space-y-2">
              {showings.map(s => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><b>{fmtDate(s.date, true)} — {s.broker || 'Courtier'}</b><span>{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)} · intérêt {s.interest}</span></div>
                  <div className="text-slate-600">{s.buyer} · prix jugé : {s.priceOpinion || '—'}</div>
                  <div className="mt-1">{s.feedback}</div>
                </div>
              ))}
            </div>
          )}
          {showing && <ShowingForm showing={newShowing({ listingId: id })} onClose={() => setShowing(false)} />}
        </div>
      )}

      {tab === 'print' && <PrintSheet l={l} />}
    </Modal>
  )
}

function PrintSheet({ l }: { l: Listing }) {
  const { db } = useStore()
  const sellers = l.sellerIds.map(id => db.contacts.find(c => c.id === id)).filter(Boolean)
  const agent = db.members.find(m => m.id === l.agentId)
  return (
    <div>
      <button className="btn-primary no-print mb-3" onClick={() => printElement('print-sheet', `Fiche — ${l.address}`)}><Printer size={15} /> Imprimer / PDF</button>
      <div id="print-sheet" className="space-y-3 text-sm">
        <Letterhead title="Fiche d’inscription" subtitle={l.centris ? `Centris ${l.centris}` : undefined} memberId={agent?.id} />
        <h1 className="text-xl font-bold">{l.address}, {l.city}</h1>
        <h2 className="font-semibold">Coordonnées des vendeurs</h2>
        <div className="g grid grid-cols-2 gap-1">{sellers.map(s => <div key={s!.id}>{fullName(s)} — {s!.phone} — {s!.email}</div>)}</div>
        <h2 className="font-semibold">Propriété</h2>
        <div className="g grid grid-cols-2 gap-1">
          <div>Type : {l.propertyType}</div><div>Prix : {money(l.price)}</div><div>Centris : {l.centris || '—'}</div><div>Année : {l.yearBuilt || '—'}</div>
          <div>Chambres : {l.bedrooms}</div><div>SDB + SE : {l.bathrooms}</div><div>Taxes mun. : {money(l.taxesMun)}</div><div>Taxes scol. : {money(l.taxesScol)}</div>
          <div>Terrain : {l.lot || '—'}</div><div>Superficie : {l.livingArea || '—'}</div>
          <div>Certificat à refaire : {l.certificatRedo || '—'} {l.certificatYear}</div><div>Mandat : {fmtDate(l.mandateStart)} → {fmtDate(l.mandateEnd)} · {l.commissionPct} %</div>
        </div>
        <h2 className="font-semibold">Caractéristiques</h2>
        <div className="g grid grid-cols-2 gap-1">{Object.entries(l.features).filter(([, v]) => v.length).map(([k, v]) => <div key={k}><b>{k} :</b> {v.join(', ')}</div>)}</div>
        {l.rooms.length > 0 && <>
          <h2 className="font-semibold">Mesure des pièces</h2>
          <table className="w-full"><thead><tr><th>Niveau</th><th>Pièce</th><th>Dimensions</th><th>Plancher</th></tr></thead>
            <tbody>{l.rooms.map((r, i) => <tr key={i}><td>{r.level}</td><td>{r.name}</td><td>{r.dim}</td><td>{r.floor}</td></tr>)}</tbody></table>
        </>}
        <h2 className="font-semibold">Horaire des visites</h2>
        <div className="g grid grid-cols-2 gap-1">{DAYS.map(d => <div key={d}>{d} : {l.schedule[d] || '—'}</div>)}</div>
        {(l.extInfo || l.intInfo) && <><h2 className="font-semibold">Informations supplémentaires</h2><p><b>Extérieur :</b> {l.extInfo}</p><p><b>Intérieur :</b> {l.intInfo}</p></>}
      </div>
    </div>
  )
}
