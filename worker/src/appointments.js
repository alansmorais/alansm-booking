import { createFirestoreRest } from "./firestore-rest.js";

const SLOT_MINUTES = 5;
const MAX_SERVICE_MINUTES = 480;
const MAX_BOOKING_DAYS_AHEAD = 180;
const ACTIVE_STATUSES = new Set(["pending", "booked", "confirmed"]);
const ROOT = "projects/gen-lang-client-0623364466/databases/(default)/documents";

const clean = (value, max) => typeof value === "string" ? value.trim().replace(/\\s+/g, " ").slice(0, max) : "";
const validId = (value) => value.length > 0 && value.length <= 128 && !value.includes("/");
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const sha256 = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const docPath = (path) => `${ROOT}/${path}`;
const fieldsOf = (snap) => snap?.fields || {};
const field = (snap, key) => fieldsOf(snap)[key];
const clockMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value)) return null;
  const [h,m] = value.split(":").map(Number);
  return h * 60 + m;
};
function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const weekday = ({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[get("weekday")];
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday, minute: Number(get("hour"))*60+Number(get("minute")) };
}
function scheduleCovers(periods, start, end) {
  if (!Array.isArray(periods)) return false;
  return periods.some((p) => {
    if (!p || typeof p !== "object") return false;
    const a=clockMinutes(p.start), b=clockMinutes(p.end);
    if (a===null || b===null || a>=b || start<a || end>b) return false;
    return !(Array.isArray(p.breaks) ? p.breaks : []).some((x) => {
      const c=clockMinutes(x?.start), d=clockMinutes(x?.end);
      return c!==null && d!==null && c<d && start<d && c<end;
    });
  });
}
function timestampMs(value) {
  if (typeof value !== "string") return NaN;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : NaN;
}
function queryFilter(fieldPath, op, value) {
  return { fieldFilter: { field: { fieldPath }, op, value } };
}
function and(...filters) {
  return { compositeFilter: { op: "AND", filters } };
}

export async function createAppointment(claims, input, env) {
  const tenantId=clean(input?.tenantId,128), professionalId=clean(input?.professionalId,128);
  const serviceId=clean(input?.serviceId,128), clientId=clean(input?.clientId,128);
  const idempotencyKey=clean(input?.idempotencyKey,128), notes=clean(input?.notes,500);
  const startMs=input?.startAtMs;
  if (![tenantId,professionalId,serviceId,clientId].every(validId) ||
      idempotencyKey.length<8 || !Number.isSafeInteger(startMs)) {
    throw fail("invalid-argument","Dados obrigatórios da reserva inválidos.");
  }
  const nowMs=Date.now(), slotMs=SLOT_MINUTES*60000;
  if (startMs%slotMs!==0 || startMs<=nowMs || startMs>nowMs+MAX_BOOKING_DAYS_AHEAD*86400000) {
    throw fail("invalid-argument","Escolha um horário futuro válido, em intervalos de cinco minutos.");
  }
  const userResponse=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})
  });
  const userData=await userResponse.json().catch(()=>({}));
  const user=userData.users?.[0];
  if(!userResponse.ok || !user || user.localId!==claims.sub) throw fail("unauthenticated","Entre novamente para continuar.",401);
  if(user.disabled===true) throw fail("permission-denied","Esta conta está desativada.",403);

  const store=createFirestoreRest({getAccessToken:env.getGoogleAccessToken});
  const tx=await store.begin();
  try {
    const idemHash=await sha256(idempotencyKey);
    const requestHash=await sha256(JSON.stringify({tenantId,professionalId,serviceId,clientId,startMs,notes}));
    const idemPath=`tenants/${tenantId}/idempotencyKeys/${idemHash}`;
    const [tenant,member,service,professional,client,idem]=await Promise.all([
      tx.get(`tenants/${tenantId}`),tx.get(`tenants/${tenantId}/members/${claims.sub}`),
      tx.get(`tenants/${tenantId}/services/${serviceId}`),tx.get(`tenants/${tenantId}/professionals/${professionalId}`),
      tx.get(`tenants/${tenantId}/clients/${clientId}`),tx.get(idemPath)
    ]);
    const t=fieldsOf(tenant), m=fieldsOf(member), s=fieldsOf(service), p=fieldsOf(professional), c=fieldsOf(client), saved=fieldsOf(idem);
    if(!tenant.exists || t.status!=="active" || !member.exists || m.status!=="active") throw fail("permission-denied","Não tem acesso a esta empresa.",403);
    if(!["owner","admin","staff"].includes(clean(m.role,20))) throw fail("permission-denied","Não tem permissão para criar reservas.",403);
    if(!service.exists || s.status!=="active" || !professional.exists || p.status!=="active" || !client.exists) throw fail("failed-precondition","Profissional, serviço ou cliente indisponível.",412);
    if(idem.exists) {
      if(saved.requestHash!==requestHash) throw fail("already-exists","Esta chave de operação já foi utilizada com outros dados.",409);
      await tx.rollback();
      return {ok:true,appointmentId:saved.appointmentId,replayed:true};
    }
    const duration=s.durationMinutes, priceMinor=s.priceMinor, currency=clean(s.currency,3);
    if(!Number.isInteger(duration)||duration<SLOT_MINUTES||duration>MAX_SERVICE_MINUTES||duration%SLOT_MINUTES!==0||
       !Number.isSafeInteger(priceMinor)||priceMinor<0||!/^[A-Z]{3}$/.test(currency)) {
      throw fail("failed-precondition","O serviço tem duração ou preço inválido.",412);
    }
    const endMs=startMs+duration*60000, endAt=new Date(endMs);
    const firstDay=Math.floor(startMs/86400000), lastDay=Math.floor((endMs-1)/86400000);
    const guardBase=await sha256(professionalId);
    const guardPaths=Array.from({length:lastDay-firstDay+1},(_,i)=>`tenants/${tenantId}/bookingGuards/${guardBase.slice(0,24)}_${firstDay+i}`);
    const guards=await Promise.all(guardPaths.map(path=>tx.get(path)));
    const timezone=clean(t.timezone,80);
    try { new Intl.DateTimeFormat("en-US",{timeZone:timezone}); } catch { throw fail("failed-precondition","A empresa precisa de um fuso horário válido.",412); }
    const localStart=localDateParts(new Date(startMs),timezone), localEnd=localDateParts(new Date(endMs-1),timezone);
    if(localStart.date!==localEnd.date || !Number.isInteger(localStart.weekday)) throw fail("failed-precondition","Reservas que atravessam a meia-noite local ainda não são suportadas.",412);
    const date=localStart.date, professionalScheduleId=`professional_${professionalId}`;
    const blocksQuery={from:[{collectionId:"blocks"}],where:queryFilter("date","EQUAL",{stringValue:date})};
    const appointmentQuery={from:[{collectionId:"appointments"}],where:and(
      queryFilter("professionalId","EQUAL",{stringValue:professionalId}),
      queryFilter("startAt","GREATER_THAN_OR_EQUAL",{timestampValue:new Date(startMs-MAX_SERVICE_MINUTES*60000).toISOString()}),
      queryFilter("startAt","LESS_THAN",{timestampValue:new Date(endMs).toISOString()})
    )};
    const [companySchedule,professionalSchedule,companyException,professionalException,blocks,appointments]=await Promise.all([
      tx.get(`tenants/${tenantId}/scheduleSettings/company`),
      tx.get(`tenants/${tenantId}/scheduleSettings/${professionalScheduleId}`),
      tx.get(`tenants/${tenantId}/scheduleExceptions/${date}`),
      tx.get(`tenants/${tenantId}/professionalExceptions/${professionalId}_${date}`),
      tx.query(blocksQuery,`tenants/${tenantId}`),
      tx.query(appointmentQuery,`tenants/${tenantId}`)
    ]);
    if(companyException.exists||professionalException.exists) throw fail("failed-precondition","A empresa ou o profissional está indisponível nesta data.",412);
    const dayKey=String(localStart.weekday), endMinute=localEnd.minute+1;
    if(!scheduleCovers(field(companySchedule,"days")?.[dayKey],localStart.minute,endMinute)||
       !scheduleCovers(field(professionalSchedule,"days")?.[dayKey],localStart.minute,endMinute)) {
      throw fail("failed-precondition","O horário está fora do funcionamento da empresa ou do profissional, ou inclui uma pausa.",412);
    }
    const blocked=blocks.some(doc=>{
      const b=doc.fields||{};
      if(b.professionalId && b.professionalId!==professionalId) return false;
      const a=clockMinutes(b.start), z=clockMinutes(b.end);
      return a!==null&&z!==null&&localStart.minute<z&&a<endMinute;
    });
    if(blocked) throw fail("already-exists","Este horário está bloqueado.",409);
    const conflict=appointments.some(doc=>{
      const a=doc.fields||{};
      if(!ACTIVE_STATUSES.has(a.status)) return false;
      const existingStart=timestampMs(a.startAt), existingEnd=timestampMs(a.endAt);
      return Number.isFinite(existingStart)&&Number.isFinite(existingEnd)&&existingStart<endMs&&startMs<existingEnd;
    });
    if(conflict) throw fail("already-exists","Este horário acabou de ser reservado. Escolha outro horário.",409);

    const appointmentId=crypto.randomUUID().replace(/-/g,"");
    const auditId=crypto.randomUUID().replace(/-/g,"");
    guardPaths.forEach((path,index)=>{
      const revision=guards[index].fields?.revision;
      tx.transform(path,{
        professionalId,utcDay:firstDay+index,
        revision:Number.isSafeInteger(revision)?revision+1:1
      },["updatedAt"]);
    });
    tx.transform(`tenants/${tenantId}/appointments/${appointmentId}`,{
      tenantId,professionalId,serviceId,clientId,clientName:clean(c.name,100),
      startAt:new Date(startMs),endAt,status:"booked",priceMinor,currency,notes,
      idempotencyKeyHash:idemHash,createdBy:claims.sub
    },["createdAt","updatedAt"]);
    tx.transform(idemPath,{requestHash,appointmentId},["createdAt"]);
    tx.transform(`tenants/${tenantId}/auditLog/${auditId}`,{
      tenantId,actorUid:claims.sub,action:"appointment.created",resourceType:"appointment",resourceId:appointmentId
    },["createdAt"]);
    await tx.commit();
    return {ok:true,appointmentId,replayed:false};
  } catch(error) {
    await tx.rollback();
    throw error;
  }
}
