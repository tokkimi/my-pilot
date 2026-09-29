import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, FileUp, Link2, Loader2, LogOut, Pencil, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck, Table2, Trash2, Webhook, XCircle } from 'lucide-react'
import { guideFor, logoUrl } from '../lib/platforms'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import type { Platform } from '../lib/types'
import { Field, Modal, PageHeader, Tabs } from '../lib/ui'
import { uid } from '../lib/utils'
import { CONNECTORS, IMPL_LABEL, INTEGRATIONS, METHOD_LABEL, type ConnectorKey, type IntegrationDef } from '../lib/integrations/catalog'
import { ago, askReconnect, connectKey, createWebhook, disconnect, embedCheck, executeAction, getAudit, getOverview, importRows, parseCsv, prepareAction, removeConnection, savePolicy, startOAuth, syncHistory, type Overview } from '../lib/integrations/client'
import { AI_COLLECTIONS, ALL_ROLES, AUTO_ACTIONS, type AgencyPolicy, type AiCollection, type AutoAction, type Connection, type Role, type SyncRun } from '../lib/integrations/types'
import { ROLES } from '../lib/ui'
import { Toggle } from './Google'

type Conn = Overview['connections'][number]
type Tab = 'apps' | 'comptes' | 'admin' | 'matrice'

export default function Platforms({ openId }: PageProps) {
  const { mode } = useStore()
  const [tab, setTab] = useState<Tab>('apps')
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const flash = openId?.startsWith('ok:') ? { ok: true, text: decodeURIComponent(openId.slice(3)) } : openId?.startsWith('erreur:') ? { ok: false, text: decodeURIComponent(openId.slice(7)) } : null
  const load = useCallback(() => getOverview().then(setOv).catch(e => setErr((e as Error).message)), [])
  useEffect(() => { if (mode === 'remote') void load() }, [mode, load])

  if (mode === 'local') return (
    <div>
      <PageHeader title="Plateformes" subtitle="Tous les outils de l’agence au même endroit" />
      <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">Mode démonstration : les connexions aux outils (Google, Outlook, Mailchimp, Calendly, Meta…) et le bouton « Actualiser » sont offerts dans l’espace sécurisé de l’agence. <a href="/inscription" className="font-semibold underline">Créer un compte</a></p>
      <AgencyLinks />
    </div>
  )
  const tabs: [Tab, string][] = [['apps', 'Mes applications'], ['comptes', 'Liens & comptes de l’agence'], ...(ov?.admin ? [['admin', 'Administration'] as [Tab, string]] : []), ['matrice', 'Matrice des intégrations']]
  return (
    <div>
      <PageHeader title="Plateformes & connexions" subtitle="Reliez une fois vos outils : ImmoPilot les actualise ensuite automatiquement" />
      {flash && <div className={`mb-3 rounded-lg p-3 text-sm ${flash.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{flash.text}</div>}
      {err && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {!ov ? <Loader2 className="animate-spin text-slate-400" /> :
        tab === 'apps' ? <Apps ov={ov} reload={load} /> :
        tab === 'comptes' ? <AgencyLinks /> :
        tab === 'admin' ? <Admin ov={ov} reload={load} /> : <Matrix />}
    </div>
  )
}

// ---------------- état honnête d'une fiche ----------------
type Status = { label: string; tone: string; conns: Conn[] }
function statusOf(def: IntegrationDef, ov: Overview): Status | null {
  if (!def.connector) return { label: def.impl === 'lien' ? 'Lien et guide' : 'Inclus dans ImmoPilot', tone: 'bg-slate-100 text-slate-600', conns: [] }
  const cs = ov.connectors.find(c => c.key === def.connector)
  if (!cs) return null // masquée pour ce rôle ou non proposée
  const conns = ov.connections.filter(c => c.provider === def.connector && c.status !== 'deconnecte' && (!def.services || def.services.some(s => c.services.includes(s)) || c.provider !== 'google' && c.provider !== 'meta'))
  // un import de fichier ou une adresse entrante n'est jamais une « connexion » au compte de l'outil
  if (def.connector === 'csv') return { label: 'Import de fichier', tone: 'bg-sky-100 text-sky-700', conns: cs.access.use ? conns : [] }
  if (def.connector === 'webhook' && def.key !== 'webhook') return { label: conns.length ? 'Via webhook entrant' : 'Webhook à configurer', tone: 'bg-sky-100 text-sky-700', conns: [] }
  if (conns.some(c => c.status === 'connecte')) return { label: 'Connecté', tone: 'bg-emerald-100 text-emerald-700', conns }
  if (conns.some(c => c.status === 'reconnexion')) return { label: 'À reconnecter', tone: 'bg-amber-100 text-amber-800', conns }
  if (conns.some(c => c.status === 'erreur')) return { label: 'Erreur', tone: 'bg-rose-100 text-rose-700', conns }
  if (!cs.access.use) return { label: 'Non autorisé', tone: 'bg-slate-100 text-slate-500', conns }
  if (!cs.ready.ok) return { label: 'Pas encore activé', tone: 'bg-slate-100 text-slate-500', conns }
  return { label: 'Non connecté', tone: 'bg-slate-100 text-slate-600', conns }
}

function openBeside(url: string) {
  // fenêtre à côté d'ImmoPilot : l'agent garde son espace ouvert
  const w = Math.min(1100, Math.round(screen.availWidth * 0.55))
  window.open(url, 'immopilot-outil', `popup=yes,width=${w},height=${screen.availHeight},left=${screen.availWidth - w},top=0`)
}

function Apps({ ov, reload }: { ov: Overview; reload: () => void }) {
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<IntegrationDef | null>(null)
  const [modal, setModal] = useState<ReactNode>(null)
  const list = INTEGRATIONS.map(d => ({ d, s: statusOf(d, ov) })).filter((x): x is { d: IntegrationDef; s: Status } => !!x.s && (!q || `${x.d.name} ${x.d.category}`.toLowerCase().includes(q.toLowerCase())))
  const cats = [...new Set(list.map(x => x.d.category))]
  const cs = (k?: ConnectorKey) => ov.connectors.find(c => c.key === k)

  const connect = (d: IntegrationDef, mode: 'user' | 'agency' = 'user', reconnectId?: string) => {
    const k = d.connector!
    if (k === 'crea' || k === 'ics') return setModal(<CredentialsModal provider={k} mode={mode} id={reconnectId} onClose={() => { setModal(null); reload() }} />)
    if (k === 'csv') return setModal(<ImportModal source={d.name} onClose={() => { setModal(null); reload() }} />)
    if (k === 'webhook') return setModal(<WebhookModal id={reconnectId} onClose={() => { setModal(null); reload() }} />)
    startOAuth(k, mode, reconnectId)
  }

  return (
    <div>
      <MyConnections ov={ov} reload={reload} onReconnect={(c) => { const d = INTEGRATIONS.find(i => i.connector === c.provider)!; connect(d, c.mode, c.id) }} onAction={(c) => setModal(<ActionModal conn={c} onClose={() => setModal(null)} />)} />
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="input pl-9" placeholder="Rechercher une application…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {cats.map(cat => (
        <section key={cat} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.filter(x => x.d.category === cat).map(({ d, s }) => {
              const c = cs(d.connector)
              const canConnect = !!c && c.access.use && c.ready.ok && (s.label !== 'Connecté' || d.connector === 'csv') && !(d.connector === 'webhook' && d.key !== 'webhook' && !ov.admin)
              return (
                <div key={d.key} className="card flex flex-col gap-2 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">{d.domain ? <img src={logoUrl(d.domain, 64)} alt="" className="h-6 w-6" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} /> : <Webhook size={18} className="text-slate-500" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{d.name}</div>
                      <div className="flex flex-wrap gap-1"><span className={`badge ${s.tone}`}>{s.label}</span>{d.impl === 'connecteur_approbation' && s.label !== 'Connecté' && <span className="badge bg-violet-50 text-violet-700" title={d.blockers.join(' ')}>Approbation du fournisseur</span>}</div>
                    </div>
                  </div>
                  {s.conns.length > 0 && <div className="text-xs text-slate-500">{s.conns.map(x => `${x.account || x.label}${x.mode === 'agency' ? ' (agence)' : ''} · ${d.connector === 'csv' ? 'dernier import' : 'actualisé'} ${ago(x.lastSuccessAt)}`).join(' — ')}</div>}
                  {c && !c.access.use && <div className="text-[11px] text-slate-500">{c.access.reason}</div>}
                  {c && c.access.use && !c.ready.ok && <div className="text-[11px] text-slate-500">En attente de la configuration par la plateforme.</div>}
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {canConnect && <button className="btn-primary py-1 text-xs" onClick={() => connect(d, c!.modes.includes('user') ? 'user' : 'agency')}>{d.connector === 'csv' ? <><FileUp size={13} /> Importer un fichier</> : d.connector === 'webhook' ? <><Webhook size={13} /> Créer l’adresse</> : <><Link2 size={13} /> Connecter</>}</button>}
                    {canConnect && ov.admin && d.connector !== 'csv' && c!.modes.includes('agency') && c!.modes.includes('user') && <button className="btn-outline py-1 text-xs" onClick={() => connect(d, 'agency')}>Compte partagé</button>}
                    {d.url && <button className="btn-ghost py-1 text-xs" onClick={() => setModal(<OpenTool def={d} onClose={() => setModal(null)} />)}><ExternalLink size={13} /> Ouvrir</button>}
                    <button className="btn-ghost py-1 text-xs" onClick={() => setDetail(d)}><BookOpen size={13} /> Détails</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
      {detail && <DetailModal d={detail} onClose={() => setDetail(null)} />}
      {modal}
    </div>
  )
}

function MyConnections({ ov, reload, onReconnect, onAction }: { ov: Overview; reload: () => void; onReconnect: (c: Conn) => void; onAction: (c: Conn) => void }) {
  const mine = ov.connections.filter(c => c.mine || c.mode === 'agency')
  if (!mine.length) return (
    <div className="mb-5 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 p-4 text-sm text-slate-700">
      <b>Reliez vos outils une seule fois.</b> Choisissez « Connecter » sur les applications que vous utilisez : vous autorisez l’accès directement chez le fournisseur (ImmoPilot ne voit jamais vos mots de passe). Ensuite, le bouton « Actualiser » du tableau de bord et la synchronisation automatique font le reste.
    </div>
  )
  const run = async (fn: () => Promise<unknown>, confirmText?: string) => { if (confirmText && !confirm(confirmText)) return; try { await fn(); reload() } catch (e) { alert((e as Error).message) } }
  return (
    <section className="card mb-5 overflow-x-auto">
      <h2 className="px-4 pt-3 font-semibold">Mes connexions</h2>
      <table className="w-full">
        <thead><tr><th className="th">Application</th><th className="th">Compte</th><th className="th">État</th><th className="th">Dernière actualisation</th><th className="th"></th></tr></thead>
        <tbody>
          {mine.map(c => (
            <tr key={c.id}>
              <td className="td font-medium">{c.label}{c.mode === 'agency' && <span className="badge ml-1 bg-sky-50 text-sky-700">agence</span>}</td>
              <td className="td text-xs">{c.account}</td>
              <td className="td text-xs"><ConnStatus c={c} /></td>
              <td className="td text-xs">{c.lastSuccessAt ? ago(c.lastSuccessAt) : '—'}</td>
              <td className="td">
                <div className="flex flex-wrap justify-end gap-1">
                  {(c.status === 'reconnexion' || c.status === 'deconnecte' || c.status === 'erreur') && c.mine && <button className="btn-primary py-1 text-xs" onClick={() => onReconnect(c)}><RefreshCw size={12} /> Reconnecter</button>}
                  {c.status === 'connecte' && Object.keys(ACTION_FORMS[c.provider] ?? {}).length > 0 && (c.mine || ov.admin) && <button className="btn-outline py-1 text-xs" onClick={() => onAction(c)}><Send size={12} /> Actions</button>}
                  {c.status !== 'deconnecte' && (c.mine || ov.admin) && <button className="btn-ghost py-1 text-xs text-rose-600" onClick={() => run(() => disconnect(c.id), `Déconnecter ${c.label} ? Les données déjà importées restent dans ImmoPilot.`)}><LogOut size={12} /> Déconnecter</button>}
                  {c.status === 'deconnecte' && (c.mine || ov.admin) && <button className="btn-ghost py-1 text-xs" onClick={() => run(() => removeConnection(c.id))}><Trash2 size={12} /> Retirer</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
function ConnStatus({ c }: { c: Connection }) {
  const map = { connecte: ['Connecté', 'text-emerald-700', CheckCircle2], reconnexion: ['À reconnecter', 'text-amber-700', AlertTriangle], erreur: ['Erreur', 'text-rose-700', XCircle], deconnecte: ['Déconnecté', 'text-slate-500', XCircle], en_attente: ['En attente', 'text-slate-500', Loader2] } as const
  const [label0, cls, Icon] = map[c.status]
  const label = c.status === 'connecte' && (c.provider === 'csv' || c.provider === 'webhook') ? 'Actif' : label0
  return <span className={`inline-flex items-center gap-1 ${cls}`} title={c.statusDetail || c.lastError}><Icon size={13} /> {label}{(c.status !== 'connecte' && (c.statusDetail || c.lastError)) ? <span className="max-w-56 truncate text-slate-500"> — {c.statusDetail || c.lastError}</span> : null}</span>
}

// ---------------- ouverture d'un outil : intégré si le site le permet, sinon fenêtre à côté ----------------
function OpenTool({ def, onClose }: { def: IntegrationDef; onClose: () => void }) {
  const [check, setCheck] = useState<{ embeddable: boolean; reason: string } | null>(null)
  const [inline, setInline] = useState(false)
  useEffect(() => { embedCheck(def.key).then(setCheck).catch(e => setCheck({ embeddable: false, reason: (e as Error).message })) }, [def.key])
  return (
    <Modal title={def.name} onClose={onClose} wide footer={<><button className="btn-ghost" onClick={onClose}>Fermer</button><button className="btn-primary" onClick={() => { openBeside(def.url); onClose() }}><ExternalLink size={14} /> Ouvrir dans une fenêtre à côté</button></>}>
      {!check ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Vérification de l’affichage intégré autorisé par {def.name}…</p> : (
        <div className="space-y-3 text-sm">
          <p className={check.embeddable ? 'text-emerald-700' : 'text-slate-600'}>{check.embeddable ? '✓ ' : ''}{check.reason}</p>
          <p className="text-xs text-slate-500">{def.embed.note}</p>
          {check.embeddable && !inline && <button className="btn-outline" onClick={() => setInline(true)}>Afficher dans ImmoPilot</button>}
          {check.embeddable && inline && <iframe src={def.url} title={def.name} className="h-[70vh] w-full rounded-lg border" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />}
        </div>
      )}
    </Modal>
  )
}

function DetailModal({ d, onClose }: { d: IntegrationDef; onClose: () => void }) {
  const g = guideFor({ name: d.name, url: d.url, key: d.key })
  const row = (label: string, v: string[] | string) => (Array.isArray(v) ? v.length > 0 : !!v) && <div><h3 className="mb-0.5 text-xs font-semibold uppercase text-slate-500">{label}</h3>{Array.isArray(v) ? <ul className="list-disc pl-5 text-slate-700">{v.map(x => <li key={x}>{x}</li>)}</ul> : <p className="text-slate-700">{v}</p>}</div>
  const c = d.connector ? CONNECTORS[d.connector] : null
  return (
    <Modal title={d.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1"><span className="badge bg-brand-50 text-brand-700">{IMPL_LABEL[d.impl]}</span>{d.method.map(m => <span key={m} className="badge bg-slate-100">{METHOD_LABEL[m]}</span>)}</div>
        <p className="text-slate-700">{d.implNote}</p>
        {row('Accès nécessaires', d.access)}
        {row('Données lues', d.read)}
        {row('Données modifiables', d.write)}
        {row('Statistiques', d.stats)}
        {row('Actions (avec confirmation)', d.actions.map(a => `${a.label} — ${a.detail}`))}
        {row('Affichage dans ImmoPilot', d.embed.note)}
        {row('Automatisation', d.automation.note)}
        {c && row('Maintien de la connexion', c.refresh)}
        {row('Blocages externes', d.blockers)}
        {g && <div className="rounded-lg bg-slate-50 p-3"><h3 className="mb-1 font-semibold">Guide d’utilisation</h3><p className="mb-1 text-slate-600">{g.what}</p><ol className="list-decimal pl-5 text-slate-600">{g.how.map(x => <li key={x}>{x}</li>)}</ol></div>}
        {d.docs.length > 0 && <p className="text-xs text-slate-400">Documentation : {d.docs.map(u => <a key={u} className="mr-2 underline" href={u} target="_blank" rel="noreferrer">{new URL(u).hostname}</a>)}</p>}
      </div>
    </Modal>
  )
}

// ---------------- connexions par identifiants / fichier / webhook ----------------
function CredentialsModal({ provider, mode, id, onClose }: { provider: 'crea' | 'ics'; mode: 'user' | 'agency'; id?: string; onClose: () => void }) {
  const [f, setF] = useState({ url: '', clientId: '', clientSecret: '', label: '' })
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const submit = async () => { setBusy(true); setErr(''); try { await connectKey({ provider, mode, id, ...f }); onClose() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  return (
    <Modal title={provider === 'crea' ? 'Connecter CREA DDF®' : 'Abonnement d’agenda (.ics)'} onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Loader2 size={14} className="animate-spin" />} Vérifier et connecter</button></>}>
      <div className="space-y-3 text-sm">
        {provider === 'ics' ? <>
          <p className="text-slate-600">Collez l’adresse privée d’abonnement (.ics ou webcal://) fournie par votre agenda (ex. iCloud « Calendrier public », Outlook « Publier un calendrier »). Elle est vérifiée puis chiffrée; elle n’est plus jamais affichée.</p>
          <Field label="Adresse de l’agenda"><input className="input" autoComplete="off" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="webcal://…" /></Field>
        </> : <>
          <p className="text-slate-600">Dans le portail DDF® de CREA (REALTOR Link® → Data Distribution Facility), créez un flux « Mes inscriptions » ou « Mon bureau », puis copiez ses identifiants. Ils sont vérifiés auprès de CREA puis chiffrés.</p>
          <Field label="Identifiant client (Client ID)"><input className="input" autoComplete="off" value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value })} /></Field>
          <Field label="Secret client (Client Secret)"><input className="input" type="password" autoComplete="new-password" value={f.clientSecret} onChange={e => setF({ ...f, clientSecret: e.target.value })} /></Field>
        </>}
        <Field label="Nom affiché (facultatif)"><input className="input" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /></Field>
        {err && <p className="text-rose-600">{err}</p>}
      </div>
    </Modal>
  )
}

function ImportModal({ source: init, onClose }: { source: string; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [source, setSource] = useState(init.replace(/ \(.*\)$/, ''))
  const [kind, setKind] = useState<'contacts' | 'listings'>('contacts')
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const submit = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await importRows(kind, source, rows)
      const st = r.run?.jobs[0]?.stats
      setMsg(`✓ ${r.lignes} ligne(s) traitée(s)${st ? ` : ${st.created} nouvelle(s), ${st.updated} mise(s) à jour, ${st.unchanged} déjà à jour, ${st.review} à vérifier` : ' (traitement en cours)'}.`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Importer un fichier CSV" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Fermer</button><button className="btn-primary" disabled={!rows.length || busy} onClick={submit}>{busy && <Loader2 size={14} className="animate-spin" />} Importer {rows.length || ''} ligne(s)</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Exportez vos données depuis l’outil (Prospects, Mon Prospecteur, Rechat, ActivePipe…) puis déposez le fichier. Les fiches sont rapprochées par courriel, téléphone, n° Centris ou adresse : réimporter le même fichier ne crée pas de doublon.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source"><input className="input" value={source} onChange={e => setSource(e.target.value)} /></Field>
          <Field label="Type"><select className="input" value={kind} onChange={e => setKind(e.target.value as 'contacts')}><option value="contacts">Contacts</option><option value="listings">Inscriptions</option></select></Field>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={async e => { const f = e.target.files?.[0]; if (f) setRows(parseCsv(await f.text())) }} />
        {rows.length > 0 && <p className="text-xs text-slate-500">Colonnes : {Object.keys(rows[0]).join(', ')}</p>}
        {msg && <p className={msg.startsWith('✓') ? 'text-emerald-700' : 'text-rose-600'}>{msg}</p>}
      </div>
    </Modal>
  )
}

function WebhookModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const [label, setLabel] = useState('Zapier')
  const [res, setRes] = useState<{ url: string; token: string } | null>(null)
  const [err, setErr] = useState('')
  return (
    <Modal title="Adresse de webhook entrant" onClose={onClose} footer={<button className="btn-primary" onClick={onClose}>Terminé</button>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Pour les outils sans connecteur direct : configurez-y l’envoi de vos données (nouveau prospect, rendez-vous, événement de signature…) vers cette adresse. Chaque envoi passe par le même rapprochement que les autres connecteurs.</p>
        {!res ? <>
          <Field label="Nom"><input className="input" value={label} onChange={e => setLabel(e.target.value)} /></Field>
          <button className="btn-primary" onClick={() => createWebhook(label, id).then(setRes).catch(e => setErr((e as Error).message))}><Plus size={14} /> {id ? 'Régénérer le jeton' : 'Créer l’adresse'}</button>
        </> : <>
          <Field label="Adresse (POST, JSON)"><input className="input font-mono text-xs" readOnly value={res.url} onFocus={e => e.target.select()} /></Field>
          <Field label="En-tête Authorization (affiché une seule fois)"><input className="input font-mono text-xs" readOnly value={`Bearer ${res.token}`} onFocus={e => e.target.select()} /></Field>
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">{`{ "type": "lead", "id": "123", "data": { "name": "Jean Tremblay", "email": "jean@exemple.com", "phone": "514 555-0000", "source": "Formulaire site" } }`}</pre>
          <p className="text-xs text-amber-700">Copiez le jeton maintenant : seule son empreinte est conservée.</p>
        </>}
        {err && <p className="text-rose-600">{err}</p>}
      </div>
    </Modal>
  )
}

// ---------------- actions confirmées ----------------
const ACTION_FORMS: Partial<Record<ConnectorKey, Record<string, { label: string; fields: [string, string][] }>>> = {
  mailchimp: { addMember: { label: 'Ajouter un contact à une audience', fields: [['email', 'Courriel'], ['firstName', 'Prénom'], ['lastName', 'Nom'], ['listId', 'Identifiant de l’audience']] }, sendCampaign: { label: 'Envoyer une campagne prête', fields: [['campaignId', 'Identifiant de la campagne']] } },
  meta: { publishPage: { label: 'Publier sur la Page Facebook', fields: [['message', 'Texte'], ['link', 'Lien (facultatif)'], ['pageId', 'Id de la Page (facultatif)']] } },
  linkedin: { publish: { label: 'Publier sur LinkedIn', fields: [['text', 'Texte']] } },
  calendly: { cancel: { label: 'Annuler un rendez-vous', fields: [['eventId', 'Identifiant du rendez-vous'], ['reason', 'Motif']] } },
}
function ActionModal({ conn, onClose }: { conn: Conn; onClose: () => void }) {
  const forms = ACTION_FORMS[conn.provider] ?? {}
  const [act, setAct] = useState(Object.keys(forms)[0] ?? '')
  const [params, setParams] = useState<Record<string, string>>({})
  const [prep, setPrep] = useState<{ preview: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const clean = () => Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  const go = async (fn: () => Promise<void>) => { setBusy(true); setMsg(''); try { await fn() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }
  return (
    <Modal title={`Actions — ${conn.label}`} onClose={onClose} footer={<>
      <button className="btn-ghost" onClick={onClose}>Annuler</button>
      {!prep ? <button className="btn-primary" disabled={busy} onClick={() => go(async () => setPrep(await prepareAction(conn.id, act, clean())))}>Vérifier avant d’envoyer</button>
        : <button className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={busy} onClick={() => go(async () => { const r = await executeAction(conn.id, act, clean(), prep.token); setMsg('✓ ' + r.summary); setPrep(null) })}>Je confirme</button>}
    </>}>
      <div className="space-y-3 text-sm">
        <Field label="Action"><select className="input" value={act} onChange={e => { setAct(e.target.value); setPrep(null) }}>{Object.entries(forms).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></Field>
        {forms[act]?.fields.map(([k, l]) => <Field key={k} label={l}>{k === 'message' || k === 'text' ? <textarea className="input" value={params[k] ?? ''} onChange={e => { setParams({ ...params, [k]: e.target.value }); setPrep(null) }} /> : <input className="input" value={params[k] ?? ''} onChange={e => { setParams({ ...params, [k]: e.target.value }); setPrep(null) }} />}</Field>)}
        {prep && <div className="whitespace-pre-wrap rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"><b>À confirmer :</b> {prep.preview}</div>}
        {msg && <p className={msg.startsWith('✓') ? 'text-emerald-700' : 'text-rose-600'}>{msg}</p>}
      </div>
    </Modal>
  )
}

// ---------------- administration ----------------
const FREQ: [number, string][] = [[0, 'Manuelle / webhooks'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [180, '3 h'], [360, '6 h'], [720, '12 h'], [1440, '1 jour']]
function Admin({ ov, reload }: { ov: Overview; reload: () => void }) {
  const [p, setP] = useState<AgencyPolicy>(ov.policy!)
  const [saving, setSaving] = useState(false), [msg, setMsg] = useState('')
  const [history, setHistory] = useState<SyncRun[] | null>(null)
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof getAudit>> | null>(null)
  useEffect(() => { void syncHistory().then(h => setHistory(h.history)).catch(() => setHistory([])) }, [])
  const setProv = (k: ConnectorKey, patch: Partial<AgencyPolicy['providers'][ConnectorKey] & object>) => setP(x => ({ ...x, providers: { ...x.providers, [k]: { ...x.providers[k]!, ...patch } } }))
  const toggleRole = (list: Role[], r: Role) => (list.includes(r) ? list.filter(x => x !== r) : [...list, r])
  const save = async () => { setSaving(true); setMsg(''); try { const r = await savePolicy(p); setP(r.policy); setMsg('✓ Réglages enregistrés (appliqués par le serveur à chaque accès).'); reload() } catch (e) { setMsg((e as Error).message) } finally { setSaving(false) } }
  const offered = new Set(ov.offered)
  const others = ov.connections
  return (
    <div className="space-y-5">
      <section className="card overflow-x-auto">
        <h2 className="flex items-center gap-2 px-4 pt-3 font-semibold"><Settings2 size={16} /> Applications, rôles et fréquences</h2>
        <p className="px-4 text-xs text-slate-500">Rôles « voit » = l’application apparaît; « utilise » = peut la connecter et agir. Désactiver une application déconnecte immédiatement les comptes reliés.</p>
        <table className="w-full text-xs">
          <thead><tr><th className="th">Application</th><th className="th">Active</th><th className="th">Voit</th><th className="th">Utilise</th><th className="th">Comptes</th><th className="th">Fréquence</th><th className="th">Services</th></tr></thead>
          <tbody>{(Object.keys(CONNECTORS) as ConnectorKey[]).filter(k => offered.has(k)).map(k => {
            const x = p.providers[k]!, c = CONNECTORS[k]
            return (
              <tr key={k}>
                <td className="td font-medium">{c.name}</td>
                <td className="td"><Toggle on={x.enabled} onChange={v => setProv(k, { enabled: v })} /></td>
                <td className="td">{ALL_ROLES.map(r => <label key={r} className="mr-1 inline-flex items-center gap-0.5"><input type="checkbox" checked={x.visibleRoles.includes(r)} onChange={() => setProv(k, { visibleRoles: toggleRole(x.visibleRoles, r) })} />{ROLES[r].split(' ')[0]}</label>)}</td>
                <td className="td">{ALL_ROLES.map(r => <label key={r} className="mr-1 inline-flex items-center gap-0.5"><input type="checkbox" disabled={r === 'admin'} checked={x.useRoles.includes(r)} onChange={() => setProv(k, { useRoles: toggleRole(x.useRoles, r) })} />{ROLES[r].split(' ')[0]}</label>)}</td>
                <td className="td">{c.modes.map(m => <label key={m} className="mr-2 inline-flex items-center gap-0.5"><input type="checkbox" checked={x.accountModes.includes(m)} onChange={() => setProv(k, { accountModes: x.accountModes.includes(m) ? x.accountModes.filter(y => y !== m) : [...x.accountModes, m] })} />{m === 'user' ? 'individuels' : 'partagé'}</label>)}</td>
                <td className="td">{c.defaultEveryMin || c.webhooks ? <select className="input py-0.5 text-xs" value={x.everyMin} onChange={e => setProv(k, { everyMin: +e.target.value })}>{FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : '—'}</td>
                <td className="td">{c.services.length > 1 ? c.services.map(s => <label key={s.key} className="mr-2 inline-flex items-center gap-0.5" title={s.approval ?? ''}><input type="checkbox" checked={!!x.services[s.key]} onChange={() => setProv(k, { services: { ...x.services, [s.key]: !x.services[s.key] } })} />{s.label.split(' (')[0].split(' —')[0]}</label>) : '—'}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Actions automatiques permises</h2>
          <p className="mb-2 text-xs text-slate-500">Les données importantes (prix, superficie, identité, montants, dates contractuelles) et les contradictions vont toujours dans « À vérifier ».</p>
          {(Object.keys(AUTO_ACTIONS) as AutoAction[]).map(k => <label key={k} className="flex items-center gap-2 py-1"><Toggle on={p.auto[k]} onChange={v => setP({ ...p, auto: { ...p.auto, [k]: v } })} /> {AUTO_ACTIONS[k]}</label>)}
        </section>
        <section className="card p-4 text-sm">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={16} /> Assistant IA</h2>
          {!ov.ai.configured && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">La clé OpenAI de la plateforme n’est pas encore configurée : l’assistant sera disponible dès qu’elle le sera.</p>}
          <label className="flex items-center gap-2 py-1"><Toggle on={p.ai.enabled} onChange={v => setP({ ...p, ai: { ...p.ai, enabled: v } })} /> Assistant activé pour l’agence</label>
          <div className="py-1 text-xs">Rôles : {ALL_ROLES.map(r => <label key={r} className="mr-2 inline-flex items-center gap-0.5"><input type="checkbox" checked={p.ai.roles.includes(r)} onChange={() => setP({ ...p, ai: { ...p.ai, roles: toggleRole(p.ai.roles, r) } })} />{ROLES[r]}</label>)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Données accessibles à l’IA</div>
          <div className="grid grid-cols-2 gap-x-2 text-xs">{(Object.keys(AI_COLLECTIONS) as AiCollection[]).map(k => <label key={k} className="flex items-center gap-1 py-0.5"><input type="checkbox" checked={p.ai.collections[k]} onChange={() => setP({ ...p, ai: { ...p.ai, collections: { ...p.ai.collections, [k]: !p.ai.collections[k] } } })} />{AI_COLLECTIONS[k]}</label>)}</div>
          <label className="mt-2 flex items-center gap-2 py-1"><Toggle on={p.ai.autoAnalyze} onChange={v => setP({ ...p, ai: { ...p.ai, autoAnalyze: v } })} /> Résumé IA après chaque synchronisation (consomme du budget)</label>
          <Field label="Budget mensuel (jetons)"><input className="input" type="number" value={p.ai.monthlyTokenBudget} onChange={e => setP({ ...p, ai: { ...p.ai, monthlyTokenBudget: +e.target.value } })} /></Field>
        </section>
      </div>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={saving} onClick={save}>{saving && <Loader2 size={14} className="animate-spin" />} Enregistrer les réglages</button>{msg && <span className={`text-sm ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-rose-600'}`}>{msg}</span>}</div>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Comptes reliés des membres</h2>
        <table className="w-full text-xs">
          <thead><tr><th className="th">Membre</th><th className="th">Application</th><th className="th">Compte</th><th className="th">État</th><th className="th">Dernière réussite</th><th className="th"></th></tr></thead>
          <tbody>{others.map(c => (
            <tr key={c.id}><td className="td">{c.mode === 'agency' ? 'Agence' : c.ownerName}</td><td className="td">{c.label}</td><td className="td">{c.account}</td><td className="td"><ConnStatus c={c} /></td><td className="td">{ago(c.lastSuccessAt)}</td>
              <td className="td text-right">{c.status === 'connecte' && <button className="btn-ghost py-0.5 text-xs" onClick={async () => { await askReconnect(c.id); reload() }}>Demander de reconnecter</button>}</td></tr>
          ))}{!others.length && <tr><td className="td text-slate-400" colSpan={6}>Aucun compte relié pour l’instant.</td></tr>}</tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Historique des synchronisations</h2>
        {!history ? <Loader2 className="m-4 animate-spin text-slate-400" /> : (
          <table className="w-full text-xs">
            <thead><tr><th className="th">Début</th><th className="th">Déclencheur</th><th className="th">Résultat</th><th className="th">Détail</th></tr></thead>
            <tbody>{history.map(r => (
              <tr key={r.id}><td className="td">{new Date(r.startedAt).toLocaleString('fr-CA')}</td><td className="td">{r.trigger}</td><td className="td">{r.state}</td>
                <td className="td">{r.jobs.map(j => `${j.label} : ${j.state}${j.stats ? ` (+${j.stats.created}, ~${j.stats.updated}, ?${j.stats.review})` : ''}${j.error ? ` — ${j.error}` : ''}`).join(' · ')}</td></tr>
            ))}{!history.length && <tr><td className="td text-slate-400" colSpan={4}>Aucune synchronisation.</td></tr>}</tbody>
          </table>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Journal d’activité vérifiable</h2><button className="btn-outline py-1 text-xs" onClick={() => getAudit().then(setAudit)}>Afficher le mois en cours</button></div>
        {audit && <>
          <p className="my-2 text-xs text-slate-500">{audit.total} entrée(s) · intégrité de la chaîne : <b className={audit.integrity === 'intact' ? 'text-emerald-700' : 'text-rose-700'}>{audit.integrity}</b></p>
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">{audit.entries.map(e => <li key={e.id} className="flex gap-2"><span className="w-32 shrink-0 text-slate-400">{new Date(e.at).toLocaleString('fr-CA')}</span><span className="badge shrink-0 bg-slate-100">{e.kind}</span><span className="text-slate-500">{e.actorName ?? e.actor}</span><span>{e.summary}</span></li>)}</ul>
        </>}
      </section>
    </div>
  )
}

// ---------------- matrice ----------------
function Matrix() {
  const [q, setQ] = useState('')
  const rows = useMemo(() => INTEGRATIONS.filter(i => !q || `${i.name} ${i.category} ${i.impl}`.toLowerCase().includes(q.toLowerCase())), [q])
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Table2 size={16} className="text-slate-500" /><input className="input max-w-xs" placeholder="Filtrer…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr>{['Application', 'Connexion', 'Accès nécessaires', 'Données lues', 'Modifiables / actions', 'Statistiques', 'Affichage dans ImmoPilot', 'Automatisation', 'État', 'Blocages externes'].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{rows.map(i => (
            <tr key={i.key} className="align-top">
              <td className="td font-semibold">{i.name}</td>
              <td className="td">{i.method.map(m => METHOD_LABEL[m]).join(', ')}</td>
              <td className="td">{i.access.join(' · ') || '—'}</td>
              <td className="td">{i.read.join(' · ') || '—'}</td>
              <td className="td">{[...i.write, ...i.actions.map(a => `${a.label} (${a.risk})`)].join(' · ') || '—'}</td>
              <td className="td">{i.stats.join(' · ') || '—'}</td>
              <td className="td">{i.embed.note}</td>
              <td className="td">{i.automation.note}</td>
              <td className="td">{IMPL_LABEL[i.impl]}</td>
              <td className="td">{i.blockers.join(' · ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- liens et comptes de l'agence (fonctionnalité existante conservée) ----------------
function AgencyLinks() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Platform | null>(null)
  const list = db.platforms.filter(p => !q || `${p.name} ${p.usage} ${p.category} ${p.account}`.toLowerCase().includes(q.toLowerCase()))
  const cats = [...new Set(list.map(p => p.category))]
  const favicon = (url: string) => { try { return logoUrl(new URL(url).hostname, 64) } catch { return '' } }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input className="input pl-9" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="btn-primary" onClick={() => setEditing({ id: uid(), name: '', url: '', category: 'Autre', account: '', notes: '', usage: '' })}><Plus size={16} /> Lien</button>
      </div>
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">🔐 Ne conservez <b>jamais de mots de passe</b> ici. Le champ « compte » sert à noter quel identifiant utiliser. Ces liens ne sont pas des connexions : pour relier un outil, utilisez l’onglet « Mes applications ».</div>
      {cats.map(cat => (
        <section key={cat} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.filter(p => p.category === cat).map(p => (
              <div key={p.id} className="card group flex items-start gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">{p.url ? <img src={favicon(p.url)} alt="" className="h-6 w-6" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span>🔗</span>}</div>
                <div className="min-w-0 flex-1">
                  {p.url ? <button onClick={() => openBeside(p.url)} className="flex items-center gap-1 truncate font-semibold hover:text-brand-700">{p.name}<ExternalLink size={12} className="shrink-0 text-slate-400" /></button> : <span className="truncate font-semibold">{p.name}</span>}
                  <div className="text-xs text-slate-500">{p.usage}</div>
                  {p.account && <div className="mt-1 truncate text-xs"><span className="text-slate-400">Compte :</span> {p.account}</div>}
                </div>
                <button className="btn-ghost p-1 opacity-0 group-hover:opacity-100" onClick={() => setEditing(p)}><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {editing && <PlatformForm p={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlatformForm({ p: init, onClose }: { p: Platform; onClose: () => void }) {
  const { db, upsert, remove } = useStore()
  const [p, setP] = useState(init)
  const set = <K extends keyof Platform>(k: K, v: Platform[K]) => setP(x => ({ ...x, [k]: v }))
  const exists = db.platforms.some(x => x.id === p.id)
  return (
    <Modal title={exists ? p.name : 'Nouveau lien'} onClose={onClose}
      footer={<>
        {exists && <button className="btn-ghost mr-auto text-rose-600" onClick={() => { remove('platforms', p.id); onClose() }}><Trash2 size={15} /> Retirer</button>}
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { if (p.name) { upsert('platforms', p); onClose() } }}>Enregistrer</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom"><input className="input" value={p.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Catégorie"><input className="input" list="pcats" value={p.category} onChange={e => set('category', e.target.value)} />
          <datalist id="pcats">{[...new Set(db.platforms.map(x => x.category))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="URL de connexion" className="sm:col-span-2"><input className="input" value={p.url} onChange={e => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Compte / identifiant utilisé (pas de mot de passe)" className="sm:col-span-2"><input className="input" value={p.account} onChange={e => set('account', e.target.value)} /></Field>
        <Field label="Utilisation" className="sm:col-span-2"><input className="input" value={p.usage} onChange={e => set('usage', e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" value={p.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
