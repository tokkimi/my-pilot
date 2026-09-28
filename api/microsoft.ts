import {currentUser,loadAgencies,json,sameOrigin} from '../server/platform.js'
import {canUseTool} from '../server/tool-access.js'
import {connectionToken} from './connections.js'
import {readJson} from '../server/storage.js'
async function context(req:Request,write=false){
 const user=await currentUser(req)
 if(!user)return null
 if(!canUseTool(user,'microsoft',write))return null
 const agency=user.role==='superadmin'?new URL(req.url).searchParams.get('agency')||user.ownAgencyId:user.agencyId
 if(!agency||!(await loadAgencies()).some(a=>a.id===agency&&a.status==='actif'))return null
 return {user,agency}
}
async function graph(token:string,path:string,init:RequestInit={}){
 const r=await fetch('https://graph.microsoft.com/v1.0/me/'+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',Prefer:'outlook.timezone="UTC"'},signal:AbortSignal.timeout(15000)})
 if(!r.ok)throw new Error(r.status===401?'Reconnectez Microsoft.':r.status===403?'Microsoft refuse cet accès. Renouvelez la connexion avec les autorisations nécessaires.':'Microsoft est temporairement indisponible.')
 return r.json()
}
export async function GET(req:Request){try{
 const c=await context(req);if(!c)return json({error:'Accès Microsoft non autorisé.'},403)
 const connection=(await readJson<{scope:string}>(`agencies/${c.agency}/connections/${c.user.id}/microsoft.json`)).data
 if(!connection)return json({connected:false,events:[]})
 const query=new URL(req.url).searchParams,from=query.get('from')||new Date().toISOString(),to=query.get('to')||new Date(Date.now()+31*86400000).toISOString()
 if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>93*86400000)return json({error:'Choisissez une période de 93 jours maximum.'},400)
 const token=await connectionToken(c.agency,c.user.id,'microsoft')
 const params=new URLSearchParams({startDateTime:from,endDateTime:to,'$top':'100','$select':'id,subject,start,end,location,isAllDay,isOrganizer,isCancelled','$orderby':'start/dateTime'})
 const b=await graph(token,'calendarView?'+params)
 return json({connected:true,canManage:canUseTool(c.user,'microsoft',true)&&connection.scope.includes('Calendars.ReadWrite'),hasMore:!!b['@odata.nextLink'],events:b.value||[]},200,{'cache-control':'no-store'})
}catch(e){return json({error:(e as Error).message},502)}}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origine refusée.'},403)
 try{
 const c=await context(req,true);if(!c)return json({error:'Modification Microsoft non autorisée.'},403)
 const b=await req.json()
 if(b.action!=='update'||typeof b.id!=='string'||!b.id||b.id.length>2048||typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>255)return json({error:'Événement invalide.'},400)
 const token=await connectionToken(c.agency,c.user.id,'microsoft')
 // Change only the title; preserve participants, recurrence, conference and body.
 const event=await graph(token,'events/'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({subject:b.subject.trim()})})
 return json({ok:true,id:event.id},200,{'cache-control':'no-store'})
 }catch(e){return json({error:(e as Error).message},502)}
}
