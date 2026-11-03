import { createFirestoreRest } from "./firestore-rest.js";

const clean=(v,n)=>typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,n):"";
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=128&&!v.includes("/");
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const fields=s=>s?.fields||{};
const auditId=()=>crypto.randomUUID().replace(/-/g,"");
const reserved=new Set(["admin","administrator","api","app","assets","auth","booking","dashboard","help","login","logout","public","register","root","settings","support","www"]);
const slugify=v=>v.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
const sha256=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
async function verifyUser(claims,env){
 if(!env.FIREBASE_WEB_API_KEY)throw fail("internal","Configuração de autenticação indisponível.",500);
 const r=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})});
 const j=await r.json().catch(()=>({})),u=j.users?.[0];
 if(!r.ok||!u||u.localId!==claims.sub)throw fail("unauthenticated","Entre novamente para continuar.",401);
 if(u.disabled===true)throw fail("permission-denied","Esta conta está desativada.",403);
 return u;
}
async function withTx(env,fn){const tx=await createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();try{const out=await fn(tx);if(!tx.finished)await tx.commit();return out;}catch(e){await tx.rollback();throw e;}}
async function manager(tx,uid,tenantId){
 if(!validId(tenantId))throw fail("invalid-argument","Empresa inválida.");
 const [t,m]=await Promise.all([tx.get("tenants/"+tenantId),tx.get("tenants/"+tenantId+"/members/"+uid)]);
 if(!t.exists||fields(t).status!=="active"||!m.exists||fields(m).status!=="active"||!["owner","admin"].includes(clean(fields(m).role,20)))throw fail("permission-denied","Não tem acesso a esta empresa.",403);
 return {tenant:fields(t),member:fields(m)};
}
export async function createMemberInvitation(claims,input,env){
 const tenantId=clean(input?.tenantId,128),email=clean(input?.email,254).toLowerCase(),role=clean(input?.role,20);
 if(!validId(tenantId)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["admin","staff"].includes(role))throw fail("invalid-argument","E-mail, empresa ou função inválidos.");
 await verifyUser(claims,env);
 const identity=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})}).then(r=>r.json());
 const currentEmail=identity.users?.[0]?.email;
 return withTx(env,async tx=>{
  const {member}=await manager(tx,claims.sub,tenantId);
  if(member.role!=="owner"&&role==="admin")throw fail("permission-denied","Apenas o proprietário pode convidar outro administrador.",403);
  const pending=await tx.query({from:[{collectionId:"invitations"}],where:{fieldFilter:{field:{fieldPath:"status"},op:"EQUAL",value:{stringValue:"pending"}}},limit:100},"tenants/"+tenantId);
  if(pending.some(d=>clean(d.fields?.email,254).toLowerCase()===email))throw fail("already-exists","Já existe um convite pendente para este e-mail.",409);
  const bytes=crypto.getRandomValues(new Uint8Array(32)),token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""),hash=await sha256(token),now=Date.now();
  tx.transform("tenants/"+tenantId+"/invitations/"+hash,{tenantId,email,role,status:"pending",invitedBy:claims.sub,expiresAt:new Date(now+7*86400000)},["createdAt"]);
  return {ok:true,invitationId:hash,invitationToken:token,expiresAtMs:now+7*86400000,delivery:"manual"};
 });
}
export async function acceptMemberInvitation(claims,input,env){
 const token=clean(input?.token,128),tenantId=clean(input?.tenantId,128);
 if(token.length<32||!validId(tenantId))throw fail("invalid-argument","Convite inválido.");
 const user=await verifyUser(claims,env);
 if(user.emailVerified!==true||!user.email)throw fail("failed-precondition","Entre com um e-mail confirmado para aceitar o convite.",412);
 const hash=await sha256(token);
 return withTx(env,async tx=>{
  const [invite,tenant,member]=await Promise.all([tx.get("tenants/"+tenantId+"/invitations/"+hash),tx.get("tenants/"+tenantId),tx.get("tenants/"+tenantId+"/members/"+claims.sub)]);
  const i=fields(invite);
  if(!invite.exists||!tenant.exists||fields(tenant).status!=="active")throw fail("not-found","Convite não encontrado ou empresa indisponível.",404);
  const expiry=Date.parse(i.expiresAt||"");
  if(i.status!=="pending"||i.email!==user.email.toLowerCase()||!Number.isFinite(expiry)||expiry<=Date.now())throw fail("failed-precondition","Convite expirado, utilizado ou destinado a outro e-mail.",412);
  if(member.exists&&fields(member).status==="active")throw fail("already-exists","Já tem acesso a esta empresa.",409);
  tx.transform("tenants/"+tenantId+"/members/"+claims.sub,{uid:claims.sub,tenantId,email:user.email.toLowerCase(),displayName:clean(user.displayName,80),role:i.role,status:"active",invitedBy:i.invitedBy},["createdAt"]);
  tx.transform("tenants/"+tenantId+"/invitations/"+hash,{status:"accepted",acceptedBy:claims.sub},["acceptedAt"]);
  tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"member.invitation_accepted",resourceType:"member",resourceId:claims.sub},["createdAt"]);
  return {ok:true,tenantId,role:i.role};
 });
}
export async function updateMemberAccess(claims,input,env){
 const tenantId=clean(input?.tenantId,128),memberUid=clean(input?.memberUid,128),role=clean(input?.role,20),status=clean(input?.status,20);
 if(!validId(tenantId)||!validId(memberUid)||!["admin","staff"].includes(role)||!["active","suspended"].includes(status))throw fail("invalid-argument","Função ou estado do membro inválidos.");
 await verifyUser(claims,env);
 return withTx(env,async tx=>{
  const {member:actor}=await manager(tx,claims.sub,tenantId),path="tenants/"+tenantId+"/members/"+memberUid,target=await tx.get(path),m=fields(target);
  if(!target.exists||m.role==="owner")throw fail("failed-precondition","O proprietário ou membro não pode ser alterado desta forma.",412);
  if(actor.role!=="owner"&&(role==="admin"||m.role==="admin"))throw fail("permission-denied","Apenas o proprietário pode alterar administradores.",403);
  tx.transform(path,{role,status,updatedBy:claims.sub},["updatedAt"]);
  tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"member.access_updated",resourceType:"member",resourceId:memberUid,role,status},["createdAt"]);
  return {ok:true,memberUid,role,status};
 });
}
export async function getTenantMembers(claims,input,env){
 const tenantId=clean(input?.tenantId,128);await verifyUser(claims,env);
 return withTx(env,async tx=>{
  await manager(tx,claims.sub,tenantId);
  const [members,invitations]=await Promise.all([
   tx.query({from:[{collectionId:"members"}],limit:100},"tenants/"+tenantId),
   tx.query({from:[{collectionId:"invitations"}],where:{fieldFilter:{field:{fieldPath:"status"},op:"EQUAL",value:{stringValue:"pending"}}},limit:100},"tenants/"+tenantId)
  ]);
  return {ok:true,members:members.map(d=>({uid:d.id,email:clean(d.fields.email,254),displayName:clean(d.fields.displayName,80),role:clean(d.fields.role,20),status:clean(d.fields.status,20)})),invitations:invitations.map(d=>({invitationId:d.id,email:clean(d.fields.email,254),role:clean(d.fields.role,20),expiresAtMs:Date.parse(d.fields.expiresAt||"")||null}))};
 });
}
export async function saveCatalogItem(claims,input,env){
 const tenantId=clean(input?.tenantId,128),kind=clean(input?.kind,24),itemId=clean(input?.itemId,128),name=clean(input?.name,100),status=clean(input?.status||"active",20);
 if(!validId(tenantId)||!["service","professional"].includes(kind)||!["active","inactive"].includes(status)||(itemId&&!validId(itemId)))throw fail("invalid-argument","Dados do cadastro inválidos.");
 if(status==="active"&&name.length<2)throw fail("invalid-argument","Informe um nome com pelo menos 2 caracteres.");
 if(kind==="service"&&status==="active"&&(!Number.isInteger(input?.durationMinutes)||input.durationMinutes<5||input.durationMinutes>480||input.durationMinutes%5!==0||!Number.isSafeInteger(input?.priceMinor)||input.priceMinor<0||!/^[A-Z]{3}$/.test(clean(input?.currency,3).toUpperCase())))throw fail("invalid-argument","Informe duração em múltiplos de 5 minutos, preço em unidades mínimas e moeda válida.");
 if(kind==="professional"&&status==="active"&&input?.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(String(input.color)))throw fail("invalid-argument","A cor deve estar no formato hexadecimal #RRGGBB.");
 await verifyUser(claims,env);
 return withTx(env,async tx=>{
  await manager(tx,claims.sub,tenantId);
  const collection=kind==="service"?"services":"professionals",id=itemId||auditId(),path="tenants/"+tenantId+"/"+collection+"/"+id,old=await tx.get(path);
  if(itemId&&!old.exists)throw fail("not-found","Cadastro não encontrado.",404);
  const prev=fields(old),data={tenantId,name:name||clean(prev.name,100),status,updatedBy:claims.sub};
  if(kind==="service"&&status==="active")Object.assign(data,{durationMinutes:input.durationMinutes,priceMinor:input.priceMinor,currency:clean(input.currency,3).toUpperCase()});
  if(kind==="professional"&&input.color!==undefined)data.color=String(input.color);
  tx.transform(path,data,old.exists?["updatedAt"]:["createdAt","updatedAt"]);
  tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:kind+"."+(old.exists?(status==="inactive"?"deactivated":"updated"):"created"),resourceType:kind,resourceId:id},["createdAt"]);
  return {ok:true,kind,itemId:id,status};
 });
}
export async function updateAppointmentStatus(claims,input,env){
 const tenantId=clean(input?.tenantId,128),appointmentId=clean(input?.appointmentId,128),status=clean(input?.status,20);
 if(!validId(tenantId)||!validId(appointmentId)||!["confirmed","completed","no_show"].includes(status))throw fail("invalid-argument","Empresa, agendamento ou estado inválido.");
 await verifyUser(claims,env);
 return withTx(env,async tx=>{
  await manager(tx,claims.sub,tenantId);
  const path="tenants/"+tenantId+"/appointments/"+appointmentId,appt=await tx.get(path);
  if(!appt.exists)throw fail("not-found","Agendamento não encontrado.",404);
  if(fields(appt).status==="cancelled")throw fail("failed-precondition","Um agendamento cancelado não pode ter o estado alterado.",412);
  tx.transform(path,{status,updatedBy:claims.sub},["updatedAt"]);
  tx.transform("tenants/"+tenantId+"/auditLog/"+auditId(),{tenantId,actorUid:claims.sub,action:"appointment.status_updated",resourceType:"appointment",resourceId:appointmentId,status},["createdAt"]);
  return {ok:true,appointmentId,status};
 });
}
