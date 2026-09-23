import { tr } from '../lib/i18n'
import { useState, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import type { PageProps } from '../App'
import { useStore } from '../lib/store'
import { Field, PageHeader, Tabs } from '../lib/ui'
import { money, pct, TPS, TVQ } from '../lib/utils'

type Tab = 'bilan' | 'commission' | 'mutation' | 'hypotheque' | 'plex'

export default function Tools(_: PageProps) {
  const [tab, setTab] = useState<Tab>('bilan')
  return (
    <div>
      <PageHeader title={tr("Calculateurs")} subtitle="Bilan du vendeur, rétribution, taxe de bienvenue, hypothèque, rendement plex" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[['bilan', 'Bilan du vendeur'], ['commission', 'Rétribution & partage'], ['mutation', 'Taxe de bienvenue'], ['hypotheque', 'Hypothèque'], ['plex', 'Rendement plex']]} />
      {tab === 'bilan' && <Bilan />}
      {tab === 'commission' && <Commission />}
      {tab === 'mutation' && <Mutation />}
      {tab === 'hypotheque' && <Mortgage />}
      {tab === 'plex' && <Plex />}
    </div>
  )
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return <Field label={label}><input className="input" type="number" step={step} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(+e.target.value)} /></Field>
}
function Row({ label, value, strong, neg }: { label: string; value: ReactNode; strong?: boolean; neg?: boolean }) {
  return <div className={`flex justify-between border-b border-slate-100 py-1.5 text-sm ${strong ? 'text-base font-bold' : ''}`}><span>{label}</span><span className={neg ? 'text-rose-600' : ''}>{value}</span></div>
}
function Result({ children }: { children: ReactNode }) { return <div className="card p-4">{children}</div> }

function Bilan() {
  const { db, me } = useStore()
  const [v, setV] = useState({ client: '', propriete: '', prix: 600000, solde: 250000, pctRet: 5, penalite: 0, quittance: 1000, certificat: 1500, assurance: 0, autres: 0 })
  const s = <K extends keyof typeof v>(k: K) => (x: (typeof v)[K]) => setV({ ...v, [k]: x })
  const ret = v.prix * v.pctRet / 100
  const retTx = ret * (1 + TPS + TVQ)
  const debours = v.penalite + v.quittance + v.certificat + v.assurance + v.autres
  const poche = v.prix - v.solde - retTx - debours
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Client vendeur"><input className="input" value={v.client} onChange={e => s('client')(e.target.value)} /></Field>
        <Field label="Propriété"><input className="input" value={v.propriete} onChange={e => s('propriete')(e.target.value)} /></Field>
        <Num label="Prix de vente" value={v.prix} onChange={s('prix')} step={1000} />
        <Num label="Solde hypothécaire" value={v.solde} onChange={s('solde')} step={1000} />
        <Num label="% de rétribution (+ taxes)" value={v.pctRet} onChange={s('pctRet')} step={0.25} />
        <Num label="Pénalité hypothécaire (s’il y a lieu)" value={v.penalite} onChange={s('penalite')} step={100} />
        <Num label="Quittance hypothécaire" value={v.quittance} onChange={s('quittance')} step={50} />
        <Num label="Certificat de localisation" value={v.certificat} onChange={s('certificat')} step={50} />
        <Num label="Assurance titre" value={v.assurance} onChange={s('assurance')} step={50} />
        <Num label="Autres" value={v.autres} onChange={s('autres')} step={50} />
      </div>
      <Result>
        <div id="bilan">
          <h2 className="mb-1 text-lg font-bold">Bilan du vendeur</h2>
          <div className="mb-3 text-sm text-slate-500">{v.client} {v.propriete && `— ${v.propriete}`}</div>
          <Row label="Prix de vente" value={money(v.prix)} />
          <Row label="Solde hypothécaire" value={`− ${money(v.solde)}`} neg />
          <Row label={`Rétribution ${pct(v.pctRet)} (${money(ret)}) + TPS/TVQ`} value={`− ${money(retTx)}`} neg />
          <div className="mt-2 text-xs font-semibold uppercase text-slate-500">Détails des déboursés</div>
          <Row label="Pénalité" value={`− ${money(v.penalite)}`} neg />
          <Row label="Quittance hypothécaire" value={`− ${money(v.quittance)}`} neg />
          <Row label="Certificat de localisation" value={`− ${money(v.certificat)}`} neg />
          <Row label="Assurance titre" value={`− ${money(v.assurance)}`} neg />
          <Row label="Autres" value={`− ${money(v.autres)}`} neg />
          <Row label="Total en poche" value={money(poche)} strong />
          <p className="mt-3 text-xs text-slate-500">* Les montants sont des approximations et ne correspondent pas nécessairement aux montants finaux. — {me.name}, {db.agency.name}</p>
        </div>
        <button className="btn-outline no-print mt-3" onClick={() => window.print()}><Printer size={15} /> Imprimer</button>
      </Result>
    </div>
  )
}

function Commission() {
  const [v, setV] = useState({ prix: 600000, pctTotal: 5, pctCollab: 2.5, agence: 30, frais: 0 })
  const s = <K extends keyof typeof v>(k: K) => (x: number) => setV({ ...v, [k]: x })
  const total = v.prix * v.pctTotal / 100
  const collab = v.prix * v.pctCollab / 100
  const inscr = total - collab
  const agence = inscr * v.agence / 100
  const net = inscr - agence - v.frais
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <Num label="Prix de vente" value={v.prix} onChange={s('prix')} step={1000} />
        <Num label="Rétribution totale %" value={v.pctTotal} onChange={s('pctTotal')} step={0.25} />
        <Num label="Part courtier collaborateur %" value={v.pctCollab} onChange={s('pctCollab')} step={0.25} />
        <Num label="Part agence / bannière %" value={v.agence} onChange={s('agence')} />
        <Num label="Frais fixes de transaction" value={v.frais} onChange={s('frais')} step={50} />
      </div>
      <Result>
        <Row label="Rétribution totale" value={money(total, 2)} />
        <Row label="TPS + TVQ sur rétribution" value={money(total * (TPS + TVQ), 2)} />
        <Row label="Courtier collaborateur" value={money(collab, 2)} />
        <Row label="Courtier inscripteur (brut)" value={money(inscr, 2)} />
        <Row label="Part agence" value={`− ${money(agence, 2)}`} neg />
        <Row label="Frais" value={`− ${money(v.frais, 2)}`} neg />
        <Row label="Net courtier (avant impôts)" value={money(net, 2)} strong />
        <p className="mt-3 text-xs text-slate-500">Technique FBI : proposer au vendeur de bonifier la part du collaborateur pour mobiliser le réseau. Valider les pourcentages avec les règles de l’agence et de l’OACIQ.</p>
      </Result>
    </div>
  )
}

// Barèmes 2025 des droits de mutation — à valider chaque année (indexés au 1er janvier).
const QC: [number, number][] = [[61500, 0.005], [307800, 0.01], [Infinity, 0.015]]
const MTL: [number, number][] = [[61500, 0.005], [307800, 0.01], [552300, 0.015], [1104700, 0.02], [2136500, 0.025], [3113000, 0.035], [Infinity, 0.04]]
function brackets(base: number, table: [number, number][]) {
  let prev = 0, total = 0
  const lines: { from: number; to: number; rate: number; amount: number }[] = []
  for (const [lim, rate] of table) {
    if (base <= prev) break
    const part = Math.min(base, lim) - prev
    total += part * rate
    lines.push({ from: prev, to: Math.min(base, lim), rate, amount: part * rate })
    prev = lim
  }
  return { total, lines }
}

function Mutation() {
  const [base, setBase] = useState(550000)
  const [city, setCity] = useState<'qc' | 'mtl'>('qc')
  const r = brackets(base, city === 'qc' ? QC : MTL)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card grid gap-3 p-4">
        <Num label="Base d’imposition (le plus élevé : prix, évaluation municipale × facteur comparatif)" value={base} onChange={setBase} step={1000} />
        <Field label="Municipalité"><select className="input" value={city} onChange={e => setCity(e.target.value as 'qc' | 'mtl')}><option value="qc">Québec — barème général (Laval, Rive-Nord, etc.)</option><option value="mtl">Ville de Montréal</option></select></Field>
        <p className="text-xs text-slate-500">Barèmes 2025. Les tranches sont indexées chaque année et certaines municipalités ont des taux supplémentaires : valider auprès de la municipalité ou du notaire.</p>
      </div>
      <Result>
        {r.lines.map((l, i) => <Row key={i} label={`${money(l.from)} à ${money(l.to)} × ${pct(l.rate * 100)}`} value={money(l.amount, 2)} />)}
        <Row label="Droits de mutation estimés" value={money(r.total, 2)} strong />
      </Result>
    </div>
  )
}

function Mortgage() {
  const [v, setV] = useState({ prix: 550000, miseDeFonds: 10, taux: 4.49, amort: 25, freq: 12 })
  const s = <K extends keyof typeof v>(k: K) => (x: number) => setV({ ...v, [k]: x })
  const down = v.prix * v.miseDeFonds / 100
  const loan = v.prix - down
  const premRate = v.miseDeFonds >= 20 ? 0 : v.miseDeFonds >= 15 ? 0.028 : v.miseDeFonds >= 10 ? 0.031 : v.miseDeFonds >= 5 ? 0.04 : NaN
  const prem = loan * (premRate || 0)
  const principal = loan + prem
  // Taux canadien : capitalisation semestrielle
  const eff = Math.pow(1 + v.taux / 100 / 2, 2 / v.freq) - 1
  const n = v.amort * v.freq
  const pay = eff === 0 ? principal / n : principal * eff / (1 - Math.pow(1 + eff, -n))
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <Num label="Prix d’achat" value={v.prix} onChange={s('prix')} step={1000} />
        <Num label="Mise de fonds %" value={v.miseDeFonds} onChange={s('miseDeFonds')} step={0.5} />
        <Num label="Taux d’intérêt %" value={v.taux} onChange={s('taux')} step={0.01} />
        <Num label="Amortissement (années)" value={v.amort} onChange={s('amort')} />
        <Field label="Fréquence"><select className="input" value={v.freq} onChange={e => s('freq')(+e.target.value)}><option value={12}>Mensuelle</option><option value={26}>Aux 2 semaines</option><option value={52}>Hebdomadaire</option></select></Field>
      </div>
      <Result>
        <Row label="Mise de fonds" value={money(down)} />
        <Row label="Montant du prêt" value={money(loan)} />
        {Number.isNaN(premRate) ? <p className="py-2 text-sm text-rose-600">Mise de fonds minimale de 5 % requise.</p> : <>
          <Row label={`Prime d’assurance prêt (${pct(premRate * 100)})`} value={money(prem)} />
          <Row label="TVQ sur la prime (9 %, payable comptant)" value={money(prem * 0.09)} />
          <Row label="Paiement" value={money(pay, 2)} strong />
          <Row label="Intérêts totaux (sur l’amortissement)" value={money(pay * n - principal)} />
        </>}
        <p className="mt-3 text-xs text-slate-500">Estimation (capitalisation semestrielle). Référer au courtier hypothécaire partenaire pour une préapprobation.</p>
      </Result>
    </div>
  )
}

function Plex() {
  const [v, setV] = useState({ prix: 1200000, revenus: 72000, vacance: 3, depenses: 22000 })
  const s = <K extends keyof typeof v>(k: K) => (x: number) => setV({ ...v, [k]: x })
  const effectifs = v.revenus * (1 - v.vacance / 100)
  const rne = effectifs - v.depenses
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <Num label="Prix" value={v.prix} onChange={s('prix')} step={1000} />
        <Num label="Revenus bruts annuels" value={v.revenus} onChange={s('revenus')} step={100} />
        <Num label="Vacance / mauvaises créances %" value={v.vacance} onChange={s('vacance')} step={0.5} />
        <Num label="Dépenses d’exploitation annuelles" value={v.depenses} onChange={s('depenses')} step={100} />
      </div>
      <Result>
        <Row label="Revenus bruts effectifs" value={money(effectifs)} />
        <Row label="Revenu net d’exploitation (RNE)" value={money(rne)} />
        <Row label="Taux global d’actualisation (TGA)" value={pct(v.prix ? (rne / v.prix) * 100 : 0)} strong />
        <Row label="Multiplicateur de revenu brut (MRB)" value={v.revenus ? (v.prix / v.revenus).toFixed(2) : '—'} />
        <Row label="Ratio des dépenses" value={pct(effectifs ? (v.depenses / effectifs) * 100 : 0)} />
      </Result>
    </div>
  )
}
