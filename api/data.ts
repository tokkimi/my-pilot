import { agencyDb, currentUser, json, renewCookie, loadAgencies, loadUsers, newUser, PLAN_SEATS, publicUser, sameOrigin, seedAgencyDb, trackActivity, USERS, type User } from '../server/platform.js'
import { mutate, readJson, StorageUnavailable } from '../server/storage.js'
import { allowed, revokeGoogle } from '../server/google.js'
import type { DB, Member } from '../src/lib/types.js'

type AgencyDoc = Omit<DB, 'members' | 'currentUserId'>
const COLLS = ['contacts', 'activities', 'listings', 'deals', 'tasks', 'events', 'showings', 'partners', 'platforms', 'templates', 'posts', 'objections', 'expenses', 'visits', 'ledger', 'trips', 'acctYears', 'invoices', 'marketingItems', 'operations', 'resources'] as const
/** Collections comptables privées : chacun voit la sienne; « agence » réservée aux administrateurs. */
const PRIVATE = ['ledger', 'trips', 'acctYears', 'invoices']
const canSee = (ownerId: unknown, u: User) => u.role === 'superadmin' || ownerId === u.id || (ownerId === 'agence' && u.role === 'admin')
type Op = { t: 'upsert'; c: string; item: { id: string } & Record<string, unknown> } | { t: 'remove'; c: string; id: string } | { t: 'patch'; p: Record<string, unknown> }

const toMember = (u: User): Member => { const g = allowed(u); return { avatar: u.avatar, toolAccess: u.toolAccess ?? {}, id: u.id, name: u.name, role: u.role === 'superadmin' ? 'admin' : u.role, title: u.title, phone: u.phone, email: u.email, color: u.color, split: u.split, licence: u.licence, active: u.active, googleDrive: g.drive, googleCalendar: g.calendar, googleEmail: u.googleEmail ?? '', driveUrl: (u as User & { driveUrl?: string }).driveUrl ?? '', tpsNo: u.tpsNo ?? '', tvqNo: u.tvqNo ?? '' } }

async function context(req: Request) {
  const u = await currentUser(req)
  if (!u) return null
  const url = new URL(req.url)
  const agencyId = u.role === 'superadmin' ? url.searchParams.get('agency') || u.ownAgencyId || '' : u.agencyId
  const agency = (await loadAgencies()).find(a => a.id === agencyId)
  if (!agency || (agency.status === 'suspendu' && u.role !== 'superadmin')) return null
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
    if (u.role === 'superadmin' && !members.some(m => m.id === u.id)) members.unshift(toMember(u))
    for (const c of PRIVATE) (data as Record<string, unknown>)[c] = (((data as Record<string, unknown>)[c] as { ownerId: string }[] | undefined) ?? []).filter(x => canSee(x.ownerId, u))
    if (u.role !== 'superadmin') await trackActivity(u, false)
    return json({ db: { ...data, marketingItems: data.marketingItems ?? [], operations: data.operations ?? [], resources: data.resources ?? [], visits: data.visits ?? [], members, currentUserId: u.id }, me: publicUser(u), agency }, 200, { 'set-cookie': renewCookie(u) })
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
        const toRevoke = new Set<string>()
        await mutate<User[]>(USERS, () => [], list => {
          let out = [...list]
          for (const o of memberOps) {
            if (o.t === 'remove') { const t = out.find(x => x.id === o.id); if (t?.googleEmail) toRevoke.add(t.id); out = out.map(x => x.id === o.id && x.agencyId === agencyId && x.id !== u.id ? { ...x, active: false } : x); continue }
            if (o.t !== 'upsert') continue
            const m = o.item as unknown as Member & { password?: string }
            const existing = out.find(x => x.id === m.id)
            const toolAccess = Object.fromEntries(['meta', 'calendly', 'canva', 'linkedin', 'microsoft'].map(key => [key, ['read', 'manage'].includes(String(m.toolAccess?.[key as keyof NonNullable<Member['toolAccess']>])) ? m.toolAccess![key as keyof NonNullable<Member['toolAccess']>] : 'none'])) as Member['toolAccess']
            const role = (['admin', 'courtier', 'adjointe', 'marketing', 'agent'] as const).includes(m.role as never) ? m.role : 'agent'
            if (existing) {
              if (existing.agencyId !== agencyId) continue
              const seats = agency.seats || PLAN_SEATS[agency.plan]
              if (!existing.active && m.active && seats && out.filter(x => x.agencyId === agencyId && x.active).length >= seats) { errors.push(`Limite de ${seats} membres atteinte.`); continue }
              const before = allowed(existing)
              const drive = m.googleDrive ?? before.drive, calendar = m.googleCalendar ?? before.calendar
              if (existing.googleEmail && ((before.drive && !drive) || (before.calendar && !calendar) || m.active === false)) toRevoke.add(existing.id)
              out = out.map(x => x.id === m.id ? { ...x, toolAccess, name: m.name, title: m.title, phone: m.phone, color: m.color, split: +m.split || 0, licence: m.licence, active: x.id === u.id ? true : m.active, role: x.id === u.id ? x.role : role, googleDrive: drive, googleCalendar: calendar, driveUrl: m.driveUrl ?? '', tpsNo: m.tpsNo ?? '', tvqNo: m.tvqNo ?? '' } : x)
            } else {
              const email = String(m.email || '').trim().toLowerCase()
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errors.push(`Courriel invalide pour ${m.name}.`); continue }
              if (out.some(x => x.email === email)) { errors.push(`Le courriel ${email} est déjà utilisé.`); continue }
              const seats = agency.seats || PLAN_SEATS[agency.plan]
              if (seats && out.filter(x => x.agencyId === agencyId && x.active).length >= seats) { errors.push(`Limite de ${seats} utilisateur(s) atteinte pour votre forfait.`); continue }
              if (!m.password || m.password.length < 8) { errors.push('Mot de passe temporaire de 8 caractères minimum requis.'); continue }
              out.push({ ...newUser({ email, name: m.name, role, agencyId, toolAccess, title: m.title, phone: m.phone, color: m.color, split: +m.split || 0, licence: m.licence, mustChangePassword: true, googleDrive: !!m.googleDrive, googleCalendar: !!m.googleCalendar }, m.password), id: m.id, driveUrl: m.driveUrl ?? '' } as User)
            }
          }
          return out
        })
        for (const id of toRevoke) await revokeGoogle(id).catch(() => undefined)
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
          if (o.c === 'resources' && !isAdmin) { errors.push('Seule la direction peut modifier les guides et procédures.'); continue }
          if (o.c === 'resources' && o.t === 'upsert' && (typeof o.item.title !== 'string' || typeof o.item.body !== 'string' || o.item.body.length > 200000 || !['guides', 'sop'].includes(String(o.item.area)))) { errors.push('Document invalide.'); continue }
          const list = ((d[o.c] as { id: string; ownerId?: string }[] | undefined) ?? [])
          if (o.c === 'posts' && o.t === 'upsert') {
            const old = list.find(x => x.id === o.item?.id) as DB['posts'][number] | undefined
            const p = o.item as unknown as DB['posts'][number]
            const contentChanged = old && ['caption', 'date', 'time', 'platforms', 'assetIds', 'listingId', 'campaignId'].some(k => JSON.stringify((old as unknown as Record<string, unknown>)[k]) !== JSON.stringify(o.item[k]))
            const canApprove = isAdmin || u.role === 'marketing'
            if (p.approval === 'approuve' && (old?.approval !== 'approuve' || contentChanged)) {
              if (!canApprove) { errors.push('La validation est réservée à la direction et au marketing.'); continue }
              p.approvedBy = u.id; p.approvedAt = new Date().toISOString()
            } else if (p.approval !== 'approuve') { p.approvedBy = ''; p.approvedAt = '' }
            else { p.approvedBy = old?.approvedBy; p.approvedAt = old?.approvedAt }
            if (p.status === 'planifie' && p.approval !== 'approuve') { errors.push('Validez le contenu avant de le planifier.'); continue }
          }
          if (PRIVATE.includes(o.c)) {
            const existing = list.find(x => x.id === (o.t === 'upsert' ? o.item?.id : o.id))
            if ((existing && !canSee(existing.ownerId, u)) || (o.t === 'upsert' && !canSee(o.item?.ownerId, u))) { errors.push('Accès refusé à cette comptabilité.'); continue }
          }
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

