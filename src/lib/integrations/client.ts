// Appels du navigateur vers les API d'intégration. Aucun secret ne transite par ici (sauf la saisie
// d'identifiants, envoyée une seule fois au serveur qui la chiffre).
import type { AgencyPolicy, Connection, ReviewItem, SyncRun, SyncStatus } from './types'
import type { ConnectorKey } from './catalog'

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const b = await r.json().catch(() => ({}))
  if (r.status === 401) { location.href = '/connexion'; throw new Error('Session expirée') }
  if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`)
  return b as T
}

export interface ConnectorState { key: ConnectorKey; access: { see: boolean; use: boolean; reason: string }; ready: { ok: boolean; missing: string[] }; modes: ('user' | 'agency')[]; everyMin: number; services: string[] }
export interface Overview {
  connectors: ConnectorState[]; admin: boolean; me: string
  connections: (Connection & { ownerName: string; mine: boolean })[]
  policy: AgencyPolicy | null; offered: ConnectorKey[]
  ai: { configured: boolean; enabled: boolean }; maps: { key: string } | null; cron: boolean
}
export const getOverview = () => api<Overview>('/api/connect')
export const startOAuth = (provider: ConnectorKey, mode: 'user' | 'agency' = 'user', reconnect?: string) => {
  location.href = `/api/connect/start/${provider}?mode=${mode}${reconnect ? `&reconnect=${encodeURIComponent(reconnect)}` : ''}`
}
export const connectKey = (b: { provider: ConnectorKey; mode: 'user' | 'agency'; url?: string; clientId?: string; clientSecret?: string; label?: string; id?: string }) => api<{ ok: boolean }>('/api/connect', { action: 'connectKey', ...b })
export const disconnect = (id: string) => api('/api/connect', { action: 'disconnect', id })
export const removeConnection = (id: string) => api('/api/connect', { action: 'remove', id })
export const askReconnect = (id: string) => api('/api/connect', { action: 'askReconnect', id })
export const createWebhook = (label: string, id?: string) => api<{ url: string; token: string }>('/api/connect', { action: 'createWebhook', label, id })
export const importRows = (kind: 'contacts' | 'listings', source: string, rows: Record<string, string>[]) => api<{ lignes: number; run: SyncRun | null }>('/api/connect', { action: 'import', kind, source, rows })
export const prepareAction = (id: string, act: string, params: Record<string, unknown>) => api<{ preview: string; token: string }>('/api/connect', { action: 'prepare', id, act, params })
export const executeAction = (id: string, act: string, params: Record<string, unknown>, token: string) => api<{ summary: string }>('/api/connect', { action: 'execute', id, act, params, token, confirm: true })
export const savePolicy = (policy: Partial<AgencyPolicy>) => api<{ policy: AgencyPolicy }>('/api/connect', { action: 'policy', policy })
export const embedCheck = (key: string) => api<{ embeddable: boolean; reason: string; url: string }>(`/api/connect/embedcheck?key=${encodeURIComponent(key)}`)
export const getAudit = (month?: string) => api<{ entries: { id: string; at: string; kind: string; actorName?: string; actor: string; provider?: string; summary: string }[]; integrity: string; total: number }>(`/api/connect/audit${month ? `?month=${month}` : ''}`)

export const syncStatus = () => api<SyncStatus>('/api/sync')
export const refreshAll = () => api<SyncStatus & { message?: string }>('/api/sync', { action: 'refresh' })
export const syncStep = () => api<SyncStatus>('/api/sync', { action: 'step' })
export const getReviews = () => api<{ reviews: ReviewItem[] }>('/api/sync?action=reviews')
export const resolveReview = (id: string, accept: boolean) => api('/api/sync', { action: 'resolve', id, accept })
export const syncHistory = () => api<{ history: SyncRun[] }>('/api/sync?action=history')

export interface AiProposal { id: string; title: string; due: string; priority: string; reason: string; contactId: string; listingId: string; dealId: string }
export const aiStatus = () => api<{ available: boolean; reason: string; model: string; proposals: AiProposal[] }>('/api/ai')
export const aiAsk = (question: string, focus?: { coll: string; id: string }) => api<{ answer: string; sources: { ref: string; source: string; date: string }[]; proposals: AiProposal[]; usage: { tokens: number; budgetLeft: number }; model: string }>('/api/ai', { action: 'ask', question, focus })
export const aiDecide = (id: string, accept: boolean) => api('/api/ai', { action: 'decide', id, accept })

/** Analyse CSV simple (séparateur , ou ;, guillemets). */
export function parseCsv(text: string): Record<string, string>[] {
  const t = text.replace(/^﻿/, '')
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c; continue }
    if (c === '"') q = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()))
  if (!head) return []
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export const ago = (iso: string) => {
  if (!iso) return 'jamais'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'à l’instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}
