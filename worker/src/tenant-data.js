import { createFirestoreRest } from "./firestore-rest.js";

const clean=(v,n)=>typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,n):"";
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=128&&!v.includes("/");
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const fields=s=>s?.fields||{};
const auditId=()=>crypto.randomUUID().replace(/-/g,"");
const timestampMs=v=>typeof v==="string"?Date.parse(v):NaN;
const filter=(fieldPath,op,value)=>({fieldFilter:{field:{fieldPath},op,value}});
const and=(...filters)=>({compositeFilter:{op:"AND",filters}});
async function verifyUser(claims,env){
 if(!env.FIREBASE_WEB_API_KEY)throw fail("internal","Configuração de autenticação indisponível.",500);
 const r=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})});
 const j=await r.json().catch(()=>({})),u=j.users?.[0];
 if(!r.ok||!u||u.localId!==claims.sub)throw fail("unauthenticated","Entre novamente para continuar.",401);
 if(u.disabled===true)throw fail("permission-denied","Esta conta está desativada.",403);
}
async function begin(env){return createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();}
async function requireMember(tx,uid,tenantId,manager=false){
 const [tenant,member]=await Promise.all([tx.get("tenants/"+tenantId),tx.get("tenants/"+tenantId+"/members/"+uid)]);
 const t=fields(tenant),m=fields(member),roles=manager?["owner","admin"]:["owner","admin","staff"];
 if(!tenant.exists||t.status!=="active"||!member.exists||m.status!=="active"||!roles.includes(clean(m.role,20)))throw fail("permission-denied","Não tem acesso a esta empresa.",403);
 return {tenant:t,member:m};
}
async function run(env,fn){
 const tx=await begin(env);
 try{const result=await fn(tx);if(!tx.finished)await tx.commit();return result;}
 catch(e){await tx.rollback();throw e;}
}
export async function getTenantCatalog(claims,input,env){
 const tenantId=clean(input?.tenantId,128);
 if(!validId(tenantId))throw fail("invalid-argument","Empresa inválida.");
 await verifyUser(claims,env);
 return run(env,async tx=>{
  await requireMember(tx,claims.sub,tenantId);
  const [professionals,services]=await Promise.all([
   tx.query({from:[{collectionId:"professionals"}],where:filter("status","EQUAL",{stringValue:"active"}),limit:100}, "tenants/"+tenantId),
   tx.query({from:[{collectionId:"services"}],where:filter("status","EQUAL",{stringValue:"active"}),limit:200}, "tenants/"+tenantId)
  ]);
  return {ok:true,professionals:professionals.map(d=>({id:d.id,name:clean(d.fields.name||d.fields.displayName,100),status:"active",...(typeof d.fields.color==="string"?{color:clean(d.fields.color,20)}:{})})),services:services.map(d=>({id:d.id,name:clean(d.fields.name||d.fields.title,100),status:"active",durationMinutes:Number.isInteger(d.fields.durationMinutes)?d.fields.durationMinutes:null,priceMinor:Number.isSafeInteger(d.fields.priceMinor)?d.fields.priceMinor:null,currency:/^[A-Z]{3}$/.test(d.fields.currency||"")?d.fields.currency:null}))};
 });
}
export async function getAgendaAppointments(claims,input,env){
 const tenantId=clean(input?.tenantId,128),startAtMs=input?.startAtMs,endAtMs=input?.endAtMs,professionalId=clean(input?.professionalId,128);
 if(!validId(tenantId)||!Number.isSafeInteger(startAtMs)||!Number.isSafeInteger(endAtMs)||endAtMs<=startAtMs||endAtMs-startAtMs>31*86400000||(professionalId&&!validId(professionalId)))throw fail("invalid-argument","Intervalo da agenda inválido. Consulte no máximo 31 dias.");
 await verifyUser(claims,env);
 return run(env,async tx=>{
  await requireMember(tx,claims.sub,tenantId);
  const filters=[filter("startAt","GREATER_THAN_OR_EQUAL",{timestampValue:new Date(startAtMs-480*60000).toISOString()}),filter("startAt","LESS_THAN",{timestampValue:new Date(endAtMs).toISOString()})];
  if(professionalId)filters.push(filter("professionalId","EQUAL",{stringValue:professionalId}));
  const docs=await tx.query({from:[{collectionId:"appointments"}],where:and(...filters),orderBy:[{field:{fieldPath:"startAt"},direction:"ASCENDING"}],limit:500},"tenants/"+tenantId);
  const appointments=docs.flatMap(d=>{
   const v=d.fields,start=timestampMs(v.startAt),end=timestampMs(v.endAt);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=startAtMs||start>=endAtMs||!["pending","booked","confirmed","cancelled","completed","no_show"].includes(v.status))return [];
   return [{id:d.id,professionalId:clean(v.professionalId,128),serviceId:clean(v.serviceId,128),clientId:clean(v.clientId,128),clientName:clean(v.clientName,100),notes:clean(v.notes,500),startAtMs:start,endAtMs:end,status:clean(v.status,24),priceMinor:Number.isSafeInteger(v.priceMinor)?v.priceMinor:null,currency:/^[A-Z]{3}$/.test(v.currency||"")?v.currency:null}];
  });
  return {ok:true,appointments,truncated:docs.length===500};
 });
}
export async function getTenantClients(claims,input,env){
 const tenantId=clean(input?.tenantId,128);
 if(!validId(tenantId))throw fail("invalid-argument","Empresa inválida.");
 await verifyUser(claims,env);
 return run(env,async tx=>{
  await requireMember(tx,claims.sub,tenantId);
  const docs=await tx.query({from:[{collectionId:"clients"}],limit:200},"tenants/"+tenantId);
  const clients=docs.flatMap(d=>{const v=d.fields;if(v.status==="inactive")return [];return [{id:d.id,name:clean(v.name,100),phone:clean(v.phone,30),email:clean(v.email,254),notes:clean(v.notes,300),status:clean(v.status||"active",20)}];});
  return {ok:true,clients,truncated:docs.length===200};
 });
}
export async function saveTenantClient(claims,input,env){
 const tenantId=clean(input?.tenantId,128),clientId=clean(input?.clientId,128),name=clean(input?.name,100),phone=clean(input?.phone,30),email=clean(input?.email,254).toLowerCase(),notes=clean(input?.notes,300),status=clean(input?.status||"active",20);
 if(!validId(tenantId)||(clientId&&!validId(clientId))||!["active","inactive"].includes(status)||(status==="active"&&name.length<2)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(phone&&!/^[+0-9() .-]{7,30}$/.test(phone)))throw fail("invalid-argument","Nome, contacto ou estado do cliente inválido.");
 await verifyUser(claims,env);
 return run(env,async tx=>{
  await requireMember(tx,claims.sub,tenantId);
  const path="tenants/"+tenantId+"/clients/"+(clientId||crypto.randomUUID().replace(/-/g,""));
  const existing=await tx.get(path);
  if(clientId&&!existing.exists)throw fail("not-found","Cliente não encontrado.",404);
  const previous=fields(existing),data={tenantId,name:name||clean(previous.name,100),phone:phone||(input?.phone===""?"":clean(previous.phone,30)),email:email||(input?.email===""?"":clean(previous.email,254)),notes:notes||(input?.notes===""?"":clean(previous.notes,300)),status,updatedBy:claims.sub};
  if(!existing.exists)data.createdBy=claims.sub;
  tx.transform(path,data,existing.exists?["updatedAt"]:["createdAt","updatedAt"]);
  tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"client."+(!existing.exists?"created":status==="inactive"?"deactivated":"updated"),resourceType:"client",resourceId:path.split("/").pop()},["createdAt"]);
  return {ok:true,clientId:path.split("/").pop(),status};
 });
}
