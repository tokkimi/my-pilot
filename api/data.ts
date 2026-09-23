import { agencyDb, currentUser, json, loadAgencies, loadUsers, newUser, PLAN_SEATS, publicUser, sameOrigin, seedAgencyDb, trackActivity, USERS, type User } from '../server/platform.js'
import { mutate, readJson, StorageUnavailable } from '../server/storage.js'
import type { DB, Member } from '../src/lib/types.js'

type AgencyDoc = Omit<DB, 'members' | 'currentUserId'>
const COLLS = ['contacts', 'activities', 'listings', 'deals', 'tasks', 'events', 'showings', 'partners', 'platforms', 'templates', 'posts', 'objections', 'expenses', 'visits'] as const
type Op = { t: 'upsert'; c: string; item: { id: string } & Record<string, unknown> } | { t: 'remove'; c: string; id: string } | { t: 'patch'; p: Record<string, unknown> }

const toMember = (u: User): Member => ({ id: u.id, name: u.name, role: u.role === 'superadmin' ? 'admin' : u.role, title: u.title, phone: u.phone, email: u.email, color: u.color, split: u.split, licence: u.licence, active: u.active })

async function context(req: Request) {
  const u = await currentUser(req)
  if (!u) return null
  const url = new URL(req.url)
  const agencyId = u.role === 'superadmin' ? url.searchParams.get('agency') || '' : u.agencyId
  return agencyId ? { u, agencyId } : null
}

export async function GET(req: Request) {
  try {
    const ctx = await context(req)
    if (!ctx) return json({ error: 'Non connecté.' }, 401)
    const { u, agencyId } = ctx
    const agency = (await loadAgencies()).find(a => a.id === agencyId)
    if (!agency) return json({ error: 'Agence introuvable.' }, 404)
    let { data } = await readJson<AgencyDoc>(agencyDb(agencyId))
    if (!data) data = await mutate<AgencyDoc>(agencyDb(agencyId), () => seedAgencyDb(agency.name, {}, false), d => d)
    const members = (await loadUsers()).filter(x => x.agencyId === agencyId).map(toMember)
    if (u.role !== 'superadmin') await trackActivity(u, false)
    return json({ db: { ...data, visits: data.visits ?? [], members, currentUserId: u.role === 'superadmin' ? members[0]?.id ?? u.id : u.id }, me: publicUser(u), agency })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const ctx = await context(req)
    if (!ctx) return json({ error: 'Non connecté.' }, 401)
    const { u, agencyId } = ctx
    const isAdmin = u.role === 'admin' || u.role === 'superadmin'
    const { ops } = await req.json().catch(() => ({ ops: [] })) as { ops: Op[] }
    if (!Array.isArray(ops) || ops.length > 500) return json({ error: 'Requête invalide.' }, 400)
    const errors: string[] = []

    // Membres = comptes utilisateurs de l'agence (réservé aux administrateurs)
    const memberOps = ops.filter(o => o.t !== 'patch' && o.c === 'members')
    if (memberOps.length) {
      if (!isAdmin) errors.push('Seul un administrateur peut gérer l’équipe.')
      else {
        const agency = (await loadAgencies()).find(a => a.id === agencyId)!
        await mutate<User[]>(USERS, () => [], list => {
          let out = [...list]
          for (const o of memberOps) {
            if (o.t === 'remove') { out = out.map(x => x.id === o.id && x.agencyId === agencyId && x.id !== u.id ? { ...x, active: false } : x); continue }
            if (o.t !== 'upsert') continue
            const m = o.item as unknown as Member & { password?: string }
            const existing = out.find(x => x.id === m.id)
            const role = (['admin', 'courtier', 'adjointe', 'agent'] as const).includes(m.role as never) ? m.role : 'agent'
            if (existing) {
              if (existing.agencyId !== agencyId) continue
              out = out.map(x => x.id === m.id ? { ...x, name: m.name, title: m.title, phone: m.phone, color: m.color, split: +m.split || 0, licence: m.licence, active: x.id === u.id ? true : m.active, role: x.id === u.id ? x.role : role } : x)
            } else {
              const email = String(m.email || '').trim().toLowerCase()
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errors.push(`Courriel invalide pour ${m.name}.`); continue }
              if (out.some(x => x.email === email)) { errors.push(`Le courriel ${email} est déjà utilisé.`); continue }
              const seats = agency.seats || PLAN_SEATS[agency.plan]
              if (seats && out.filter(x => x.agencyId === agencyId && x.active).length >= seats) { errors.push(`Limite de ${seats} utilisateur(s) atteinte pour votre forfait.`); continue }
              if (!m.password || m.password.length < 8) { errors.push('Mot de passe temporaire de 8 caractères minimum requis.'); continue }
              out.push({ ...newUser({ email, name: m.name, role, agencyId, title: m.title, phone: m.phone, color: m.color, split: +m.split || 0, licence: m.licence, mustChangePassword: true }, m.password), id: m.id })
            }
          }
          return out
        })
      }
    }

    const dataOps = ops.filter(o => !(o.t !== 'patch' && o.c === 'members'))
    if (dataOps.length) {
      const agency = (await loadAgencies()).find(a => a.id === agencyId)!
      await mutate<AgencyDoc>(agencyDb(agencyId), () => seedAgencyDb(agency.name, {}, false), doc => {
        const d = { ...doc } as Record<string, unknown>
        for (const o of dataOps) {
          if (o.t === 'patch') {
            if (!isAdmin) { errors.push('Seul un administrateur peut modifier l’agence.'); continue }
            if (o.p.agency && typeof o.p.agency === 'object') d.agency = o.p.agency
            continue
          }
          if (!(COLLS as readonly string[]).includes(o.c)) continue
          const list = ((d[o.c] as { id: string }[] | undefined) ?? [])
          if (o.t === 'upsert') {
            if (!o.item?.id) continue
            d[o.c] = list.some(x => x.id === o.item.id) ? list.map(x => (x.id === o.item.id ? o.item : x)) : [o.item, ...list]
          } else if (o.t === 'remove') d[o.c] = list.filter(x => x.id !== o.id)
        }
        return d as AgencyDoc
      })
    }
    return json({ ok: errors.length === 0, errors: [...new Set(errors)] })
  } catch (e) { return fail(e) }
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: 'Erreur serveur.' }, 500)
}
