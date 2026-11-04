import { createFirestoreRest } from "./firestore-rest.js";

const ROOT="projects/gen-lang-client-0623364466/databases/(default)/documents";
const clean=(v,n)=>typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,n):"";
const validId=(v)=>v.length>0&&v.length<=128&&!v.includes("/");
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const fields=(snap)=>snap?.fields||{};

export async function cancelAppointment(claims,input,env){
  const tenantId=clean(input?.tenantId,128), appointmentId=clean(input?.appointmentId,128);
  const reason=clean(input?.reason,240);
  if(!validId(tenantId)||!validId(appointmentId)) throw fail("invalid-argument","Empresa e reserva são obrigatórias.");
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:claims.__idToken})
  });
  const data=await response.json().catch(()=>({}));
  const user=data.users?.[0];
  if(!response.ok||!user||user.localId!==claims.sub) throw fail("unauthenticated","Entre novamente para continuar.",401);
  if(user.disabled===true) throw fail("permission-denied","Esta conta está desativada.",403);

  const tx=await createFirestoreRest({getAccessToken:env.getGoogleAccessToken}).begin();
  try{
    const [member,tenant,appointment]=await Promise.all([
      tx.get(`tenants/${tenantId}/members/${claims.sub}`),
      tx.get(`tenants/${tenantId}`),
      tx.get(`tenants/${tenantId}/appointments/${appointmentId}`)
    ]);
    const m=fields(member),t=fields(tenant),a=fields(appointment);
    if(!member.exists||m.status!=="active"||!tenant.exists||t.status!=="active") throw fail("permission-denied","Não tem acesso a esta empresa.",403);
    if(!["owner","admin"].includes(clean(m.role,20))) throw fail("permission-denied","Apenas proprietários e administradores podem cancelar reservas.",403);
    if(!appointment.exists) throw fail("not-found","Reserva não encontrada.",404);
    if(a.tenantId!==tenantId) throw fail("permission-denied","Reserva inválida para esta empresa.",403);
    if(a.status==="cancelled"||a.status==="Cancelado"){
      await tx.rollback();
      return {ok:true,appointmentId,status:"cancelled",alreadyCancelled:true};
    }
    if(!["booked","confirmed","pending"].includes(a.status)) throw fail("failed-precondition","Esta reserva não pode ser cancelada neste estado.",412);
    const auditId=crypto.randomUUID().replace(/-/g,"");
    tx.transform(`tenants/${tenantId}/appointments/${appointmentId}`,{
      status:"cancelled",cancelledBy:claims.sub,cancellationReason:reason
    },["cancelledAt","updatedAt"]);
    tx.transform(`tenants/${tenantId}/auditLog/${auditId}`,{
      tenantId,actorUid:claims.sub,action:"appointment.cancelled",
      resourceType:"appointment",resourceId:appointmentId,reason
    },["createdAt"]);
    await tx.commit();
    return {ok:true,appointmentId,status:"cancelled",alreadyCancelled:false};
  }catch(error){await tx.rollback();throw error;}
}
