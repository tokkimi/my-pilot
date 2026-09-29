// Assistant IA ImmoPilot — API OpenAI configurée côté serveur par la plateforme (OPENAI_API_KEY).
// Aucun compte ChatGPT n'est demandé aux agents. L'IA ne reçoit que :
//   • les données de SON agence, filtrées selon le rôle et les réglages de l'administrateur;
//   • une liste blanche de champs (jamais de jetons, mots de passe, secrets ni URL privées);
//   • la provenance et la date de chaque information.
// Elle propose; un humain valide. Toute requête et toute validation est journalisée.
import { randomBytes } from 'node:crypto'
import { mutate, readJson } from './storage.js'
import { agencyDb, loadUsers, type User } from './platform.js'
import { audit } from './audit.js'
import { redact } from './vault.js'
import { call } from './http.js'
import { loadPolicy, roleOf } from './policy.js'
import type { AgencyPolicy, AiCollection, SourceRef, SyncRun } from '../src/lib/integrations/types.js'

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const aiModel = () => process.env.OPENAI_MODEL || 'gpt-5-mini'
const usagePath = (a: string) => `agencies/${a}/ai/usage.json`
const proposalsPath = (a: string) => `agencies/${a}/ai/proposals.json`
const month = () => new Date().toISOString().slice(0, 7)

export interface Proposal { id: string; createdAt: string; by: string; type: 'task'; title: string; due: string; priority: 'basse' | 'normale' | 'haute'; contactId: string; listingId: string; dealId: string; reason: string; status: 'proposee' | 'acceptee' | 'rejetee'; decidedBy?: string }
export interface Answer { answer: string; sources: { ref: string; source: string; date: string }[]; proposals: Proposal[]; usage: { tokens: number; budgetLeft: number }; model: string }

// ---------- contexte ----------
const FIELDS: Record<string, string[]> = {
  contacts: ['id', 'type', 'firstName', 'lastName', 'email', 'phone', 'city', 'stage', 'source', 'ownerId', 'budget', 'criteria', 'motivation', 'timeline', 'lastContact', 'createdAt', 'birthday', 'closingDate', 'tags'],
  activities: ['id', 'contactId', 'kind', 'date', 'summary', 'memberId'],
  listings: ['id', 'address', 'city', 'centris', 'propertyType', 'price', 'status', 'agentId', 'mandateStart', 'mandateEnd', 'bedrooms', 'bathrooms', 'livingArea', 'lot', 'soldPrice', 'soldDate', 'createdAt', 'extDocs'],
  deals: ['id', 'kind', 'title', 'listingId', 'contactIds', 'agentId', 'price', 'status', 'dates', 'createdAt', 'docsDue', 'extDocs'],
  tasks: ['id', 'title', 'due', 'done', 'priority', 'assigneeId', 'category', 'contactId', 'listingId', 'dealId'],
  events: ['id', 'title', 'start', 'end', 'type', 'location', 'contactId', 'listingId', 'agentId'],
  showings: ['id', 'listingId', 'date', 'interest', 'rating', 'priceOpinion', 'feedback'],
  posts: ['id', 'date', 'platforms', 'format', 'caption', 'status'],
  campaigns: ['id', 'provider', 'kind', 'title', 'date', 'metrics'],
  metrics: ['id', 'provider', 'label', 'value', 'unit', 'at'],
}
const MONEY_FIELDS = new Set(['price', 'soldPrice', 'budget'])
const LIMITS: Record<string, number> = { contacts: 250, activities: 200, listings: 120, deals: 120, tasks: 200, events: 150, showings: 80, posts: 60, campaigns: 60, metrics: 80 }

function slim(coll: string, e: Doc, finance: boolean) {
  const o: Doc = {}
  for (const f of FIELDS[coll]) {
    if (e[f] === undefined || e[f] === '' || (Array.isArray(e[f]) && !e[f].length)) continue
    if (!finance && MONEY_FIELDS.has(f)) continue
    o[f] = f === 'extDocs' ? (e.extDocs as Doc[]).map(d => `${d.name} (${d.provider}, modifié ${String(d.modifiedAt).slice(0, 10)})`) : e[f]
  }
  // provenance : d'où vient la fiche et quand elle a été lue; champs importés avec leur source et date
  const src = (e._src as SourceRef[] | undefined)?.map(s => `${s.p}@${s.at.slice(0, 16)}`)
  if (src?.length) o._sources = src
  const prov = e._prov as Record<string, { p: string; at: string }> | undefined
  if (prov) o._champs = Object.fromEntries(Object.entries(prov).filter(([f]) => FIELDS[coll].includes(f)).map(([f, v]) => [f, `${v.p}@${v.at.slice(0, 10)}`]))
  return o
}

/** Contexte autorisé pour cet utilisateur. `focus` restreint à un dossier (et ses liens). */
export function buildContext(doc: Doc, u: Pick<User, 'id' | 'role'>, policy: AgencyPolicy, focus?: { coll: string; id: string }) {
  const allow = (c: AiCollection) => policy.ai.collections[c]
  const finance = allow('finance')
  const out: Doc = { agence: doc.agency?.name ?? '', aujourdhui: new Date().toISOString().slice(0, 10), membres: (doc.members ?? []).map((m: Doc) => ({ id: m.id, nom: m.name, role: m.role })) }
  let related: Set<string> | null = null
  if (focus) {
    const e = (doc[focus.coll] ?? []).find((x: Doc) => x.id === focus.id)
    related = new Set([focus.id, ...(e?.contactIds ?? []), ...(e?.sellerIds ?? []), e?.listingId, e?.contactId].filter(Boolean))
    for (const d of doc.deals ?? []) if (related.has(d.listingId) || d.contactIds?.some((c: string) => related!.has(c))) related.add(d.id)
  }
  const inFocus = (e: Doc) => !related || related.has(e.id) || related.has(e.contactId) || related.has(e.listingId) || related.has(e.dealId) || (e.contactIds ?? []).some((c: string) => related!.has(c))
  for (const coll of Object.keys(FIELDS)) {
    const key = coll as AiCollection
    if (!allow(key)) continue
    let list: Doc[] = doc[coll] ?? []
    if (coll === 'activities') list = list.filter(a => !a.private || (allow('communications') && a.memberId === u.id))
    list = list.filter(inFocus)
    list = [...list].sort((a, b) => String(b.date ?? b.start ?? b.createdAt ?? b.due ?? '').localeCompare(String(a.date ?? a.start ?? a.createdAt ?? a.due ?? ''))).slice(0, LIMITS[coll])
    if (list.length) out[coll] = list.map(e => slim(coll, e, finance))
  }
  return redact(out)
}

// ---------- budget ----------
async function tokensUsed(agencyId: string) { return (await readJson<Record<string, number>>(usagePath(agencyId))).data?.[month()] ?? 0 }
async function addTokens(agencyId: string, n: number) { await mutate<Record<string, number>>(usagePath(agencyId), () => ({}), u => ({ ...u, [month()]: (u[month()] ?? 0) + n })) }
const hits = new Map<string, { n: number; t: number }>()
function rateOk(userId: string) {
  const h = hits.get(userId)
  if (h && Date.now() - h.t < 3600000) { if (h.n >= 40) return false; h.n++; return true }
  hits.set(userId, { n: 1, t: Date.now() })
  return true
}

// ---------- appel OpenAI (Responses API, sortie JSON structurée) ----------
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'sources', 'proposals'],
  properties: {
    answer: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ref', 'source', 'date'], properties: { ref: { type: 'string' }, source: { type: 'string' }, date: { type: 'string' } } } },
    proposals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'due', 'priority', 'contactId', 'listingId', 'dealId', 'reason'], properties: {
      title: { type: 'string' }, due: { type: 'string' }, priority: { type: 'string', enum: ['basse', 'normale', 'haute'] }, contactId: { type: 'string' }, listingId: { type: 'string' }, dealId: { type: 'string' }, reason: { type: 'string' } } } },
  },
}
const INSTRUCTIONS = `Tu es l’assistant d’ImmoPilot, un espace de travail pour agences immobilières du Québec. Réponds en français québécois professionnel, de façon concise.
Règles absolues :
- Utilise UNIQUEMENT les données JSON fournies. Si une information manque, dis-le clairement; n’invente jamais un chiffre, une date, un nom ou une superficie.
- Chaque fiche peut porter « _sources » (outil@date de lecture) et « _champs » (provenance par champ). Quand tu cites un fait importé, indique sa source et sa date. Les données sans source viennent d’ImmoPilot.
- Signale les incohérences et les informations possiblement périmées (date de lecture ancienne).
- Dans « sources », liste les fiches utilisées : ref = "<collection>:<id>", source = outil ou "ImmoPilot", date = date de l’information.
- Dans « proposals », propose seulement des tâches utiles et concrètes (0 à 5), avec une échéance AAAA-MM-JJ et les id des fiches liées ("" si aucune). Elles ne seront créées qu’après validation humaine.
- Tu ne peux ni envoyer de courriel, ni publier, ni signer, ni dépenser : tu peux seulement préparer et proposer.`

async function openai(input: string, maxTokens = 1800): Promise<{ json: { answer: string; sources: Answer['sources']; proposals: Omit<Proposal, 'id' | 'createdAt' | 'by' | 'type' | 'status'>[] }; tokens: number }> {
  const r = await call<{ output?: { type: string; content?: { type: string; text?: string }[] }[]; output_text?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }>(`${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`, {
    provider: 'openai', method: 'POST', retries: 1, headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    json: { model: aiModel(), instructions: INSTRUCTIONS, input, max_output_tokens: maxTokens, store: false, text: { format: { type: 'json_schema', name: 'reponse_immopilot', strict: true, schema: SCHEMA } } },
  })
  const text = r.output_text ?? r.output?.filter(o => o.type === 'message').flatMap(o => o.content ?? []).find(c => c.type === 'output_text')?.text ?? ''
  let json
  try { json = JSON.parse(text) } catch { json = { answer: text || 'Réponse vide du modèle.', sources: [], proposals: [] } }
  return { json, tokens: r.usage?.total_tokens ?? (r.usage?.input_tokens ?? 0) + (r.usage?.output_tokens ?? 0) }
}

export async function ask(agencyId: string, u: User, question: string, focus?: { coll: string; id: string }): Promise<Answer> {
  const policy = await loadPolicy(agencyId)
  if (!rateOk(u.id)) throw new Error('Limite de requêtes IA atteinte pour l’heure. Réessayez plus tard.')
  const used = await tokensUsed(agencyId)
  if (used >= policy.ai.monthlyTokenBudget) throw new Error('Budget IA mensuel de l’agence atteint (réglable par l’administrateur).')
  const { data } = await readJson<Doc>(agencyDb(agencyId))
  const members = (await loadUsers()).filter(x => x.agencyId === agencyId && x.active).map(x => ({ id: x.id, name: x.name, role: x.role }))
  const ctx = buildContext({ ...(data ?? {}), members }, u, policy, focus)
  const q = redact(String(question).slice(0, 2000))
  const { json, tokens } = await openai(`Rôle de l’utilisateur : ${roleOf(u)} (id ${u.id}).\nQuestion : ${q}\n\nDonnées autorisées (JSON) :\n${JSON.stringify(ctx)}`)
  await addTokens(agencyId, tokens)
  const now = new Date().toISOString()
  const proposals: Proposal[] = (json.proposals ?? []).slice(0, 5).map(p => ({ ...p, id: 'pr_' + randomBytes(6).toString('base64url'), createdAt: now, by: u.id, type: 'task', status: 'proposee', due: /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : now.slice(0, 10) }))
  if (proposals.length) await mutate<Proposal[]>(proposalsPath(agencyId), () => [], l => [...l, ...proposals].slice(-500))
  await audit(agencyId, [{ kind: 'ia_requete', actor: u.id, actorName: u.name, summary: `Question à l’IA${focus ? ` (dossier ${focus.coll}:${focus.id})` : ''} — ${tokens} jetons, ${proposals.length} proposition(s)`, detail: { question: q.slice(0, 300), model: aiModel() } }])
  return { answer: json.answer, sources: json.sources ?? [], proposals, usage: { tokens, budgetLeft: Math.max(0, policy.ai.monthlyTokenBudget - used - tokens) }, model: aiModel() }
}

/** Validation humaine d'une proposition : crée la tâche (sans doublon) ou la rejette. */
export async function decide(agencyId: string, u: User, id: string, accept: boolean) {
  let prop: Proposal | undefined
  await mutate<Proposal[]>(proposalsPath(agencyId), () => [], l => l.map(p => (p.id === id && p.status === 'proposee' ? (prop = { ...p, status: accept ? 'acceptee' : 'rejetee', decidedBy: u.id }) : p)))
  if (!prop) throw new Error('Proposition introuvable ou déjà traitée.')
  const p = prop as Proposal
  if (accept) {
    const key = `ai:${p.id}`
    await mutate<Doc>(agencyDb(agencyId), () => ({}), d => {
      if ((d.tasks ?? []).some((t: Doc) => t.key === key)) return d
      const task = { id: 'ta_' + randomBytes(6).toString('base64url'), key, title: p.title.slice(0, 200), due: p.due, done: false, priority: p.priority, assigneeId: u.id, category: 'Suivi', contactId: p.contactId, listingId: p.listingId, dealId: p.dealId, notes: `Proposée par l’assistant IA : ${p.reason}`, _src: [{ p: 'assistant-ia', c: 'openai', x: p.id, at: new Date().toISOString() }] }
      return { ...d, tasks: [task, ...(d.tasks ?? [])] }
    })
  }
  await audit(agencyId, [{ kind: accept ? 'validation' : 'rejet', actor: u.id, actorName: u.name, coll: 'tasks', summary: `Proposition IA ${accept ? 'acceptée' : 'rejetée'} : ${p.title}` }])
  return p
}

export async function listProposals(agencyId: string, u: User) {
  return ((await readJson<Proposal[]>(proposalsPath(agencyId))).data ?? []).filter(p => p.status === 'proposee' && p.by === u.id).slice(-30)
}

/** Analyse après synchronisation (si activée) : résumé et points d'attention, dans le budget. */
export async function autoAnalyze(agencyId: string, run: SyncRun): Promise<{ summary: string; insights: string[] } | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const policy = await loadPolicy(agencyId)
  if (!policy.ai.enabled || !policy.ai.autoAnalyze) return null
  if ((await tokensUsed(agencyId)) >= policy.ai.monthlyTokenBudget * 0.8) return null // garde 20 % pour les questions des agents
  const lines = run.jobs.map(j => `${j.label} : ${j.state}${j.stats ? ` (nouveaux ${j.stats.created}, mis à jour ${j.stats.updated}, à vérifier ${j.stats.review}, supprimés ${j.stats.deleted})` : ''}${j.error ? ` — erreur : ${j.error}` : ''}`)
  const { json, tokens } = await openai(`Résume en 2 phrases la synchronisation ci-dessous pour l’équipe (« answer »), puis au plus 3 points d’attention, un par ligne commençant par « - », à la suite dans « answer ». Laisse « sources » et « proposals » vides.\n${redact(lines.join('\n'))}`, 500)
  await addTokens(agencyId, tokens)
  const parts = String(json.answer ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  return { summary: parts.filter(p => !p.startsWith('-')).join(' '), insights: parts.filter(p => p.startsWith('-')).map(p => p.replace(/^-\s*/, '')).slice(0, 3) }
}
