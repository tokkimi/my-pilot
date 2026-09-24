import { currentUser, json, sameOrigin, loadUsers, USERS, uid, type User } from '../server/platform.js'
import { mutate, readJson } from '../server/storage.js'
interface Thread { id:string; agencyId:string; kind:'direct'|'group'|'support'; title:string; members:string[]; createdBy:string; updatedAt:string; read:Record<string,string> }
interface Message { id:string; sender:string; text:string; at:string; reactions:Record<string,string[]> }
const INDEX='platform/conversations.json'
const path=(id:string)=>`platform/messages/${id}.json`
const visible=(t:Thread,u:User)=>t.kind==='support' ? (u.role==='superadmin'||t.agencyId===u.agencyId&&t.members.includes(u.id)) : t.agencyId===(u.role==='superadmin'?u.ownAgencyId:u.agencyId)&&t.members.includes(u.id)
const person=(u:User)=>({id:u.id,name:u.role==='superadmin'?'ImmoPilot':u.name,avatar:u.role==='superadmin'?'':u.avatar??''})
export async function GET(req:Request){try{
 const u=await currentUser(req,true);if(!u)return json({error:'Non connecté.'},401)
 const users=await loadUsers();const threads=((await readJson<Thread[]>(INDEX)).data??[]).filter(t=>visible(t,u))
 const id=new URL(req.url).searchParams.get('thread');const thread=id?threads.find(t=>t.id===id):null
 if(id&&!thread)return json({error:'Conversation inaccessible.'},403)
 const messages=thread?((await readJson<Message[]>(path(thread.id))).data??[]).slice(-200):[]
 const peers=users.filter(p=>p.active&&p.agencyId===(u.role==='superadmin'?u.ownAgencyId:u.agencyId)&&p.role!=='superadmin')
 const ids=new Set([...peers.map(p=>p.id),...threads.flatMap(t=>t.members),...messages.map(m=>m.sender),u.id])
 return json({me:person(u),support:u.role==='superadmin',people:users.filter(p=>ids.has(p.id)).map(person),peers:peers.map(person),threads:threads.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),messages})
}catch{return json({error:'Impossible de charger les messages.'},500)}}
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'Origine refusée.'},403)
try{const u=await currentUser(req,true);if(!u)return json({error:'Non connecté.'},401)
 const b=await req.json();const users=await loadUsers();const agencyId=u.role==='superadmin'?u.ownAgencyId:u.agencyId
 if(b.action==='avatar'){
  const avatar=String(b.avatar??'');if(avatar.length>300000||avatar&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))return json({error:'Image invalide (300 Ko maximum).'},400)
  await mutate<User[]>(USERS,()=>[],list=>list.map(p=>p.id===u.id?{...p,avatar}:p));return json({ok:true})
 }
 if(b.action==='create'){
  const kind=b.kind;if(!['direct','group','support'].includes(kind)||!agencyId)return json({error:'Type invalide.'},400)
  const members=[...new Set<string>([u.id,...(Array.isArray(b.members)?b.members.filter((x:unknown)=>typeof x==='string'):[])])]
  if(members.length>100||members.some(id=>id!==u.id&&!users.some(p=>p.id===id&&p.agencyId===agencyId&&p.active&&p.role!=='superadmin')))return json({error:'Choisissez uniquement des membres de votre agence.'},403)
  if(kind==='direct'&&members.length!==2||kind==='group'&&members.length<2||kind==='support'&&members.length!==1)return json({error:'Participants invalides.'},400)
  const title=String(b.title??'').trim().slice(0,100);if(kind==='group'&&!title)return json({error:'Titre requis.'},400)
  let id=uid('chat_');await mutate<Thread[]>(INDEX,()=>[],list=>{const old=kind!=='group'?list.find(t=>t.agencyId===agencyId&&t.kind===kind&&t.members.length===members.length&&members.every(m=>t.members.includes(m))):null;if(old){id=old.id;return list}return [...list,{id,agencyId,kind,title:kind==='support'?'ImmoPilot':title,members,createdBy:u.id,updatedAt:new Date().toISOString(),read:{}}]});return json({id})
 }
 const thread=((await readJson<Thread[]>(INDEX)).data??[]).find(t=>t.id===b.id)
 if(!thread||!visible(thread,u))return json({error:'Conversation inaccessible.'},403)
 if(b.action==='send'){
  const text=String(b.text??'').trim();if(!text||text.length>5000)return json({error:'Message vide ou trop long (5 000 caractères).'},400)
  const at=new Date().toISOString();const message:Message={id:uid('msg_'),sender:u.id,text,at,reactions:{}}
  await mutate<Message[]>(path(thread.id),()=>[],list=>[...list,message]);await mutate<Thread[]>(INDEX,()=>[],list=>list.map(t=>t.id===thread.id?{...t,updatedAt:at,read:{...t.read,[u.id]:at}}:t));return json({ok:true})
 }
 if(b.action==='read'){await mutate<Thread[]>(INDEX,()=>[],list=>list.map(t=>t.id===thread.id?{...t,read:{...t.read,[u.id]:new Date().toISOString()}}:t));return json({ok:true})}
 if(b.action==='rename'){
  if(thread.kind!=='group'||thread.createdBy!==u.id)return json({error:'Réservé au créateur du groupe.'},403)
  const title=String(b.title??'').trim().slice(0,100);if(!title)return json({error:'Titre requis.'},400)
  await mutate<Thread[]>(INDEX,()=>[],list=>list.map(t=>t.id===thread.id?{...t,title}:t));return json({ok:true})
 }
 if(b.action==='react'){
  const emoji=String(b.emoji);if(!['❤️','👍','😂','🎉','😮','🙏'].includes(emoji))return json({error:'Réaction invalide.'},400)
  await mutate<Message[]>(path(thread.id),()=>[],list=>list.map(m=>{if(m.id!==b.messageId)return m;const old=m.reactions[emoji]??[];return {...m,reactions:{...m.reactions,[emoji]:old.includes(u.id)?old.filter(id=>id!==u.id):[...old,u.id]}}}));return json({ok:true})
 }
 return json({error:'Action inconnue.'},400)
}catch{return json({error:'Impossible d’enregistrer. Réessayez.'},500)}}
