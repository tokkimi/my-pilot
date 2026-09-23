// Accès aux outils Google de l'utilisateur connecté (Drive, Agenda) depuis le navigateur.
// Le serveur délivre des jetons de courte durée seulement si l'admin de l'agence a autorisé l'accès.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CalEvent } from './types'

export interface GoogleStatus {
  configured: boolean
  allowed: { drive: boolean; calendar: boolean }
  connected: { email: string; scopes: string; at: string } | null
  picker: { apiKey: string; appId: string; clientId: string } | null
}
export interface DriveFile { id: string; name: string; mimeType: string; webViewLink?: string; iconLink?: string; thumbnailLink?: string; size?: string; modifiedTime?: string; shortcutDetails?: { targetId: string } }

let token: { value: string; exp: number } | null = null
let statusCache: Promise<GoogleStatus> | null = null

export function googleStatus(refresh = false): Promise<GoogleStatus> {
  if (!statusCache || refresh) statusCache = fetch('/api/google?action=status').then(r => (r.ok ? r.json() : { configured: false, allowed: { drive: false, calendar: false }, connected: null, picker: null }))
  return statusCache
}
export const connectGoogle = () => { location.href = '/api/google?action=start' }
export async function disconnectGoogle() {
  await fetch('/api/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) })
  token = null
  statusCache = null
}

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60000) return token.value
  const r = await fetch('/api/google?action=token')
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b.error || 'Google indisponible')
  token = { value: b.token, exp: b.exp }
  return b.token
}

async function g(url: string, init: RequestInit = {}) {
  const t = await accessToken()
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${t}` } })
  if (r.status === 401) { token = null; throw new Error('Session Google expirée, réessayez.') }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `Erreur Google (${r.status})`) }
  return r.status === 204 ? null : r.json()
}
const DRIVE = 'https://www.googleapis.com/drive/v3'
const FOLDER = 'application/vnd.google-apps.folder'
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** Dossier racine « ImmoPilot » dans le Drive de l'utilisateur. */
export async function rootFolder(): Promise<string> {
  const found = await g(`${DRIVE}/files?q=${encodeURIComponent(`appProperties has { key='immopilot' and value='root' } and trashed=false`)}&fields=files(id)`)
  if (found.files?.length) return found.files[0].id
  const f = await g(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ImmoPilot', mimeType: FOLDER, appProperties: { immopilot: 'root' } }) })
  return f.id
}

export async function ensureFolder(name: string, parentId: string): Promise<{ id: string; webViewLink: string }> {
  const found = await g(`${DRIVE}/files?q=${encodeURIComponent(`name='${q(name)}' and mimeType='${FOLDER}' and '${parentId}' in parents and trashed=false`)}&fields=files(id,webViewLink)`)
  if (found.files?.length) return found.files[0]
  return g(`${DRIVE}/files?fields=id,webViewLink`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) })
}

/** Crée « ImmoPilot / <catégorie> / <nom> » et ses sous-dossiers; renvoie le dossier principal. */
export async function createDossierFolder(category: string, name: string, subfolders: string[] = []) {
  const root = await rootFolder()
  const cat = await ensureFolder(category, root)
  const main = await ensureFolder(name, cat.id)
  for (const s of subfolders) await ensureFolder(s, main.id)
  return main
}

export async function listFolder(folderId: string): Promise<DriveFile[]> {
  const r = await g(`${DRIVE}/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&orderBy=folder,name&pageSize=200&fields=files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime,shortcutDetails)`)
  return r.files ?? []
}

/** Envoi (reprise possible) d'un fichier dans un dossier Drive. */
export async function uploadToDrive(blob: Blob, name: string, parentId: string, onProgress?: (p: number) => void): Promise<DriveFile> {
  const t = await accessToken()
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink', {
    method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': blob.type || 'application/octet-stream' },
    body: JSON.stringify({ name, parents: [parentId] }),
  })
  if (!init.ok) throw new Error('Envoi vers Drive refusé')
  const location = init.headers.get('location')!
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest()
    x.open('PUT', location)
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total)
    x.onload = () => (x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error('Envoi vers Drive interrompu')))
    x.onerror = () => rej(new Error('Envoi vers Drive interrompu'))
    x.send(blob)
  })
}

/** Raccourci vers un fichier existant (choisi avec le sélecteur Google) dans le dossier du dossier. */
export async function addShortcut(targetId: string, name: string, parentId: string) {
  return g(`${DRIVE}/files?fields=id,name,mimeType,webViewLink`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.shortcut', parents: [parentId], shortcutDetails: { targetId } }) })
}

let pickerLoaded: Promise<void> | null = null
function loadPicker() {
  if (!pickerLoaded) pickerLoaded = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => (window as any).gapi.load('picker', { callback: res })
    s.onerror = () => rej(new Error('Sélecteur Google indisponible'))
    document.head.appendChild(s)
  })
  return pickerLoaded
}

/** Sélecteur Google : choisir des fichiers de son Drive ou téléverser directement dans le dossier. */
export async function pickFromDrive(parentId?: string): Promise<{ id: string; name: string; url: string; mimeType: string; uploaded: boolean }[]> {
  const status = await googleStatus()
  if (!status.picker) throw new Error('Le sélecteur Google n’est pas configuré (clé API manquante).')
  const t = await accessToken()
  await loadPicker()
  const gp = (window as any).google.picker
  return new Promise(resolve => {
    const docs = new gp.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false)
    const upload = new gp.DocsUploadView()
    if (parentId) upload.setParent(parentId)
    const picker = new gp.PickerBuilder()
      .setOAuthToken(t).setDeveloperKey(status.picker!.apiKey).setAppId(status.picker!.appId).setLocale('fr')
      .addView(docs).addView(upload).enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setCallback((d: any) => {
        if (d.action === gp.Action.PICKED) resolve(d.docs.map((x: any) => ({ id: x.id, name: x.name, url: x.url, mimeType: x.mimeType, uploaded: !!x.isNew })))
        else if (d.action === gp.Action.CANCEL) resolve([])
      }).build()
    picker.setVisible(true)
  })
}

// ---------- Google Agenda ----------
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
/** Crée ou met à jour l'événement dans l'agenda principal; renvoie l'id Google. */
export async function pushEvent(ev: CalEvent, googleId?: string): Promise<string> {
  const body = {
    summary: ev.title, location: ev.location, description: [ev.notes, 'Créé depuis ImmoPilot'].filter(Boolean).join('\n\n'),
    start: { dateTime: new Date(ev.start).toISOString(), timeZone: tz }, end: { dateTime: new Date(ev.end || ev.start).toISOString(), timeZone: tz },
    extendedProperties: { private: { immopilotId: ev.id } },
  }
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  if (googleId) {
    try { return (await g(`${base}/${googleId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).id } catch { /* supprimé dans Google : on recrée */ }
  }
  return (await g(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).id
}
