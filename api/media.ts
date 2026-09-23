import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { currentUser, json, sameOrigin, uid } from '../server/platform.js'
import { getFile, putFile, removeFile, storageMode, StorageUnavailable } from '../server/storage.js'

const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel|zip)|text\/(plain|csv))(;.*)?$/
const MAX = 300 * 1024 * 1024

const allowedPath = (p: string, agencyId: string, superadmin: boolean) =>
  /^agencies\/[\w-]+\/media\/[\w.-]+$/.test(p) && (superadmin || p.startsWith(`agencies/${agencyId}/media/`))

export async function GET(req: Request) {
  try {
    const u = await currentUser(req)
    if (!u) return new Response('Non connecté', { status: 401 })
    const p = new URL(req.url).searchParams.get('p') || ''
    if (!allowedPath(p, u.agencyId, u.role === 'superadmin')) return new Response('Accès refusé', { status: 403 })
    const res = await getFile(p, req.headers.get('range'))
    return res ?? new Response('Introuvable', { status: 404 })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(req)
    const type = req.headers.get('content-type') || ''
    // 1) Téléversement direct côté client vers Vercel Blob (gros fichiers vidéo)
    if (type.includes('application/json')) {
      const body = (await req.json()) as HandleUploadBody
      const result = await handleUpload({
        body, request: req,
        onBeforeGenerateToken: async pathname => {
          if (!u) throw new Error('Non connecté')
          if (!allowedPath(pathname, u.agencyId, u.role === 'superadmin')) throw new Error('Chemin refusé')
          return { allowedContentTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain', 'text/csv'], maximumSizeInBytes: MAX, addRandomSuffix: false }
        },
      })
      return json(result)
    }
    // 2) Téléversement direct au serveur (petits fichiers / développement)
    if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'Fichier manquant.' }, 400)
    if (!ALLOWED.test(file.type)) return json({ error: `Type de fichier non accepté (${file.type}).` }, 400)
    if (file.size > (storageMode() === 'blob' ? 4 * 1024 * 1024 : MAX)) return json({ error: 'Fichier trop volumineux pour ce mode d’envoi.' }, 413)
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^\w]/g, '').slice(0, 5)
    const path = `agencies/${u.agencyId}/media/${uid()}.${ext}`
    await putFile(path, Buffer.from(await file.arrayBuffer()), file.type)
    return json({ path })
  } catch (e) { return fail(e) }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origine refusée.' }, 403)
  try {
    const u = await currentUser(req)
    if (!u) return json({ error: 'Non connecté.' }, 401)
    const p = new URL(req.url).searchParams.get('p') || ''
    if (!allowedPath(p, u.agencyId, u.role === 'superadmin')) return json({ error: 'Accès refusé.' }, 403)
    await removeFile(p)
    return json({ ok: true })
  } catch (e) { return fail(e) }
}

function fail(e: unknown) {
  if (e instanceof StorageUnavailable) return json({ error: e.message }, 503)
  console.error(e)
  return json({ error: (e as Error).message || 'Erreur serveur.' }, 500)
}
