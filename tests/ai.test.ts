import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { AGENCIES, agencyDb, newUser, USERS, type User } from '../server/platform'
import { readJson, writeJson } from '../server/storage'
import { ask, decide } from '../server/ai'

const A = 'ag_ai'
let server: Server, received: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
let u: User

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      received = { auth: req.headers.authorization, body: JSON.parse(body) }
      const out = { answer: 'Julie Tremblay attend un suivi (source google, 2026-09-28).', sources: [{ ref: 'contacts:c1', source: 'google', date: '2026-09-28' }], proposals: [{ title: 'Rappeler Julie Tremblay', due: '2026-09-30', priority: 'haute', contactId: 'c1', listingId: '', dealId: '', reason: 'Aucun contact depuis 30 jours' }] }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }], usage: { total_tokens: 1234 } }))
    })
  })
  await new Promise<void>(r => server.listen(0, r))
  process.env.OPENAI_API_KEY = 'sk-test-cle-plateforme-0123456789'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  u = newUser({ email: 'ia@test.ca', name: 'Agent IA', role: 'courtier', agencyId: A }, 'motdepasse123')
  await writeJson(USERS, [...((await readJson<User[]>(USERS)).data ?? []), u], (await readJson(USERS)).etag)
  await writeJson(AGENCIES, [...((await readJson<unknown[]>(AGENCIES)).data ?? []), { id: A, name: 'IA', plan: 'agence', seats: 0, status: 'actif', createdAt: '', contactEmail: '', notes: '', trialEnds: '' }], (await readJson(AGENCIES)).etag)
  await writeJson(agencyDb(A), { version: 2, agency: { name: 'IA' }, contacts: [{ id: 'c1', firstName: 'Julie', lastName: 'Tremblay', notes: 'mot de passe Centris : Secret123', apiKey: 'sk-fuite-0123456789abcdef', _src: [{ p: 'google', c: 'x', x: '1', at: '2026-09-28T10:00:00Z' }] }], tasks: [], activities: [] }, null)
})
afterAll(() => { server.close(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_BASE_URL })

describe('assistant IA (API OpenAI côté serveur)', () => {
  it('envoie les données autorisées avec provenance, sans secret, et retourne des propositions', async () => {
    const r = await ask(A, u, 'Qui dois-je rappeler?')
    expect(r.answer).toContain('Julie')
    expect(r.proposals).toHaveLength(1)
    expect(received.auth).toBe('Bearer sk-test-cle-plateforme-0123456789') // clé plateforme, jamais celle d'un utilisateur
    const sent = JSON.stringify(received.body)
    expect(received.body.store).toBe(false)
    expect(sent).toContain('google@2026-09-28')
    expect(sent).not.toContain('sk-fuite')
    expect(sent).not.toContain('Secret123') // les notes libres ne font pas partie de la liste blanche
    expect(r.usage.tokens).toBe(1234)
  })
  it('validation humaine : la tâche n’est créée qu’une fois', async () => {
    const r = await ask(A, u, 'Propose des tâches')
    const p = r.proposals[0]
    await decide(A, u, p.id, true)
    await expect(decide(A, u, p.id, true)).rejects.toThrow()
    const doc = (await readJson<{ tasks: { key: string; title: string }[] }>(agencyDb(A))).data!
    expect(doc.tasks.filter(t => t.key === `ai:${p.id}`)).toHaveLength(1)
  })
})
