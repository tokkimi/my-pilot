import { locale } from './i18n'
import { isoDate } from './core.js'
export { uid, isoDate, isoDateTime, addDays } from './core.js'

export const money = (n: number | undefined, decimals = 0) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'CAD', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n || 0)

export const pct = (n: number) => `${(n || 0).toLocaleString(locale, { maximumFractionDigits: 2 })} %`

export const today = () => isoDate(new Date())

export function parseDate(s: string) {
  if (!s) return null
  const d = s.length === 10 ? new Date(s + 'T00:00') : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function fmtDate(s: string, withTime = false) {
  const d = parseDate(s)
  if (!d) return '—'
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

export function daysUntil(s: string) {
  const d = parseDate(s)
  if (!d) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  return Math.round((x.getTime() - t.getTime()) / 86400000)
}

/** Nombre de jours avant la prochaine occurrence annuelle (fête, anniversaire d'achat). */
export function daysToAnniversary(s: string) {
  const d = parseDate(s)
  if (!d) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const next = new Date(t.getFullYear(), d.getMonth(), d.getDate())
  if (next < t) next.setFullYear(t.getFullYear() + 1)
  return Math.round((next.getTime() - t.getTime()) / 86400000)
}

export const fullName = (c?: { firstName: string; lastName: string }) => (c ? `${c.firstName} ${c.lastName}`.trim() : '—')

export function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== '' ? vars[k] : m))
}

export function download(filename: string, content: string, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const esc = (v: unknown) => `"${String(Array.isArray(v) ? v.join(', ') : v ?? '').replace(/"/g, '""')}"`
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
}

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

// Taxes Québec
export const TPS = 0.05
export const TVQ = 0.09975

/** Redimensionne une image (logo, justificatif) et renvoie une data URL. */
export async function resizeImage(file: Blob, max = 400, type = 'image/png', quality = 0.9): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL(type, quality)
  } finally { URL.revokeObjectURL(url) }
}

/** Imprime (ou enregistre en PDF) un élément de la page avec les styles de l'application. */
export function printElement(id: string, title: string) {
  const el = document.getElementById(id)
  const w = window.open('', '_blank')
  if (!el || !w) return
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(n => n.outerHTML).join('')
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><base href="${location.origin}/">${styles}<style>body{background:#fff;padding:24px}.no-print{display:none!important}@page{margin:14mm}</style></head><body>${el.innerHTML}</body></html>`)
  w.document.close()
  w.onload = () => setTimeout(() => w.print(), 300)
}

// Champs automatiques des modèles : stockés sous forme {cle}, affichés aux utilisateurs sous forme [Libellé]
export const VAR_LABELS: Record<string, string> = {
  prenom: 'Prénom du client', nom: 'Nom du client', adresse: 'Adresse', ville: 'Ville', prix: 'Prix', lien: 'Lien de la fiche',
  courtier: 'Votre nom', inspection: 'Date d’inspection', financement: 'Date de financement', acte: 'Date de l’acte',
  occupation: 'Date d’occupation', date: 'Date du jour', annee: 'Année', chambres: 'Nombre de chambres', sdb: 'Salles de bain',
}
export const toFriendly = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (VAR_LABELS[k] ? `[${VAR_LABELS[k]}]` : m))
export const fromFriendly = (s: string) => Object.entries(VAR_LABELS).reduce((t, [k, l]) => t.split(`[${l}]`).join(`{${k}}`), s)
export const unfilledFields = (s: string) => [...new Set(Object.values(VAR_LABELS).filter(l => s.includes(`[${l}]`)))]
