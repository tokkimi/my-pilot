// Envoi de courriel : par le serveur (Resend) si configuré, sinon ouverture du logiciel de courriel de l'appareil.
export async function sendEmail(p: { to: string[]; cc?: string[]; subject: string; html: string; text: string }): Promise<'sent' | 'mailto'> {
  const r = await fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }).catch(() => null)
  if (r?.ok) return 'sent'
  const b = r ? await r.json().catch(() => ({ fallback: true })) : { fallback: true }
  if (!b.fallback) throw new Error(b.error || 'Envoi impossible')
  location.href = `mailto:${p.to.join(',')}?${p.cc?.length ? `cc=${encodeURIComponent(p.cc.join(','))}&` : ''}subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.text)}`
  return 'mailto'
}
