// Envoi de courriels (devis, factures, résumés de visite) par Resend, au nom de l'utilisateur.
// Actif seulement si RESEND_API_KEY et RESEND_FROM sont configurés; sinon l'app utilise le logiciel de courriel de l'appareil.
import { currentUser, json, sameOrigin } from '../server/platform.js'

const hits = new Map<string, { n: number; t: number }>()
export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM)

export async function GET(req: Request) {
  const u = await currentUser(req).catch(() => null)
  if (!u) return json({ error: 'Non connecté.' }, 401)
  return json({ configured: emailConfigured() })
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  const u = await currentUser(req).catch(() => null)
  if (!u) return json({ error: 'Non connecté.' }, 401)
  if (!emailConfigured()) return json({ error: 'Envoi de courriels non configuré.', fallback: true }, 503)
  const h = hits.get(u.id)
  if (h && Date.now() - h.t < 3600000 && h.n >= 60) return json({ error: 'Limite d’envois atteinte, réessayez plus tard.' }, 429)
  hits.set(u.id, h && Date.now() - h.t < 3600000 ? { n: h.n + 1, t: h.t } : { n: 1, t: Date.now() })

  const b = await req.json().catch(() => ({})) as { to?: string[]; cc?: string[]; subject?: string; html?: string; text?: string; attachments?: { filename: string; content: string }[] }
  const valid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)
  const to = (b.to ?? []).filter(valid).slice(0, 10)
  if (!to.length || !b.subject) return json({ error: 'Destinataire et objet requis.' }, 400)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM!.replace(/^.*</, `${u.name.replace(/[<>"]/g, '')} via ImmoPilot <`), to, cc: (b.cc ?? []).filter(valid).slice(0, 10),
      reply_to: u.email, subject: String(b.subject).slice(0, 200), html: String(b.html ?? '').slice(0, 400000), text: b.text ? String(b.text).slice(0, 100000) : undefined,
      attachments: (b.attachments ?? []).slice(0, 5),
    }),
  })
  const body = await r.json().catch(() => ({})) as { id?: string; message?: string }
  if (!r.ok) return json({ error: body.message || 'Envoi refusé par le service de courriel.' }, 502)
  return json({ ok: true, id: body.id })
}
