import { createFirestoreRest } from "./firestore-rest.js";
const clean=(v,n)=>typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,n):"";
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=128&&!v.includes("/");
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const data=s=>s?.fields||{};
const dateOK=v=>{if(typeof v!=="string"||! /^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00.000Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
const minutes=v=>{if(typeof v!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return null;const [h,m]=v.split(":").map(Number);return h*60+m;};
const auditId=()=>crypto.randomUUID().replace(/-/g,"");
export function validateSchedulePeriods(value){
 if(!Array.isArray(value)||value.length>2)return false;let lastEnd=-1;
 for(const p of value){if(!p||typeof p!=="object"||Array.isArray(p))return false;const start=minutes(p.start),end=minutes(p.end);if(start===null||end===null||start>=end||start<lastEnd)return false;lastEnd=end;const breaks=p.breaks??[];if(!Array.isArray(breaks)||breaks.length>4)return false;let breakEnd=start;for(const b of breaks){if(!b||typeof b!=="object"||Array.isArray(b))return false;const bs=minutes(b.start),be=minutes(b.end);if(bs===null||be===null||bs>=be||bs<start||be>end||bs<breakEnd)return false;breakEnd=be;}}
 return true;
}
async function verifyUser(claims,env){
 if(!env.FIREBASE_WEB_API_KEY)throw fail("internal","Configuração de autenticação indisponível.",500);
 const r=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})});
 const j=await r.json().catch(()=>({})),u=j.users?.[0];if(!r.ok||!u||u.localId!==claims.sub)throw fail("unauthenticated","Entre novamente para continuar.",401);if(u.disabled===true)throw fail("permission-denied","Esta conta está desativada.",403);
}
async function withTx(env,fn){const tx=await createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();try{const out=await fn(tx);if(!tx.finished)await tx.commit();return out;}catch(e){await tx.rollback();throw e;}}
async function context(tx,uid,tenantId,write){
 const [tenant,member]=await Promise.all([tx.get("tenants/"+tenantId),tx.get("tenants/"+tenantId+"/members/"+uid)]),t=data(tenant),m=data(member);
 const roles=write?["owner","admin"]:["owner","admin","staff"];
 if(!tenant.exists||t.status!=="active"||!member.exists||m.status!=="active"||!roles.includes(clean(m.role,20)))throw fail("permission-denied",write?"Apenas proprietários e administradores podem alterar horários.":"Não tem acesso a esta empresa.",403);
 return t;
}
export async function saveScheduleSettings(claims,input,env){
 const tenantId=clean(input?.tenantId,128),scope=clean(input?.scope,20),professionalId=clean(input?.professionalId,128);
 if(!validId(tenantId)||!["company","professional"].includes(scope)||(scope==="professional"&&!validId(professionalId)))throw fail("invalid-argument","Empresa ou profissional inválido.");
 if(!input.days||typeof input.days!=="object"||Array.isArray(input.days))throw fail("invalid-argument","Informe os horários da semana.");
 if(Object.keys(input.days).some(k=>!/^[0-6]$/.test(k)))throw fail("invalid-argument","Os dias da semana devem usar números de 0 a 6.");
 const days={};for(let d=0;d<=6;d++){const p=input.days[String(d)]??[];if(!validateSchedulePeriods(p))throw fail("invalid-argument","Horários inválidos para o dia "+d+".");days[String(d)]=p;}
 await verifyUser(claims,env);
 return withTx(env,async tx=>{const tenant=await context(tx,claims.sub,tenantId,true);if(scope==="professional"&&!(await tx.get("tenants/"+tenantId+"/professionals/"+professionalId)).exists)throw fail("not-found","Profissional não encontrado.",404);
 const id=scope==="company"?"company":"professional_"+professionalId;
 tx.set("tenants/"+tenantId+"/scheduleSettings/"+id,{tenantId,scope,professionalId:scope==="professional"?professionalId:null,timezone:clean(tenant.timezone,80),days,updatedBy:claims.sub});
 tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"schedule.updated",resourceType:"schedule",resourceId:id},["createdAt"]);return{ok:true,scheduleId:id};});
}
export async function saveScheduleException(claims,input,env){
 const tenantId=clean(input?.tenantId,128),kind=clean(input?.kind,30),professionalId=clean(input?.professionalId,128),startDate=input?.startDate,endDate=input?.endDate??input?.startDate,reason=clean(input?.reason,240);
 if(!validId(tenantId)||!["companyClosure","professionalAbsence"].includes(kind)||(kind==="professionalAbsence"&&!validId(professionalId))||!dateOK(startDate)||!dateOK(endDate)||endDate<startDate)throw fail("invalid-argument","Período de indisponibilidade inválido.");
 const first=Date.parse(startDate+"T00:00:00.000Z"),last=Date.parse(endDate+"T00:00:00.000Z"),count=Math.round((last-first)/86400000)+1;if(count>90)throw fail("invalid-argument","O período máximo é de 90 dias por operação.");
 await verifyUser(claims,env);
 return withTx(env,async tx=>{const tenant=await context(tx,claims.sub,tenantId,true);if(kind==="professionalAbsence"&&!(await tx.get("tenants/"+tenantId+"/professionals/"+professionalId)).exists)throw fail("not-found","Profissional não encontrado.",404);
 const collection=kind==="companyClosure"?"scheduleExceptions":"professionalExceptions";
 for(let i=0;i<count;i++){const date=new Date(first+i*86400000).toISOString().slice(0,10),id=kind==="companyClosure"?date:professionalId+"_"+date;tx.set("tenants/"+tenantId+"/"+collection+"/"+id,{tenantId,date,kind,professionalId:kind==="professionalAbsence"?professionalId:null,reason,timezone:clean(tenant.timezone,80),updatedBy:claims.sub});}
 tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"schedule.exception_saved",resourceType:"scheduleException",resourceId:kind==="companyClosure"?startDate:professionalId+"_"+startDate,reason},["createdAt"]);return{ok:true,datesSaved:count};});
}
export async function saveScheduleBlock(claims,input,env){
 const tenantId=clean(input?.tenantId,128),blockId=clean(input?.blockId,128),date=input?.date,professionalId=clean(input?.professionalId,128);
 if(!validId(tenantId)||!dateOK(date))throw fail("invalid-argument","Empresa ou data inválida.");await verifyUser(claims,env);
 return withTx(env,async tx=>{await context(tx,claims.sub,tenantId,true);
 if(input?.remove===true){if(!validId(blockId))throw fail("invalid-argument","Identificador do bloqueio inválido.");if(!(await tx.get("tenants/"+tenantId+"/blocks/"+blockId)).exists)throw fail("not-found","Bloqueio não encontrado.",404);tx.delete("tenants/"+tenantId+"/blocks/"+blockId);tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"schedule.block_removed",resourceType:"scheduleBlock",resourceId:blockId},["createdAt"]);return{ok:true,blockId,removed:true};}
 const start=minutes(input?.start),end=minutes(input?.end);if(!validId(blockId||"new")||start===null||end===null||start>=end)throw fail("invalid-argument","Horário do bloqueio inválido.");
 if(professionalId&&!(await tx.get("tenants/"+tenantId+"/professionals/"+professionalId)).exists)throw fail("not-found","Profissional não encontrado.",404);
 if(blockId&&!(await tx.get("tenants/"+tenantId+"/blocks/"+blockId)).exists)throw fail("not-found","Bloqueio não encontrado.",404);
 const id=blockId||auditId();tx.set("tenants/"+tenantId+"/blocks/"+id,{tenantId,date,start:input.start,end:input.end,professionalId:professionalId||null,reason:clean(input.reason,240),updatedBy:claims.sub},{merge:true});
 tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:blockId?"schedule.block_updated":"schedule.block_created",resourceType:"scheduleBlock",resourceId:id},["createdAt"]);return{ok:true,blockId:id,removed:false};});
}
export async function getScheduleSettings(claims,input,env){
 const tenantId=clean(input?.tenantId,128);if(!validId(tenantId))throw fail("invalid-argument","Empresa inválida.");await verifyUser(claims,env);
 return withTx(env,async tx=>{await context(tx,claims.sub,tenantId,false);const parent="tenants/"+tenantId;
 const [company,pros,closures,absences,blockRows]=await Promise.all([
 tx.get(parent+"/scheduleSettings/company"),
 tx.query({from:[{collectionId:"scheduleSettings"}],where:{fieldFilter:{field:{fieldPath:"scope"},op:"EQUAL",value:{stringValue:"professional"}}},limit:100},parent),
 tx.query({from:[{collectionId:"scheduleExceptions"}],limit:200},parent),
 tx.query({from:[{collectionId:"professionalExceptions"}],limit:200},parent),
 tx.query({from:[{collectionId:"blocks"}],limit:200},parent)]);
 const defaults={0:[],1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]};
 const companySchedule=company.exists&&data(company).days?data(company).days:defaults,professionalSchedules={};
 for(const doc of pros){const d=doc.fields||{},pid=clean(d.professionalId,128);if(pid&&d.days)professionalSchedules[pid]=d.days;}
 const exceptions=closures.map(doc=>({id:doc.id,date:clean(doc.fields?.date,10),reason:clean(doc.fields?.reason,120)}));
 const professionalExceptions=absences.map(doc=>({id:doc.id,date:clean(doc.fields?.date,10),professionalId:clean(doc.fields?.professionalId,128),reason:clean(doc.fields?.reason,120)}));
 const blocks=blockRows.map(doc=>({id:doc.id,date:clean(doc.fields?.date,10),start:clean(doc.fields?.start,5),end:clean(doc.fields?.end,5),professionalId:doc.fields?.professionalId?clean(doc.fields.professionalId,128):null,reason:clean(doc.fields?.reason,240)}));
 return{ok:true,companySchedule,professionalSchedules,exceptions,professionalExceptions,blocks};});
}
