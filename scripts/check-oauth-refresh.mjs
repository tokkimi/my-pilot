import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createCipheriv,createHash,randomBytes} from 'node:crypto'
import {createServer} from 'vite'
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'immopilot-oauth-test-'))
for(const k of ['BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','VERCEL'])delete process.env[k]
process.env.SESSION_SECRET='local-test-only'
process.env.CANVA_CLIENT_ID='local-client'
process.env.CANVA_CLIENT_SECRET='local-secret'
process.chdir(temp)
const server=await createServer({root,configFile:false,server:{middlewareMode:true}})
const originalFetch=globalThis.fetch
function seal(tokens){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update('local-test-only:connections').digest(),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(tokens)),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.')}
try{
 const {connectionToken,decrypt}=await server.ssrLoadModule('/api/connections.ts')
 const {readJson,mutate}=await server.ssrLoadModule('/server/storage.ts')
 const file='agencies/test/connections/member/canva.json'
 const seed=()=>mutate(file,()=>null,()=>({encrypted:seal({access_token:'expired',refresh_token:'refresh-old'}),expiresAt:1,scope:'design:meta:read',connectedAt:'test'}))
 await seed()
 let calls=0
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.canva.com/rest/v1/oauth/token');assert.equal(options.body.get('grant_type'),'refresh_token');assert.equal(options.body.get('refresh_token'),'refresh-old');return Response.json({access_token:'fresh',refresh_token:'refresh-new',expires_in:3600})}
 assert.deepEqual(await Promise.all([connectionToken('test','member','canva'),connectionToken('test','member','canva')]),['fresh','fresh'])
 assert.equal(calls,1)
 const stored=(await readJson(file)).data
 assert.equal(JSON.parse(decrypt(stored.encrypted)).refresh_token,'refresh-new')
 assert.equal(await connectionToken('test','member','canva'),'fresh');assert.equal(calls,1)
 await assert.rejects(()=>connectionToken('other-agency','member','canva'),/Connectez/)
 await seed()
 globalThis.fetch=async()=>{await mutate(file,()=>null,()=>null);return Response.json({access_token:'must-not-return',refresh_token:'rotated',expires_in:3600})}
 await assert.rejects(()=>connectionToken('test','member','canva'),/changé/)
 assert.equal((await readJson(file)).data,null)
 await seed()
 globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400})
 await assert.rejects(()=>connectionToken('test','member','canva'),/révoquée/)
 assert.ok((await readJson(file)).data)
 const {mapProperty}=await server.ssrLoadModule('/src/lib/property-import.ts')
 const first=mapProperty({ListingKey:'123',UnparsedAddress:'123 rue Test',ListPrice:400000,BedroomsTotal:3},'member','feed')
 first.notes='Internal note';first.marketing={photo:true}
 const updated=mapProperty({ListingKey:'123',ListPrice:420000},'other','feed',first)
 assert.equal(updated.id,first.id);assert.equal(updated.price,420000);assert.equal(updated.address,'123 rue Test');assert.equal(updated.agentId,'member');assert.equal(updated.notes,'Internal note');assert.deepEqual(updated.marketing,{photo:true})
 assert.throws(()=>mapProperty({ListingKey:'x',address:'A',price:-1},'m','feed'))
 assert.throws(()=>mapProperty({address:'A'},'m','feed'))
 console.log('PASS: property field mapping, stable identity, partial updates, internal data preserved, invalid records rejected')
 const platform=await server.ssrLoadModule('/server/platform.ts')
 const microsoft=await server.ssrLoadModule('/api/microsoft.ts')
 const now=new Date().toISOString()
 const users=[{id:'member',role:'admin',agencyId:'test',active:true,sessionVersion:0},{id:'reader',role:'courtier',agencyId:'test',active:true,toolAccess:{microsoft:'read'}}]
 await mutate('platform/users.json',()=>[],()=>users)
 await mutate('platform/agencies.json',()=>[],()=>[{id:'test',status:'actif',plan:'illimite',trialEnds:'',createdAt:now}])
 const msFile='agencies/test/connections/member/microsoft.json'
 await mutate(msFile,()=>null,()=>({encrypted:seal({access_token:'ms-access'}),expiresAt:Date.now()+3600000,scope:'Calendars.ReadWrite',connectedAt:now}))
 const request=(method='GET',body,uid='member',origin='http://localhost')=>new Request('http://localhost/api/microsoft',{method,headers:{cookie:platform.sessionCookie(uid).split(';')[0],origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
 let graphCalls=0
 globalThis.fetch=async(url,opts)=>{graphCalls++;assert.ok(url.startsWith('https://graph.microsoft.com/v1.0/me/'));assert.equal(opts.headers.authorization,'Bearer ms-access');if(opts.method==='PATCH'){assert.deepEqual(JSON.parse(opts.body),{subject:'Updated title'});return Response.json({id:'event1'})}return Response.json({value:[{id:'event1',subject:'Meeting'}]})}
 assert.equal((await microsoft.GET(new Request('http://localhost/api/microsoft'))).status,403)
 let response=await microsoft.GET(request());assert.equal(response.status,200);assert.equal((await response.json()).events[0].subject,'Meeting')
 response=await microsoft.POST(request('POST',{action:'update',id:'event1',subject:'Updated title'}));assert.equal(response.status,200)
 assert.equal((await microsoft.POST(request('POST',{action:'update',id:'event1',subject:'X'},'reader'))).status,403)
 assert.equal((await microsoft.POST(request('POST',{action:'update',id:'event1',subject:'X'},'member','https://evil.example'))).status,403)
 assert.equal((await microsoft.POST(request('POST',{action:'update',id:'event1',subject:''}))).status,400)
 assert.equal(graphCalls,2)
 console.log('PASS: Microsoft calendar read/write mapping, anonymous and read-only restrictions, cross-origin and invalid input denied')
 console.log('PASS: refresh rotation, concurrent refresh deduplication, valid token reuse, agency isolation, disconnect during refresh, revoked grant rejection')
}finally{globalThis.fetch=originalFetch;await server.close();process.chdir(root);await rm(temp,{recursive:true,force:true})}
