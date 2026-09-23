// Médias des visites (vidéos, audio, photos, plans).
// Mode connecté : envoi au serveur (Vercel Blob privé). Mode démo : IndexedDB du navigateur.
import { useEffect, useState } from 'react'
import type { MediaRef } from './types'
import { uid } from './utils'

const DB_NAME = 'immopilot-media'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idbPut(key: string, blob: Blob) {
  const d = await idb()
  await new Promise<void>((res, rej) => { const tx = d.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
}
async function idbGet(key: string): Promise<Blob | null> {
  const d = await idb()
  return new Promise((res, rej) => { const r = d.transaction('files').objectStore('files').get(key); r.onsuccess = () => res((r.result as Blob) ?? null); r.onerror = () => rej(r.error) })
}
async function idbDel(key: string) {
  const d = await idb()
  await new Promise<void>(res => { const tx = d.transaction('files', 'readwrite'); tx.objectStore('files').delete(key); tx.oncomplete = () => res(); tx.onerror = () => res() })
}

const extOf = (mime: string, name: string) => {
  const fromName = name.includes('.') ? name.split('.').pop()! : ''
  if (fromName) return fromName.toLowerCase().replace(/[^\w]/g, '').slice(0, 5)
  return ({ 'video/webm': 'webm', 'video/mp4': 'mp4', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[mime.split(';')[0]] ?? 'bin'
}

let storageInfo: { mode: string; agencyId: string; upload?: string } | null = null
export const setMediaContext = (mode: string, agencyId: string, upload?: string) => { storageInfo = { mode, agencyId, upload } }

/** Enregistre un fichier et renvoie sa référence. onProgress : 0..1 */
export async function saveMedia(blob: Blob, kind: MediaRef['kind'], name: string, remote: boolean, onProgress?: (p: number) => void): Promise<MediaRef> {
  const mime = (blob.type || 'application/octet-stream').split(';')[0]
  const ref: MediaRef = { id: uid(), kind, mime, name, size: blob.size, createdAt: new Date().toISOString() }
  if (kind === 'photo' || kind === 'plan' || kind === 'video') ref.thumb = await makeThumb(blob, kind).catch(() => undefined)
  if (!remote) {
    ref.local = ref.id
    await idbPut(ref.id, blob)
    onProgress?.(1)
    return ref
  }
  const file = new File([blob], `${ref.id}.${extOf(mime, name)}`, { type: mime })
  if (storageInfo?.mode === 'blob' && file.size > 3.5 * 1024 * 1024) {
    // gros fichiers : envoi direct du navigateur vers Vercel Blob (jeton signé par /api/media)
    const { upload, uploadPresigned } = await import('@vercel/blob/client')
    const pathname = `agencies/${storageInfo.agencyId}/media/${file.name}`
    const send = storageInfo.upload === 'presigned' ? uploadPresigned : upload
    await send(pathname, file, { access: 'private', handleUploadUrl: '/api/media', contentType: mime, multipart: file.size > 50 * 1024 * 1024, onUploadProgress: e => onProgress?.(e.percentage / 100) })
    ref.path = pathname
    return ref
  }
  const form = new FormData()
  form.set('file', file)
  if (storageInfo?.agencyId) form.set('agency', storageInfo.agencyId)
  const r = await fetch('/api/media', { method: 'POST', body: form })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || 'Échec de l’envoi du fichier')
  onProgress?.(1)
  ref.path = body.path
  return ref
}

export async function deleteMedia(ref: MediaRef) {
  if (ref.local) await idbDel(ref.local)
  if (ref.path) await fetch('/api/media?p=' + encodeURIComponent(ref.path), { method: 'DELETE' }).catch(() => undefined)
}

/** URL affichable d'un média (object URL en mode démo). */
export function useMediaUrl(ref: MediaRef | undefined) {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (!ref) { setUrl(''); return }
    if (ref.path) { setUrl('/api/media?p=' + encodeURIComponent(ref.path)); return }
    let obj = ''
    let alive = true
    if (ref.local) idbGet(ref.local).then(b => { if (b && alive) { obj = URL.createObjectURL(b); setUrl(obj) } })
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [ref?.id, ref?.path, ref?.local])
  return url
}

export async function mediaBlob(ref: MediaRef): Promise<Blob | null> {
  if (ref.local) return idbGet(ref.local)
  if (ref.path) { const r = await fetch('/api/media?p=' + encodeURIComponent(ref.path)); return r.ok ? r.blob() : null }
  return null
}

async function makeThumb(blob: Blob, kind: MediaRef['kind']): Promise<string | undefined> {
  const url = URL.createObjectURL(blob)
  try {
    let src: CanvasImageSource, w: number, h: number
    if (kind === 'video') {
      const v = document.createElement('video')
      v.muted = true; v.playsInline = true; v.src = url
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video')); setTimeout(() => res(), 4000) })
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2)
      await new Promise<void>(res => { v.onseeked = () => res(); setTimeout(res, 1500) })
      src = v; w = v.videoWidth; h = v.videoHeight
    } else {
      if (!blob.type.startsWith('image/')) return undefined
      const img = new Image()
      img.src = url
      await img.decode()
      src = img; w = img.naturalWidth; h = img.naturalHeight
    }
    if (!w || !h) return undefined
    const s = 240 / Math.max(w, h)
    const c = document.createElement('canvas')
    c.width = Math.round(w * s); c.height = Math.round(h * s)
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } finally { URL.revokeObjectURL(url) }
}
