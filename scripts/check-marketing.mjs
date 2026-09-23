import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:5184'
async function call(path, cookie, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
async function login(email, password) { const r = await call('/api/auth', '', { action: 'login', email, password }); assert.equal(r.status, 200); return r.cookie }
const founder = await login('founder@example.test', 'Local-only-founder-739!')
const client = await login('client@example.test', 'Local-only-client-852!')
const member = await login('member@example.test', 'Local-only-member-964!')
assert.equal((await call('/api/admin', client)).status, 403)
assert.equal((await call('/api/admin', member, { action: 'openOwnAgency' })).status, 403)
assert.equal((await call('/api/data', '')).status, 401)
const own = await call('/api/admin', founder, { action: 'openOwnAgency' })
assert.equal(own.status, 200)
const id = own.body.agency.id
assert.notEqual(id, 'ag_test')
assert.equal((await call('/api/admin', founder, { action: 'openOwnAgency' })).body.agency.id, id)
const ownData = (await call('/api/data?agency=' + id, founder)).body
assert.equal(ownData.me.role, 'superadmin')
assert.equal(ownData.db.currentUserId, ownData.me.id)
assert.equal(ownData.db.members.find(x => x.id === ownData.me.id).role, 'admin')
assert.equal(ownData.db.contacts.length, 0)
const clientData = (await call('/api/data?agency=' + id, client)).body
assert.equal(clientData.agency.id, 'ag_test', 'Client cannot switch tenant through query parameters')
const item = { id: 'qa-campaign', kind: 'campaign', title: 'Test campagne', ownerId: clientData.me.id, notes: '', status: 'brouillon', start: '2026-09-23', end: '', channels: ['Facebook'], budget: 100, spent: 25, objective: 'Visites', audience: '', url: '', location: '', impressions: 1000, clicks: 20, leads: 3, attendees: 0, checklist: '', colors: '', typography: '', voice: '', rights: '', expires: '' }
assert.equal((await call('/api/data', client, { ops: [{ t: 'upsert', c: 'marketingItems', item }] })).body.ok, true)
assert.equal((await call('/api/data', member)).body.db.marketingItems.find(x => x.id === item.id).budget, 100)
assert.equal((await call('/api/data?agency=' + id, founder)).body.db.marketingItems.some(x => x.id === item.id), false)
const post = { id: 'qa-post', date: '2026-09-23', platforms: ['Facebook'], format: 'publication', caption: 'Test', listingId: '', status: 'planifie', kind: 'Conseil', approval: 'approuve', approvedBy: 'forged' }
assert.equal((await call('/api/data', member, { ops: [{ t: 'upsert', c: 'posts', item: post }] })).body.ok, false)
assert.equal((await call('/api/data', client, { ops: [{ t: 'upsert', c: 'posts', item: post }] })).body.ok, true)
const saved = (await call('/api/data', client)).body.db.posts.find(x => x.id === post.id)
assert.equal(saved.approvedBy, clientData.me.id)
assert.equal((await call('/api/data', member, { ops: [{ t: 'upsert', c: 'posts', item: { ...saved, caption: 'Changed without approval' } }] })).body.ok, false)
const form = new FormData(); form.set('agency', id); form.set('file', new File(['test'], 'test.txt', { type: 'text/plain' }))
const upload = await fetch(base + '/api/media', { method: 'POST', headers: { cookie: founder }, body: form })
const media = await upload.json(); assert.equal(upload.status, 200); assert.ok(media.path.startsWith(`agencies/${id}/media/`))
assert.equal((await fetch(base + '/api/media?p=' + encodeURIComponent(media.path), { headers: { cookie: client } })).status, 403)
assert.equal((await fetch(base + '/api/media?p=' + encodeURIComponent(media.path), { headers: { cookie: founder }, method: 'DELETE' })).status, 200)
await call('/api/data', client, { ops: [{ t: 'remove', c: 'marketingItems', id: item.id }, { t: 'remove', c: 'posts', id: post.id }] })
console.log('PASS: roles, tenant isolation, idempotent founder agency, shared marketing persistence, approval authorization, and media ownership')
