import { json, LEADS, sameOrigin, uid, type Lead } from '../server/platform.js'
import { mutate, storageReady } from '../server/storage.js'

const hits = new Map<string, { n: number; t: number }>()

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'local'
  const h = hits.get(ip)
  if (h && Date.now() - h.t < 3600000 && h.n >= 5) return json({ error: 'Trop de demandes, réessayez plus tard.' }, 429)
  hits.set(ip, { n: h && Date.now() - h.t < 3600000 ? h.n + 1 : 1, t: h && Date.now() - h.t < 3600000 ? h.t : Date.now() })

  const b = await req.json().catch(() => ({})) as Record<string, string>
  if (b.website) return json({ ok: true }) // pot de miel anti-robots
  const s = (k: string, max = 200) => String(b[k] ?? '').trim().slice(0, max)
  const lead: Lead = { id: uid('l_'), createdAt: new Date().toISOString(), name: s('name'), email: s('email'), phone: s('phone', 40), agency: s('agency'), role: s('role', 60), agents: s('agents', 20), interest: s('interest', 60), message: s('message', 3000), status: 'nouveau', notes: '' }
  if (!lead.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) return json({ error: 'Nom et courriel valides requis.' }, 400)
  if (!storageReady()) return json({ error: 'storage', fallback: true }, 503)
  await mutate<Lead[]>(LEADS, () => [], l => [lead, ...l].slice(0, 5000))
  return json({ ok: true })
}
