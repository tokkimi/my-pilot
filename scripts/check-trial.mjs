import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const base = 'http://127.0.0.1:5184'
async function call(path, cookie, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
const credentials = { email: `trial-${Date.now()}@example.test`, password: 'Local-only-trial-739!' }
const created = await call('/api/auth', '', { ...credentials, action: 'signup', name: 'Trial check', agencyName: 'Trial check' })
assert.equal(created.status, 201)
const cookie = created.cookie, agencyId = created.body.user.agencyId
let auth = await call('/api/auth', cookie)
assert.equal(auth.body.subscriptionRequired, false)
assert.equal(Date.parse(auth.body.agency.trialEnds) - Date.parse(auth.body.agency.createdAt), 3 * 86400000)
assert.equal((await call('/api/data', cookie)).status, 200)
// Age only this newly created local test agency; no production data is used.
const path = '.data/platform/agencies.json'
const agencies = JSON.parse(await readFile(path, 'utf8'))
await writeFile(path, JSON.stringify(agencies.map(a => a.id === agencyId ? { ...a, createdAt: new Date(Date.now() - 4 * 86400000).toISOString(), trialEnds: new Date(Date.now() + 30 * 86400000).toISOString() } : a)))
assert.equal((await call('/api/auth', cookie)).body.subscriptionRequired, true)
assert.equal((await call('/api/auth', '', { ...credentials, action: 'login' })).body.redirect, '/abonnement')
for (const endpoint of ['/api/data', '/api/connections', '/api/calendly']) assert.equal((await call(endpoint, cookie)).status, 401, endpoint)
const billing = await call('/api/subscription', cookie)
assert.equal(billing.status, 200); assert.equal(billing.body.expired, true)
assert.deepEqual(billing.body.plans.map(p => [p.price, p.seats]), [[49,1],[149,5],[349,25]])
assert.equal((await call('/api/subscription', cookie, { plan: 'equipe' })).body.pending, true)
assert.equal((await call('/api/auth', cookie)).body.subscriptionRequired, true, 'Choosing a plan does not pretend payment succeeded')
assert.equal((await call('/api/subscription', cookie, { plan: 'achat' })).status, 200)
console.log('PASS: exact 72-hour trial, server denial after expiry, subscription redirect, CAD tiers, quote requests, no unpaid activation')
