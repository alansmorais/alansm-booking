import { createFirestoreRest } from "./firestore-rest.js";
const clean=(v,n)=>typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,n):"";
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const f=s=>s?.fields||{};
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=128&&!v.includes("/");
const slugify=v=>v.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
const reserved=new Set(["admin","administrator","api","app","assets","auth","booking","dashboard","help","login","logout","public","register","root","settings","support","www"]);
const dateOK=v=>{if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00.000Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
const minutes=v=>{if(typeof v!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return null;const [h,m]=v.split(":").map(Number);return h*60+m;};
const auditId=()=>crypto.randomUUID().replace(/-/g,"");
function localParts(date,timezone){const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date),get=k=>parts.find(p=>p.type===k)?.value||"";return{date:get("year")+"-"+get("month")+"-"+get("day"),weekday:({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[get("weekday")],minute:Number(get("hour"))*60+Number(get("minute"))};}
function covers(periods,start,end){return Array.isArray(periods)&&periods.some(p=>{const a=minutes(p?.start),b=minutes(p?.end);if(a===null||b===null||a>=b||start<a||end>b)return false;return !(Array.isArray(p.breaks)?p.breaks:[]).some(x=>{const c=minutes(x?.start),d=minutes(x?.end);return c!==null&&d!==null&&c<d&&start<d&&c<end;});});}
const eq=(field,value)=>({fieldFilter:{field:{fieldPath:field},op:"EQUAL",value:{stringValue:value}}});
const and=(...filters)=>({compositeFilter:{op:"AND",filters}});
async function readTx(env,fn){const tx=await createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();try{const result=await fn(tx);await tx.rollback();return result;}catch(e){await tx.rollback();throw e;}}
async function tenantBySlug(tx,slug){const slugDoc=await tx.get("tenantSlugs/"+slug);if(!slugDoc.exists)throw fail("not-found","Empresa não encontrada.",404);const tenantId=clean(f(slugDoc).tenantId,128);if(!validId(tenantId))throw fail("not-found","Empresa não encontrada.",404);const tenant=await tx.get("tenants/"+tenantId);if(!tenant.exists||f(tenant).status!=="active")throw fail("not-found","Empresa não disponível.",404);return{tenantId,tenant:f(tenant)};}
export async function getPublicBookingPage(input,env){
 const slug=slugify(clean(input?.slug,80));if(slug.length<3||reserved.has(slug))throw fail("invalid-argument","Endereço público inválido.");
 return readTx(env,async tx=>{const {tenantId,tenant}=await tenantBySlug(tx,slug),parent="tenants/"+tenantId;
 const [pros,services]=await Promise.all([tx.query({from:[{collectionId:"professionals"}],where:eq("status","active"),limit:100},parent),tx.query({from:[{collectionId:"services"}],where:eq("status","active"),limit:200},parent)]);
 return{ok:true,tenant:{tenantId,name:clean(tenant.name,80),slug,timezone:clean(tenant.timezone||"America/Sao_Paulo",80),currency:clean(tenant.currency||"BRL",3)},professionals:pros.map(d=>({id:d.id,name:clean(d.fields.name||d.fields.displayName,100),color:typeof d.fields.color==="string"?clean(d.fields.color,20):"#336699"})),services:services.map(d=>({id:d.id,name:clean(d.fields.name||d.fields.title,100),durationMinutes:Number.isInteger(d.fields.durationMinutes)?d.fields.durationMinutes:30,priceMinor:Number.isSafeInteger(d.fields.priceMinor)?d.fields.priceMinor:0,currency:/^[A-Z]{3}$/.test(d.fields.currency||"")?d.fields.currency:"BRL"}))};});
}
export async function getPublicAvailability(input,env){
 const slug=slugify(clean(input?.slug,80)),serviceId=clean(input?.serviceId,128),professionalId=clean(input?.professionalId,128),date=input?.date;
 if(slug.length<3||!validId(serviceId)||!dateOK(date))throw fail("invalid-argument","Parâmetros de consulta inválidos.");
 return readTx(env,async tx=>{
  const {tenantId,tenant}=await tenantBySlug(tx,slug),parent="tenants/"+tenantId,timezone=clean(tenant.timezone||"America/Sao_Paulo",80);
  try{new Intl.DateTimeFormat("en-US",{timeZone:timezone});}catch{throw fail("failed-precondition","Fuso horário da empresa inválido.",412);}
  const service=await tx.get(parent+"/services/"+serviceId);if(!service.exists||f(service).status!=="active")throw fail("not-found","Serviço não disponível.",404);
  const duration=Number(f(service).durationMinutes)||30;
  let pros=[];
  if(professionalId){const p=await tx.get(parent+"/professionals/"+professionalId);if(!p.exists||f(p).status!=="active")throw fail("not-found","Profissional não disponível.",404);pros=[{id:professionalId,name:clean(f(p).name,100)}];}
  else pros=(await tx.query({from:[{collectionId:"professionals"}],where:eq("status","active"),limit:50},parent)).map(d=>({id:d.id,name:clean(d.fields.name,100)}));
  if(!pros.length)return{ok:true,date,slots:[]};
  const closure=await tx.get(parent+"/scheduleExceptions/"+date);if(closure.exists)return{ok:true,date,slots:[]};
  const companyDoc=await tx.get(parent+"/scheduleSettings/company");
  const defaults={0:[],1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]};
  const companyDays=f(companyDoc).days||defaults,midday=new Date(date+"T12:00:00.000Z"),weekday=localParts(midday,timezone).weekday;
  const qStart=new Date(midday.getTime()-36*3600000).toISOString(),qEnd=new Date(midday.getTime()+36*3600000).toISOString();
  const [blocks,appts]=await Promise.all([
   tx.query({from:[{collectionId:"blocks"}],where:eq("date",date)},parent),
   tx.query({from:[{collectionId:"appointments"}],where:and({fieldFilter:{field:{fieldPath:"startAt"},op:"GREATER_THAN_OR_EQUAL",value:{timestampValue:qStart}}},{fieldFilter:{field:{fieldPath:"startAt"},op:"LESS_THAN_OR_EQUAL",value:{timestampValue:qEnd}}})},parent)
  ]);
  const active=appts.map(d=>d.fields||{}).filter(a=>["confirmed","booked","pending"].includes(a.status)&&typeof a.startAt==="string"&&localParts(new Date(a.startAt),timezone).date===date);
  const companyPeriods=companyDays[String(weekday)]||[];if(!companyPeriods.length)return{ok:true,date,slots:[]};
  const proStates=await Promise.all(pros.map(async p=>{const [s,a]=await Promise.all([tx.get(parent+"/scheduleSettings/professional_"+p.id),tx.get(parent+"/professionalExceptions/"+p.id+"_"+date)]);return{id:p.id,absent:a.exists,periods:f(s).days?.[String(weekday)]||companyPeriods};}));
  let min=1440,max=0;for(const p of companyPeriods){const a=minutes(p.start),b=minutes(p.end);if(a!==null)min=Math.min(min,a);if(b!==null)max=Math.max(max,b);}
  const now=localParts(new Date(),timezone),slots=[];
  for(let m=min;m+duration<=max;m+=30){const end=m+duration;if(!covers(companyPeriods,m,end)||date===now.date&&m<=now.minute+15)continue;
   let chosen=null;
   for(const p of proStates){if(p.absent||!covers(p.periods,m,end))continue;
    const blocked=blocks.some(d=>{const b=d.fields||{};if(b.professionalId&&b.professionalId!==p.id)return false;const a=minutes(b.start),z=minutes(b.end);return a!==null&&z!==null&&a<z&&m<z&&a<end;});if(blocked)continue;
    const overlap=active.some(a=>{if(a.professionalId!==p.id)return false;const s=localParts(new Date(a.startAt),timezone),e=localParts(new Date(a.endAt),timezone);return m<e.minute&&s.minute<end;});if(!overlap){chosen=p.id;break;}
   }
   if(chosen)slots.push({time:String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"),available:true,professionalId:chosen});
  }
  return{ok:true,date,slots};
 });
}

export async function createPublicAppointment(input,env){
 const slug=slugify(clean(input?.slug,80)),serviceId=clean(input?.serviceId,128),professionalId=clean(input?.professionalId,128),startMs=input?.startAtMs;
 const clientName=clean(input?.clientName,100),clientPhone=clean(input?.clientPhone,30),clientEmail=clean(input?.clientEmail,254).toLowerCase(),notes=clean(input?.notes,500),idempotencyKey=clean(input?.idempotencyKey,128);
 if(slug.length<3||!validId(serviceId)||clientName.length<2||!/^[+0-9() .-]{7,30}$/.test(clientPhone)||(clientEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail))||idempotencyKey.length<8||!Number.isSafeInteger(startMs))throw fail("invalid-argument","Dados de agendamento incompletos ou inválidos.");
 if(startMs%300000!==0||startMs<=Date.now()||startMs>Date.now()+180*86400000)throw fail("invalid-argument","Escolha um horário futuro válido em intervalos de cinco minutos.");
 const hash=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
 const tx=await createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();
 try{
  const slugDoc=await tx.get("tenantSlugs/"+slug);if(!slugDoc.exists)throw fail("not-found","Empresa não encontrada.",404);
  const tenantId=clean(f(slugDoc).tenantId,128);if(!validId(tenantId))throw fail("not-found","Empresa não encontrada.",404);
  const parent="tenants/"+tenantId,idemHash=await hash(idempotencyKey),idemPath=parent+"/idempotencyKeys/"+idemHash;
  const [tenantSnap,serviceSnap,idemSnap,recent,clients]=await Promise.all([
   tx.get(parent),tx.get(parent+"/services/"+serviceId),tx.get(idemPath),
   tx.query({from:[{collectionId:"appointments"}],where:and({fieldFilter:{field:{fieldPath:"clientPhone"},op:"EQUAL",value:{stringValue:clientPhone}}},{fieldFilter:{field:{fieldPath:"createdAt"},op:"GREATER_THAN_OR_EQUAL",value:{timestampValue:new Date(Date.now()-86400000).toISOString()}}})},parent),
   tx.query({from:[{collectionId:"clients"}],where:eq("phone",clientPhone),limit:1},parent)
  ]);
  const tenant=f(tenantSnap),service=f(serviceSnap);
  if(!tenantSnap.exists||tenant.status!=="active")throw fail("failed-precondition","Empresa não disponível.",412);
  if(!serviceSnap.exists||service.status!=="active")throw fail("failed-precondition","Serviço não disponível.",412);
  const requestHash=await hash(JSON.stringify({tenantId,professionalId,serviceId,startMs,clientPhone,idempotencyKey}));
  if(idemSnap.exists){const saved=f(idemSnap);if(saved.requestHash!==requestHash)throw fail("already-exists","Esta chave de operação já foi utilizada com outros dados.",409);await tx.rollback();return{ok:true,appointmentId:saved.appointmentId,replayed:true};}
  if(recent.length>=5)throw fail("resource-exhausted","Limite diário de agendamentos atingido para este número.",429);
  let chosen=professionalId;
  if(!chosen){const pros=await tx.query({from:[{collectionId:"professionals"}],where:eq("status","active"),limit:1},parent);if(!pros.length)throw fail("failed-precondition","Nenhum profissional disponível.",412);chosen=pros[0].id;}
  if(!validId(chosen))throw fail("invalid-argument","Profissional inválido.");
  const duration=Number(service.durationMinutes)||30,priceMinor=Number(service.priceMinor)||0,currency=clean(service.currency||tenant.currency||"BRL",3),timezone=clean(tenant.timezone||"America/Sao_Paulo",80);
  if(!Number.isInteger(duration)||duration<5||duration>480||duration%5!==0||!Number.isSafeInteger(priceMinor)||priceMinor<0||!/^[A-Z]{3}$/.test(currency))throw fail("failed-precondition","O serviço possui duração ou preço inválido.",412);
  const endMs=startMs+duration*60000,start=new Date(startMs),end=new Date(endMs),startLocal=localParts(start,timezone),endLocal=localParts(new Date(endMs-1),timezone),endMinute=endLocal.minute+1;
  if(startLocal.date!==endLocal.date)throw fail("invalid-argument","O agendamento não pode cruzar a meia-noite local.");
  const firstDay=Math.floor(startMs/86400000),lastDay=Math.floor((endMs-1)/86400000),guardBase=await hash(chosen),guardPaths=Array.from({length:lastDay-firstDay+1},(_,i)=>parent+"/bookingGuards/"+guardBase.slice(0,24)+"_"+(firstDay+i));
  const [proSnap,companySchedule,proSchedule,companyException,proException,blocks,appointments,guards]=await Promise.all([
   tx.get(parent+"/professionals/"+chosen),tx.get(parent+"/scheduleSettings/company"),tx.get(parent+"/scheduleSettings/professional_"+chosen),
   tx.get(parent+"/scheduleExceptions/"+startLocal.date),tx.get(parent+"/professionalExceptions/"+chosen+"_"+startLocal.date),
   tx.query({from:[{collectionId:"blocks"}],where:eq("date",startLocal.date)},parent),
   tx.query({from:[{collectionId:"appointments"}],where:and(eq("professionalId",chosen),{fieldFilter:{field:{fieldPath:"startAt"},op:"GREATER_THAN_OR_EQUAL",value:{timestampValue:new Date(startMs-480*60000).toISOString()}}},{fieldFilter:{field:{fieldPath:"startAt"},op:"LESS_THAN",value:{timestampValue:new Date(endMs).toISOString()}}})},parent),
   Promise.all(guardPaths.map(path=>tx.get(path)))
  ]);
  if(!proSnap.exists||f(proSnap).status!=="active")throw fail("failed-precondition","Profissional não disponível.",412);
  if(companyException.exists||proException.exists)throw fail("failed-precondition","A empresa ou profissional está fechado nesta data.",412);
  const defaults={0:[],1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]};
  const companyPeriods=(f(companySchedule).days||defaults)[String(startLocal.weekday)]||[],proPeriods=f(proSchedule).days?.[String(startLocal.weekday)]||companyPeriods;
  if(!covers(companyPeriods,startLocal.minute,endMinute)||!covers(proPeriods,startLocal.minute,endMinute))throw fail("failed-precondition","Horário fora do funcionamento ou durante intervalo.",412);
  const blocked=blocks.some(d=>{const b=d.fields||{};if(b.professionalId&&b.professionalId!==chosen)return false;const a=minutes(b.start),z=minutes(b.end);return a!==null&&z!==null&&a<z&&startLocal.minute<z&&a<endMinute;});
  if(blocked)throw fail("already-exists","Este horário está bloqueado.",409);
  const conflict=appointments.some(d=>{const a=d.fields||{},s=Date.parse(a.startAt),e=Date.parse(a.endAt);return["confirmed","booked","pending"].includes(a.status)&&Number.isFinite(s)&&Number.isFinite(e)&&startMs<e&&s<endMs;});
  if(conflict)throw fail("already-exists","Este profissional já possui um agendamento neste horário.",409);
  const clientId=clients.length?clients[0].id:crypto.randomUUID().replace(/-/g,""),appointmentId=crypto.randomUUID().replace(/-/g,""),audit=auditId();
  guardPaths.forEach((path,index)=>{const revision=guards[index].fields?.revision;tx.transform(path,{professionalId:chosen,utcDay:firstDay+index,revision:Number.isSafeInteger(revision)?revision+1:1},["updatedAt"]);});
  if(!clients.length)tx.transform(parent+"/clients/"+clientId,{tenantId,name:clientName,phone:clientPhone,email:clientEmail,status:"active",origin:"public_booking"},["createdAt","updatedAt"]);
  tx.transform(parent+"/appointments/"+appointmentId,{tenantId,professionalId:chosen,serviceId,clientId,clientName,clientPhone,clientEmail:clientEmail||null,startAt:start,endAt:end,status:"confirmed",origin:"public_online",priceMinor,currency,notes},["createdAt","updatedAt"]);
  tx.transform(idemPath,{requestHash,appointmentId},["createdAt"]);
  tx.transform(parent+"/auditLog/"+audit,{tenantId,actorUid:"public",action:"appointment.created_public",resourceType:"appointment",resourceId:appointmentId},["createdAt"]);
  await tx.commit();return{ok:true,appointmentId,replayed:false};
 }catch(e){await tx.rollback();throw e;}
}
