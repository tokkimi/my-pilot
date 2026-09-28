import { canUseTool } from '../server/tool-access.js'
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto'
import {currentUser,loadAgencies,json,sameOrigin} from '../server/platform.js'
import {readJson,mutate,writeJson} from '../server/storage.js'
const providers={
 meta:{name:'Facebook & Instagram',auth:'https://www.facebook.com/'+(process.env.META_GRAPH_VERSION||'v23.0')+'/dialog/oauth',token:'https://graph.facebook.com/'+(process.env.META_GRAPH_VERSION||'v23.0')+'/oauth/access_token',scope:'',basic:false,pkce:false},
 canva:{name:'Canva',auth:'https://www.canva.com/api/oauth/authorize',token:'https://api.canva.com/rest/v1/oauth/token',scope:'design:meta:read',basic:true,pkce:true},
 calendly:{name:'Calendly',auth:'https://auth.calendly.com/oauth/authorize',token:'https://auth.calendly.com/oauth/token',scope:'',basic:true,pkce:true},
 linkedin:{name:'LinkedIn',auth:'https://www.linkedin.com/oauth/v2/authorization',token:'https://www.linkedin.com/oauth/v2/accessToken',scope:'openid profile',basic:false,pkce:false},
 microsoft:{name:'Microsoft 365',auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scope:'offline_access User.Read Calendars.ReadWrite',basic:false,pkce:true},
} as const
type Provider=keyof typeof providers
type Pending={uid:string;agency:string;provider:Provider;verifier:string;expires:number;used:boolean}
type Connection={encrypted:string;connectedAt:string;expiresAt:number;scope:string;selected?:string[];refreshUntil?:number}|null
const config=(p:Provider)=>({id:process.env[p.toUpperCase()+'_CLIENT_ID'],secret:process.env[p.toUpperCase()+'_CLIENT_SECRET']})
const ready=(p:Provider)=>!!(config(p).id&&config(p).secret&&process.env.SESSION_SECRET&&(p!=='meta'||(process.env.META_CONFIG_ID&&process.env.META_GRAPH_VERSION)))
const cipherKey=()=>{if(!process.env.SESSION_SECRET)throw new Error('Configuration sécurisée manquante.');return createHash('sha256').update(process.env.SESSION_SECRET+':connections').digest()}
function encrypt(text:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',cipherKey(),iv);const bytes=Buffer.concat([c.update(text),c.final()]);return [iv,c.getAuthTag(),bytes].map(x=>x.toString('base64url')).join('.')}
export function decrypt(text:string){const [iv,tag,bytes]=text.split('.').map(x=>Buffer.from(x,'base64url'));const d=createDecipheriv('aes-256-gcm',cipherKey(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(bytes),d.final()]).toString()}
const path=(agency:string,uid:string,p:Provider)=>`agencies/${agency}/connections/${uid}/${p}.json`
// Persist refreshed tokens with compare-and-swap: a disconnect must never be undone.
const refreshing=new Map<string,Promise<string>>()
export async function connectionToken(agency:string,uid:string,id:Provider):Promise<string>{
 const file=path(agency,uid,id)
 if(refreshing.has(file))return refreshing.get(file)!
 const task=(async()=>{
  const {data,etag}=await readJson<Connection>(file)
  if(!data)throw new Error('Connectez votre compte '+providers[id].name+'.')
  const tokens=JSON.parse(decrypt(data.encrypted))
  if(data.expiresAt>Date.now()+60000)return tokens.access_token
  if(!tokens.refresh_token||id==='meta')throw new Error('Votre fournisseur demande une nouvelle autorisation. Reconnectez votre compte.')
  const p=providers[id],c=config(id)
  if(!ready(id))throw new Error('Connexion en attente de configuration par ImmoPilot.')
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token})
  if(!p.basic){body.set('client_id',c.id!);body.set('client_secret',c.secret!)}
  if((data.refreshUntil||0)>Date.now())throw new Error('Renouvellement en cours. Réessayez dans quelques secondes.')
  if(!await writeJson(file,{...data,refreshUntil:Date.now()+30000},etag))throw new Error('Connexion en cours de mise à jour. Réessayez.')
  const leased=await readJson<Connection>(file)
  if(!leased.data||leased.data.encrypted!==data.encrypted)throw new Error('La connexion a changé. Réessayez.')
  const response=await fetch(p.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(p.basic?{authorization:'Basic '+Buffer.from(c.id+':'+c.secret).toString('base64')}:{})},body,signal:AbortSignal.timeout(15000)})
  const next=await response.json()
  if(!response.ok||typeof next.access_token!=='string')throw new Error(response.status===400||response.status===401?'Autorisation expirée ou révoquée. Reconnectez votre compte.':'Renouvellement temporairement indisponible. Réessayez.')
  const updated={...data,encrypted:encrypt(JSON.stringify({...tokens,...next,refresh_token:next.refresh_token||tokens.refresh_token})),expiresAt:Date.now()+Number(next.expires_in||3600)*1000,scope:next.scope||data.scope}
  if(!await writeJson(file,{...updated,refreshUntil:0},leased.etag)){
   const latest=(await readJson<Connection>(file)).data
   if(latest&&latest.expiresAt>Date.now()+60000)return JSON.parse(decrypt(latest.encrypted)).access_token
   throw new Error('La connexion a changé. Actualisez votre espace.')
  }
  return next.access_token as string
 })()
 refreshing.set(file,task)
 try{return await task}finally{refreshing.delete(file)}
}
const cookie=(v:string,age=600)=>`ip_connect=${v}; Path=/api/connections; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.VERCEL?'; Secure':''}`
async function context(req:Request){const u=await currentUser(req);if(!u)return null;const agency=u.role==='superadmin'?new URL(req.url).searchParams.get('agency')||u.ownAgencyId:u.agencyId;if(!(await loadAgencies()).some(a=>a.id===agency&&a.status==='actif'))return null;return {u,agency:agency!}}
const back=(agency:string,result:string)=>new Response(null,{status:302,headers:{location:`/app?agency=${encodeURIComponent(agency)}&connection=${result}#/connections`,'set-cookie':cookie('',0),'cache-control':'no-store'}})
export async function GET(req:Request){try{const url=new URL(req.url),action=url.searchParams.get('action');
 if(action==='callback'){
 const state=url.searchParams.get('state')||'';if(!/^[\w-]{43}$/.test(state))return json({error:'Session de connexion invalide.'},400)
 const saved=(await readJson<Pending>('platform/oauth/'+state+'.json')).data;const u=await currentUser(req);const nonce=(req.headers.get('cookie')||'').split(/;\s*/).find(x=>x.startsWith('ip_connect='))?.slice(11)
 if(!saved||!u||saved.uid!==u.id||saved.used||saved.expires<Date.now()||nonce!==state)return json({error:'Session expirée. Recommencez la connexion.'},400)
 if(!canUseTool(u,saved.provider,true))return json({error:'Accès refusé par votre agence.'},403)
 if((u.role!=='superadmin'&&u.agencyId!==saved.agency)||!(await loadAgencies()).some(a=>a.id===saved.agency&&a.status==='actif'))return json({error:'Accès refusé.'},403)
 await mutate<Pending>('platform/oauth/'+state+'.json',()=>saved,s=>{if(s.used)throw new Error('Session déjà utilisée.');return {...s,used:true}})
 if(url.searchParams.has('error'))return back(saved.agency,'denied')
 const p=providers[saved.provider],c=config(saved.provider);const form=new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:url.origin+'/api/connections?action=callback'});if(p.pkce)form.set('code_verifier',saved.verifier);if(!p.basic){form.set('client_id',c.id!);form.set('client_secret',c.secret!)}
 const response=await fetch(p.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(p.basic?{authorization:'Basic '+Buffer.from(c.id+':'+c.secret).toString('base64')}:{})},body:form,signal:AbortSignal.timeout(15000)});const tokens=await response.json();if(!response.ok||!tokens.access_token)return back(saved.agency,'failed')
 await mutate<Connection>(path(saved.agency,u.id,saved.provider),()=>null,()=>({encrypted:encrypt(JSON.stringify(tokens)),connectedAt:new Date().toISOString(),expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000,scope:tokens.scope||p.scope}));return back(saved.agency,'success')
 }
 const ctx=await context(req);if(!ctx)return json({error:'Non connecté.'},401)
 if(action==='meta-assets'){if(!canUseTool(ctx.u,'meta'))return json({error:'Accès refusé par votre agence.'},403);const connection=(await readJson<Connection>(path(ctx.agency,ctx.u.id,'meta'))).data;if(!connection)return json({error:'Reconnectez votre compte Meta.'},409);const token=await connectionToken(ctx.agency,ctx.u.id,'meta');const assets=await metaAssets(token);return json({assets,selected:connection.selected??[]},200,{'cache-control':'no-store'})}
 if(action==='canva-designs'){
  if(!canUseTool(ctx.u,'canva'))return json({error:'Accès refusé par votre agence.'},403)
  const token=await connectionToken(ctx.agency,ctx.u.id,'canva')
  const query=new URLSearchParams({sort_by:'modified_descending'})
  const cursor=url.searchParams.get('continuation');if(cursor&&cursor.length<=4096)query.set('continuation',cursor)
  const response=await fetch('https://api.canva.com/rest/v1/designs?'+query,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})
  if(!response.ok)return json({error:'Canva ne permet pas de charger les créations. Vérifiez votre autorisation et réessayez.'},502)
  const body=await response.json()
  return json({designs:(body.items||[]).map((d:{id:string;title?:string;thumbnail?:{url:string};urls?:{edit_url:string;view_url:string}})=>({id:d.id,title:d.title||'Sans titre',thumbnail:d.thumbnail?.url})),continuation:body.continuation||null},200,{'cache-control':'no-store'})
 }
 const connections=await Promise.all((Object.keys(providers) as Provider[]).map(async id=>{const {data}=await readJson<Connection>(path(ctx.agency,ctx.u.id,id));return {id,name:providers[id].name,allowed:canUseTool(ctx.u,id),canManage:canUseTool(ctx.u,id,true),configured:ready(id),connected:!!data&&(data.expiresAt>Date.now()||!!JSON.parse(decrypt(data.encrypted)).refresh_token),expired:!!data&&data.expiresAt<=Date.now()&&!JSON.parse(decrypt(data.encrypted)).refresh_token,connectedAt:data?.connectedAt}}));return json({connections},200,{'cache-control':'no-store'})
 }catch{return json({error:'Connexion indisponible. Réessayez.'},503)}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Origine refusée.'},403);try{const ctx=await context(req);if(!ctx)return json({error:'Non connecté.'},401);const b=await req.json();if(!Object.hasOwn(providers,b.provider))return json({error:'Fournisseur inconnu.'},400);const id=b.provider as Provider,p=providers[id];if(!canUseTool(ctx.u,id,true))return json({error:'La direction de votre agence doit autoriser cette action.'},403);if(b.action==='select'&&id==='meta'){const connection=(await readJson<Connection>(path(ctx.agency,ctx.u.id,id))).data;if(!connection||connection.expiresAt<Date.now())return json({error:'Reconnectez Meta.'},409);const assets=await metaAssets(JSON.parse(decrypt(connection.encrypted)).access_token);if(!Array.isArray(b.selected)||b.selected.some((x:unknown)=>typeof x!=='string'||!assets.some(a=>a.id===x)))return json({error:'Compte non autorisé.'},400);await mutate<Connection>(path(ctx.agency,ctx.u.id,id),()=>null,c=>c?{...c,selected:b.selected}:null);return json({ok:true})}if(b.action==='disconnect'){await mutate<Connection>(path(ctx.agency,ctx.u.id,id),()=>null,()=>null);return json({ok:true})}if(b.action!=='start')return json({error:'Action inconnue.'},400);if(!ready(id))return json({error:'Application développeur non configurée par ImmoPilot.'},503);const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');await mutate<Pending>('platform/oauth/'+state+'.json',()=>({uid:ctx.u.id,agency:ctx.agency,provider:id,verifier,expires:Date.now()+600000,used:false}),s=>s);const url=new URL(p.auth);url.search=new URLSearchParams({client_id:config(id).id!,response_type:'code',redirect_uri:new URL(req.url).origin+'/api/connections?action=callback',state,...(id==='meta'?{config_id:process.env.META_CONFIG_ID!}:{}),...(p.scope?{scope:p.scope}:{}),...(p.pkce?{code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}:{})}).toString();return json({url:url.href},200,{'set-cookie':cookie(state),'cache-control':'no-store'})}catch{return json({error:'Connexion indisponible. Réessayez.'},503)}}

async function metaAssets(token:string){const result:{id:string;name:string;kind:string}[]=[];for(const edge of ['accounts','adaccounts']){let after='';for(let page=0;page<20;page++){const q=new URLSearchParams({fields:edge==='accounts'?'id,name,instagram_business_account{id,username}':'id,name',limit:'100',...(after?{after}:{})});const r=await fetch('https://graph.facebook.com/'+process.env.META_GRAPH_VERSION+'/me/'+edge+'?'+q,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Autorisations Meta insuffisantes.');const b=await r.json();for(const a of b.data??[]){result.push({id:a.id,name:a.name||a.id,kind:edge==='accounts'?'Facebook':'Publicité Meta'});if(a.instagram_business_account)result.push({id:a.instagram_business_account.id,name:a.instagram_business_account.username||a.instagram_business_account.id,kind:'Instagram'})}if(!b.paging?.next)break;after=b.paging?.cursors?.after;if(!after)break;if(page===19)throw new Error('Trop de comptes pour cette connexion.')} }return result}
