// Stockage clé/valeur : Vercel Blob (privé) en production, système de fichiers en développement.
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, put } from '@vercel/blob'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN
const DIR = path.join(process.cwd(), '.data')

export const storageMode = () => (useBlob() ? 'blob' : process.env.VERCEL ? 'none' : 'fs')
export const storageReady = () => storageMode() !== 'none'

export class StorageUnavailable extends Error {
  constructor() { super('Stockage non configuré : connectez un Blob Store au projet Vercel.') }
}
const ensure = () => { if (!storageReady()) throw new StorageUnavailable() }
const fsPath = (p: string) => {
  const full = path.join(DIR, p)
  if (!full.startsWith(DIR)) throw new Error('Chemin invalide')
  return full
}
const hash = (b: Buffer | string) => createHash('sha1').update(b).digest('hex')

async function streamToBuffer(s: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(s).arrayBuffer())
}

export async function readJson<T>(p: string): Promise<{ data: T | null; etag: string | null }> {
  ensure()
  if (useBlob()) {
    try {
      const r = await get(p, { access: 'private', useCache: false })
      if (!r || r.statusCode !== 200) return { data: null, etag: null }
      return { data: JSON.parse((await streamToBuffer(r.stream)).toString('utf8')) as T, etag: r.blob.etag }
    } catch (e) {
      if (e instanceof BlobNotFoundError) return { data: null, etag: null }
      throw e
    }
  }
  try {
    const buf = await fs.readFile(fsPath(p))
    return { data: JSON.parse(buf.toString('utf8')) as T, etag: hash(buf) }
  } catch { return { data: null, etag: null } }
}

/** Écrit si l'etag correspond (null = le fichier ne doit pas exister). Retourne false en cas de conflit. */
export async function writeJson(p: string, data: unknown, etag: string | null): Promise<boolean> {
  ensure()
  const body = JSON.stringify(data)
  if (useBlob()) {
    try {
      await put(p, body, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: etag !== null, cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag } : {}) })
      return true
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return false
      if (etag === null && /exist/i.test(String((e as Error).message))) return false
      throw e
    }
  }
  const full = fsPath(p)
  let cur: string | null = null
  try { cur = hash(await fs.readFile(full)) } catch { /* absent */ }
  if (cur !== etag) return false
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, body)
  return true
}

/** Lecture-modification-écriture avec concurrence optimiste. */
export async function mutate<T>(p: string, init: () => T, fn: (cur: T) => T | Promise<T>): Promise<T> {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readJson<T>(p)
    const next = await fn(data ?? init())
    if (await writeJson(p, next, etag)) return next
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120 * (i + 1)))
  }
  throw new Error('Conflit d’écriture, réessayez.')
}

export async function putFile(p: string, body: Buffer, contentType: string) {
  ensure()
  if (useBlob()) { await put(p, body, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true }); return }
  const full = fsPath(p)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, body)
  await fs.writeFile(full + '.type', contentType)
}

export async function getFile(p: string, range?: string | null): Promise<Response | null> {
  ensure()
  if (useBlob()) {
    const r = await get(p, { access: 'private', ...(range ? { headers: { range } } : {}) }).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e })
    if (!r || r.statusCode !== 200) return null
    const h = new Headers({ 'content-type': r.blob.contentType, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' })
    for (const k of ['content-range', 'content-length']) { const v = r.headers.get(k); if (v) h.set(k, v) }
    return new Response(r.stream, { status: r.headers.get('content-range') ? 206 : 200, headers: h })
  }
  try {
    const full = fsPath(p)
    const buf = await fs.readFile(full)
    const type = await fs.readFile(full + '.type', 'utf8').catch(() => 'application/octet-stream')
    const m = range?.match(/bytes=(\d*)-(\d*)/)
    if (m) {
      const start = m[1] ? +m[1] : 0
      const end = m[2] ? Math.min(+m[2], buf.length - 1) : buf.length - 1
      return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers: { 'content-type': type, 'content-range': `bytes ${start}-${end}/${buf.length}`, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1) } })
    }
    return new Response(new Uint8Array(buf), { headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(buf.length) } })
  } catch { return null }
}

export async function removeFile(p: string) {
  ensure()
  if (useBlob()) { await del(p).catch(() => undefined); return }
  await fs.rm(fsPath(p), { force: true })
  await fs.rm(fsPath(p) + '.type', { force: true })
}
