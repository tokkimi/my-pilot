import { currentUser, json, LEADS, loadUsers, loadAgencies, sameOrigin, trialExpired, type Lead } from '../server/platform.js'
import { mutate } from '../server/storage.js'
import { MONTHLY_PLANS } from '../src/lib/plans.js'

export async function GET(req: Request) {
  const user = await currentUser(req, true)
  if (!user) return json({ error: 'Non connecté.' }, 401)
  const agency = (await loadAgencies()).find(a => a.id === user.agencyId)
  const members = (await loadUsers()).filter(u => u.agencyId === user.agencyId && u.active).length
  return json({ agency, members, expired: trialExpired(agency), canManage: user.role === 'admin', plans: MONTHLY_PLANS, onlinePayment: false })
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  const user = await currentUser(req, true)
  if (!user) return json({ error: 'Non connecté.' }, 401)
  if (user.role !== 'admin') return json({ error: 'Contactez la direction de votre agence pour choisir un forfait.' }, 403)
  const body = await req.json().catch(() => ({}))
  const plan = MONTHLY_PLANS.find(p => p.id === body.plan)
  if (!plan && !['achat', 'entreprise'].includes(body.plan)) return json({ error: 'Forfait invalide.' }, 400)
  const agency = (await loadAgencies()).find(a => a.id === user.agencyId)
  if (!agency) return json({ error: 'Agence introuvable.' }, 404)
  const members = (await loadUsers()).filter(u => u.agencyId === user.agencyId && u.active).length
  if (plan && members > plan.seats) return json({ error: `Votre équipe compte ${members} membres actifs. Choisissez un forfait adapté.` }, 400)
  const id = `subscription_${agency.id}_${body.plan}`
  const lead: Lead = { id, name: user.name, email: user.email, phone: user.phone, agency: agency.name, role: 'Direction d’agence', agents: String(plan?.seats ?? ''), interest: plan ? `Abonnement mensuel — ${plan.name}` : body.plan === 'achat' ? 'Achat + installation sur demande' : 'Abonnement mensuel — plus de 25 membres', message: plan ? `${plan.price} CAD/mois hors taxes. Demande d’activation, aucun paiement prélevé.` : 'Demande de devis pour achat et installation.', createdAt: new Date().toISOString(), status: 'nouveau', notes: `Agence : ${agency.id}` }
  await mutate<Lead[]>(LEADS, () => [], list => list.some(l => l.id === id && l.status !== 'archive') ? list : [lead, ...list.filter(l => l.id !== id)])
  return json({ ok: true, pending: true })
}
