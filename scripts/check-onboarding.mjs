import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:5184'
async function call(path, cookie, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
const email = `signup-${Date.now()}@example.test`
const data = { action: 'signup', email, name: 'Agence audit', agencyName: 'Audit A', password: 'Local-only-signup-984!' }
assert.equal((await call('/api/auth', '', { ...data, password: 'short' })).status, 400)
const a = await call('/api/auth', '', { ...data, role: 'superadmin', agencyId: 'ag_test' })
assert.equal(a.status, 201); assert.equal(a.body.user.role, 'admin'); assert.notEqual(a.body.user.agencyId, 'ag_test')
assert.equal((await call('/api/auth', '', data)).status, 409)
const b = await call('/api/auth', '', { ...data, email: 'b-' + email, agencyName: 'Audit B' })
assert.equal(b.status, 201)
const db = (await call('/api/data', a.cookie)).body.db
for (const key of ['contacts', 'partners', 'ledger', 'invoices', 'tasks', 'marketingItems', 'operations', 'resources']) assert.equal(db[key].length, 0, key)
const item = { id: 'resource_guides_acheteur', area: 'guides', title: 'Guide A', body: 'Procédure confidentielle A', updatedAt: new Date().toISOString() }
assert.equal((await call('/api/data', a.cookie, { ops: [{ t: 'upsert', c: 'resources', item }] })).body.ok, true)
assert.equal((await call('/api/data', a.cookie)).body.db.resources[0].body, item.body)
assert.equal((await call('/api/data?agency=' + a.body.user.agencyId, b.cookie)).body.db.resources.length, 0)
assert.equal((await call('/api/connections?agency=' + a.body.user.agencyId, b.cookie)).body.connections.every(c => !c.connected), true)
const member = await call('/api/auth', '', { action: 'login', email: 'member@example.test', password: 'Local-only-member-964!' })
assert.equal((await call('/api/data', member.cookie, { ops: [{ t: 'upsert', c: 'resources', item }] })).body.ok, false)
assert.equal((await call('/api/data', a.cookie, { ops: [{ t: 'remove', c: 'resources', id: item.id }] })).body.ok, true)
assert.equal((await call('/api/data', a.cookie)).body.db.resources.length, 0)
const concurrent = await Promise.all([call('/api/auth', '', { ...data, email: 'race-' + email }), call('/api/auth', '', { ...data, email: 'race-' + email })])
assert.deepEqual(concurrent.map(x => x.status).sort(), [201, 409])
console.log('PASS: registration, validation, duplicate race, fixed admin role, empty agency, document CRUD, member restrictions, tenant isolation')
