// Console des propriétaires de la plateforme (super-administrateurs).
import { randomBytes } from 'node:crypto'
import { ACTIVITY, AGENCIES, FINANCE, type PlatformEntry, agencyDb, currentUser, hashPassword, json, LEADS, loadAgencies, loadUsers, newUser, PLAN_SEATS, publicUser, sameOrigin, seedAgencyDb, uid, USERS, type Activity, type Agency, type Lead, type Plan, type User } from '../server/platform.js'
import { mutate, readJson, storageMode, StorageUnavailable, writeJson } from '../server/storage.js'
import type { DB } from '../src/lib/types.js'
import { googleConfigured } from '../server/google.js'

const tempPassword = () => 'IP-' + randomBytes(9).toString('base64url')

async function guard(req: Request) {
  const u = await currentUser(req)
  return u?.role === 'superadmin' ? u : null
}

export async function GET(req: Request) {
  try {
    if (!(await guard(req))) return json({ error: 'Accès réservé aux administrateurs de la plateforme.' }, 403)
    const [users, agencies, leads, activity] = await Promise.all([
      loadUsers(), loadAgencies(), readJson<Lead[]>(LEADS).then(r => r.data ?? []), readJson<Activity>(ACTIVITY).then(r => r.data ?? { days: {} }),
    ])
    const finance = (await readJson<PlatformEntry[]>(FINANCE)).data ?? []
    const usage = await Promise.all(agencies.map(async a => {
      const d = (await readJson<Partial<DB>>(agencyDb(a.id))).data ?? {}
      const visits = d.visits ?? []
      return {
        agencyId: a.id,
        contacts: d.contacts?.length ?? 0, listings: d.listings?.length ?? 0, deals: d.deals?.length ?? 0,
        tasks: d.tasks?.length ?? 0, visits: visits.length, events: d.events?.length ?? 0,
        visitsDone: visits.filter(v => v.status === 'terminee').length,
        media: visits.reduce((s, v) => s + (v.rooms ?? []).reduce((t, r) => t + (r.media?.length ?? 0), 0) + (v.voiceNotes?.length ?? 0) + (v.photos?.length ?? 0), 0),
      }
    }))
    return json({ users: users.map(publicUser), agencies, leads, activity, usage, finance, storage: storageMode(), email: await emailStatus(), google: { configured: googleConfigured(), picker: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_APP_ID), redirect: `${new URL(req.url).origin}/api/google-callback` } })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const me = await guard(req)
    if (!me) return json({ error: 'Accès refusé.' }, 403)
    const b = await req.json().catch(() => ({})) as Record<string, any>
    switch (b.action) {
      case 'createAgency': {
        const name = String(b.name || '').trim()
        if (!name) return json({ error: 'Nom requis.' }, 400)
        const plan = (b.plan || 'essai') as Plan
        const agency: Agency = { id: uid('ag_'), name, plan, seats: +b.seats || PLAN_SEATS[plan], status: 'actif', createdAt: new Date().toISOString(), contactEmail: String(b.contactEmail || ''), notes: String(b.notes || ''), trialEnds: plan === 'essai' ? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) : '' }
        await mutate<Agency[]>(AGENCIES, () => [], l => [...l, agency])
        await writeJson(agencyDb(agency.id), seedAgencyDb(name, {}, !!b.withDemo), null)
        let password = ''
        if (b.adminEmail) {
          password = tempPassword()
          const email = String(b.adminEmail).trim().toLowerCase()
          const exists = (await loadUsers()).some(u => u.email === email)
          if (exists) return json({ agency, error: 'Agence créée, mais ce courriel administrateur existe déjà.' })
          await mutate<User[]>(USERS, () => [], l => [...l, newUser({ email, name: String(b.adminName || 'Administrateur'), role: 'admin', agencyId: agency.id, title: 'Directeur·rice d’agence', mustChangePassword: true }, password)])
        }
        return json({ agency, password })
      }
      case 'updateAgency': {
        const out = await mutate<Agency[]>(AGENCIES, () => [], l => l.map(a => a.id === b.id ? { ...a, ...pick(b.patch, ['name', 'plan', 'seats', 'status', 'contactEmail', 'notes', 'trialEnds', 'monthlyFee']) } : a))
        return json({ agency: out.find(a => a.id === b.id) })
      }
      case 'createUser': {
        const email = String(b.email || '').trim().toLowerCase()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Courriel invalide.' }, 400)
        if ((await loadUsers()).some(u => u.email === email)) return json({ error: 'Courriel déjà utilisé.' }, 400)
        const password = tempPassword()
        const user = newUser({ email, name: String(b.name || email), role: b.role || 'courtier', agencyId: String(b.agencyId), title: String(b.title || ''), mustChangePassword: true }, password)
        await mutate<User[]>(USERS, () => [], l => [...l, user])
        return json({ user: publicUser(user), password })
      }
      case 'updateUser': {
        const out = await mutate<User[]>(USERS, () => [], l => l.map(u => u.id === b.id && u.id !== me.id ? { ...u, ...pick(b.patch, ['name', 'role', 'active', 'agencyId', 'title']) } : u))
        return json({ user: publicUser(out.find(u => u.id === b.id)!) })
      }
      case 'resetPassword': {
        const password = tempPassword()
        const { salt, hash } = hashPassword(password)
        await mutate<User[]>(USERS, () => [], l => l.map(u => u.id === b.id ? { ...u, salt, hash, failed: 0, lockedUntil: '', mustChangePassword: true, sessionVersion: (u.sessionVersion ?? 0) + 1 } : u))
        return json({ password })
      }
      case 'updateLead': {
        await mutate<Lead[]>(LEADS, () => [], l => l.map(x => x.id === b.id ? { ...x, ...pick(b.patch, ['status', 'notes']) } : x))
        return json({ ok: true })
      }
      case 'saveEntry': {
        const e = b.entry as PlatformEntry
        if (!e?.id || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !['revenu', 'depense'].includes(e.kind)) return json({ error: 'Écriture invalide.' }, 400)
        const clean: PlatformEntry = { id: String(e.id), date: e.date, kind: e.kind, category: String(e.category || ''), description: String(e.description || ''), amount: +e.amount || 0, tps: +e.tps || 0, tvq: +e.tvq || 0, agencyId: String(e.agencyId || ''), reference: String(e.reference || ''), createdAt: e.createdAt || new Date().toISOString() }
        await mutate<PlatformEntry[]>(FINANCE, () => [], l => [...l.filter(x => x.id !== clean.id), clean])
        return json({ ok: true })
      }
      case 'deleteEntry': {
        await mutate<PlatformEntry[]>(FINANCE, () => [], l => l.filter(x => x.id !== b.id))
        return json({ ok: true })
      }
      case 'billMonth': {
        // Inscrit les abonnements du mois (une écriture par agence payante, sans doublon)
        const month = /^\d{4}-\d{2}$/.test(b.month) ? String(b.month) : new Date().toISOString().slice(0, 7)
        const paying = (await loadAgencies()).filter(a => a.status === 'actif' && (a.monthlyFee ?? 0) > 0 && a.plan !== 'essai' && a.plan !== 'illimite')
        let added = 0
        await mutate<PlatformEntry[]>(FINANCE, () => [], l => {
          const out = [...l]
          for (const a of paying) {
            const id = `abo-${a.id}-${month}`
            if (out.some(x => x.id === id)) continue
            const amount = Math.round(a.monthlyFee! * 100) / 100
            out.push({ id, date: `${month}-01`, kind: 'revenu', category: 'abonnement', description: `Abonnement ${a.plan} — ${a.name} (${month})`, amount, tps: Math.round(amount * 5) / 100, tvq: Math.round(amount * 9.975) / 100, agencyId: a.id, reference: id.toUpperCase(), createdAt: new Date().toISOString() })
            added++
          }
          return out
        })
        return json({ added })
      }
      case 'deleteLead': {
        await mutate<Lead[]>(LEADS, () => [], l => l.filter(x => x.id !== b.id))
        return json({ ok: true })
      }
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) { return fail(e) }
}

function pick(o: Record<string, unknown> = {}, keys: string[]) {
  return Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)))
}
function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: 'Erreur serveur.' }, 500)
}

// État de Resend : clé valide et domaines d'envoi (affiché dans l'administration)
async function emailStatus() {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM || ''
  if (!key) return { configured: false, from, ok: false, domains: [] as { name: string; status: string }[], error: '' }
  try {
    const r = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${key}` } })
    const b = await r.json().catch(() => ({})) as { data?: { name: string; status: string }[]; message?: string }
    return { configured: true, from, ok: r.ok || r.status === 401 && /restricted/i.test(b.message ?? ''), domains: (b.data ?? []).map(d => ({ name: d.name, status: d.status })), error: r.ok ? '' : b.message ?? `HTTP ${r.status}` }
  } catch (e) { return { configured: true, from, ok: false, domains: [], error: (e as Error).message } }
}
