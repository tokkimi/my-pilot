import assert from 'node:assert/strict';
const base='http://127.0.0.1:5184';
let r=await fetch(base+'/api/connections');assert.equal(r.status,401);
r=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',email:'client@example.test',password:'Local-only-client-852!'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
r=await fetch(base+'/api/connections',{headers:{cookie}});const b=await r.json();assert.equal(r.status,200);assert.equal(b.connections.length,5);assert.ok(b.connections.every(x=>!x.configured&&!x.connected));assert.ok(!JSON.stringify(b).includes('encrypted'));
for(const provider of ['meta','canva','calendly','linkedin','microsoft']){r=await fetch(base+'/api/connections',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify({provider,action:'start'})});assert.equal(r.status,503)}
r=await fetch(base+'/api/connections?action=callback&state=forged',{headers:{cookie}});assert.equal(r.status,400);
r=await fetch(base+'/api/connections',{method:'POST',headers:{cookie,'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify({provider:'meta',action:'start'})});assert.equal(r.status,403);
r=await fetch(base+'/api/connections?action=meta-assets',{headers:{cookie}});assert.equal(r.status,409);
console.log('PASS: anonymous denied, five providers gated, secrets absent, forged state and cross-origin denied, unconnected assets denied');
