// Règles comptables et fiscales (Québec / Canada) pour les courtiers et agences.
// Les catégories de dépenses sont associées aux lignes du formulaire T2125 (ARC) — l'équivalent
// québécois est le TP-80 (Revenu Québec). Montants à titre indicatif : à valider avec un comptable.
import type { AcctYear, Invoice, LedgerEntry, Owner, Trip } from './types'
import { TPS, TVQ, uid } from './utils'

export interface Cat { id: string; label: string; line: string; pct?: number; taxable?: boolean; vehicle?: boolean }
export const REVENUE_CATS: Cat[] = [
  { id: 'commission', label: 'Commissions (rétribution)', line: '8000', taxable: true },
  { id: 'referencement', label: 'Honoraires de référencement', line: '8000', taxable: true },
  { id: 'services', label: 'Honoraires de services (consultation, gestion)', line: '8000', taxable: true },
  { id: 'redevances', label: 'Redevances et parts d’agence reçues', line: '8000', taxable: true },
  { id: 'autres_revenus', label: 'Autres revenus', line: '8230', taxable: false },
]
export const EXPENSE_CATS: Cat[] = [
  { id: 'publicite', label: 'Publicité et marketing', line: '8521', taxable: true },
  { id: 'mise_en_valeur', label: 'Photographie, pancartes et mise en valeur', line: '8521', taxable: true },
  { id: 'repas', label: 'Repas et frais de représentation', line: '8523', pct: 50, taxable: true },
  { id: 'assurances', label: 'Assurances (responsabilité, bureau)', line: '8690', taxable: false },
  { id: 'interets', label: 'Intérêts et frais bancaires', line: '8710', taxable: false },
  { id: 'cotisations', label: 'Cotisations, permis et droits (OACIQ, APCIQ, FARCIQ)', line: '8760', taxable: false },
  { id: 'redevances_agence', label: 'Redevances à l’agence / bannière', line: '8871', taxable: true },
  { id: 'bureau', label: 'Frais de bureau', line: '8810', taxable: true },
  { id: 'fournitures', label: 'Fournitures', line: '8811', taxable: true },
  { id: 'honoraires', label: 'Honoraires professionnels (comptable, juridique)', line: '8860', taxable: true },
  { id: 'loyer', label: 'Loyer', line: '8910', taxable: true },
  { id: 'entretien', label: 'Entretien et réparations', line: '8960', taxable: true },
  { id: 'salaires', label: 'Salaires et avantages (adjointe)', line: '9060', taxable: false },
  { id: 'deplacements', label: 'Déplacements (stationnement, transport, hébergement)', line: '9200', taxable: true },
  { id: 'telecom', label: 'Téléphone, Internet et services publics', line: '9220', taxable: true },
  { id: 'vehicule', label: 'Frais de véhicule (essence, entretien, assurance, location)', line: '9281', taxable: true, vehicle: true },
  { id: 'logiciels', label: 'Logiciels et abonnements', line: '9270', taxable: true },
  { id: 'formation', label: 'Formation continue', line: '9270', taxable: true },
  { id: 'cadeaux', label: 'Cadeaux clients', line: '9270', taxable: true },
  { id: 'autres', label: 'Autres dépenses', line: '9270', taxable: true },
]
export const LINE_LABEL: Record<string, string> = {
  '8000': 'Revenus bruts d’entreprise', '8230': 'Autres revenus', '8521': 'Publicité', '8523': 'Repas et frais de représentation (50 %)', '8690': 'Assurances',
  '8710': 'Intérêts et frais bancaires', '8760': 'Taxes d’affaires, droits d’adhésion et permis', '8810': 'Frais de bureau', '8811': 'Fournitures de bureau',
  '8860': 'Frais comptables et juridiques', '8871': 'Frais de gestion et d’administration', '8910': 'Loyer', '8960': 'Entretien et réparations',
  '9060': 'Salaires et avantages', '9200': 'Frais de déplacement', '9220': 'Services publics et télécommunications', '9281': 'Frais de véhicule à moteur', '9270': 'Autres dépenses',
}
export const PAYMENT_METHODS = ['Carte de crédit', 'Carte de débit', 'Virement', 'Chèque', 'Comptant', 'Prélèvement']
export const catOf = (e: Pick<LedgerEntry, 'kind' | 'category'>) => (e.kind === 'revenu' ? REVENUE_CATS : EXPENSE_CATS).find(c => c.id === e.category)
export const round2 = (n: number) => Math.round(n * 100) / 100
export const taxesFor = (amount: number, taxable = true) => (taxable ? { tps: round2(amount * TPS), tvq: round2(amount * TVQ) } : { tps: 0, tvq: 0 })

export function newEntry(ownerId: Owner, createdBy: string, p: Partial<LedgerEntry> = {}): LedgerEntry {
  return { id: uid(), kind: 'depense', date: new Date().toISOString().slice(0, 10), ownerId, category: 'publicite', description: '', counterpart: '', amount: 0, tps: 0, tvq: 0, deductiblePct: 100, paymentMethod: 'Carte de crédit', receipts: [], dealId: '', invoiceId: '', createdBy, ...p }
}

// ---------- Devis et factures ----------
export function invoiceTotals(i: Pick<Invoice, 'lines' | 'discountPct' | 'taxable'>) {
  const subtotal = round2(i.lines.reduce((s, l) => s + round2((l.qty || 0) * (l.price || 0)), 0))
  const discount = round2(subtotal * (i.discountPct || 0) / 100)
  const net = round2(subtotal - discount)
  const { tps, tvq } = taxesFor(net, i.taxable)
  return { subtotal, discount, net, tps, tvq, total: round2(net + tps + tvq) }
}
export const paid = (i: Invoice) => round2(i.payments.reduce((s, p) => s + p.amount, 0))
export function nextNumber(list: Invoice[], kind: Invoice['kind'], ownerId: Owner) {
  const year = new Date().getFullYear()
  const prefix = `${kind === 'devis' ? 'DEV' : 'FAC'}-${year}-`
  const n = list.filter(x => x.kind === kind && x.ownerId === ownerId && x.number.startsWith(prefix)).map(x => parseInt(x.number.slice(prefix.length)) || 0)
  return prefix + String(Math.max(0, ...n) + 1).padStart(3, '0')
}
export const INVOICE_STATUS: Record<Invoice['status'], [string, string]> = {
  brouillon: ['Brouillon', 'bg-slate-100'], envoye: ['Envoyé', 'bg-sky-100 text-sky-700'], accepte: ['Accepté', 'bg-emerald-100 text-emerald-700'], refuse: ['Refusé', 'bg-rose-100 text-rose-700'],
  paye: ['Payée', 'bg-emerald-600 text-white'], partiel: ['Partiellement payée', 'bg-amber-100 text-amber-800'], annule: ['Annulé', 'bg-slate-200'],
}

// ---------- Déclarations ----------
export interface Period { from: string; to: string; label: string }
export function periods(year: number): Period[] {
  const q = (n: number) => ({ from: `${year}-${String(n * 3 - 2).padStart(2, '0')}-01`, to: `${year}-${String(n * 3).padStart(2, '0')}-${n === 1 || n === 4 ? '31' : '30'}`, label: `T${n} ${year}` })
  return [{ from: `${year}-01-01`, to: `${year}-12-31`, label: `Année ${year}` }, q(1), q(2), q(3), q(4)]
}
export const inPeriod = (d: string, p: Period) => d >= p.from && d <= p.to

export function declaration(entries: LedgerEntry[], trips: Trip[], year: AcctYear | undefined, p: Period) {
  const list = entries.filter(e => inPeriod(e.date, p))
  const rev = list.filter(e => e.kind === 'revenu')
  const dep = list.filter(e => e.kind === 'depense')
  const businessKm = trips.filter(t => inPeriod(t.date, p)).reduce((s, t) => s + (t.km || 0), 0)
  const vehiclePct = year?.totalKm ? Math.min(100, round2((businessKm / year.totalKm) * 100)) : 0
  const revenueByCat = REVENUE_CATS.map(c => ({ c, total: round2(rev.filter(e => e.category === c.id).reduce((s, e) => s + e.amount, 0)) })).filter(x => x.total)
  const lines = new Map<string, { line: string; label: string; gross: number; deductible: number; items: number }>()
  const itc = { tps: 0, tvq: 0 }
  for (const e of dep) {
    const c = catOf(e)
    const line = c?.line ?? '9270'
    const pct = (c?.vehicle ? vehiclePct : e.deductiblePct ?? 100) / 100
    const cur = lines.get(line) ?? { line, label: LINE_LABEL[line] ?? line, gross: 0, deductible: 0, items: 0 }
    cur.gross = round2(cur.gross + e.amount)
    cur.deductible = round2(cur.deductible + e.amount * pct)
    cur.items++
    lines.set(line, cur)
    itc.tps = round2(itc.tps + e.tps * pct)
    itc.tvq = round2(itc.tvq + e.tvq * pct)
  }
  const totalRevenue = round2(rev.reduce((s, e) => s + e.amount, 0))
  const totalDeductible = round2([...lines.values()].reduce((s, l) => s + l.deductible, 0))
  const collected = { tps: round2(rev.reduce((s, e) => s + e.tps, 0)), tvq: round2(rev.reduce((s, e) => s + e.tvq, 0)) }
  return {
    period: p, entries: list, revenueByCat, totalRevenue, expenseLines: [...lines.values()].sort((a, b) => a.line.localeCompare(b.line)), totalDeductible,
    netIncome: round2(totalRevenue - totalDeductible), businessKm, vehiclePct, collected, itc,
    remit: { tps: round2(collected.tps - itc.tps), tvq: round2(collected.tvq - itc.tvq) },
    missingReceipts: dep.filter(e => !e.receipts.length),
  }
}
