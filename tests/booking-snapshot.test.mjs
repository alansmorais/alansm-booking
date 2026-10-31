import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../public/booking-snapshot.js";

function sample(){
 return {
  companyName:"Barbearia Teste",
  professionals:[["Ana","Barbeira","3 agendamentos","Ativo"],["Bruno","Barbeiro","2 agendamentos","Inativo"]],
  services:[["Corte",30,"R$ 40,00","Ativo","thumb"],["Barba",20,"R$ 25,00","Inativo"]],
  professionalSchedules:{Ana:{1:[{start:"09:00",end:"17:00",breaks:[]}]}},
  companySchedule:{1:[{start:"09:00",end:"18:00",breaks:[]}]},
  appointments:[{name:"Cliente",service:"Corte",professional:"Ana",date:"2026-11-02",time:"09:00",duration:30,status:"Pendente"}],
  clients:[["Cliente","123","1 visita","cliente@example.com"]],blocks:[],exceptions:[],professionalExceptions:[]
 };
}
test("creates stable permanent IDs without changing existing dashboard fields",()=>{
 const state=sample(); snapshot.ensureStableIds(state);
 const serviceId=state.services[0][5],professionalId=state.professionals[0][4];
 assert.ok(serviceId.startsWith("service-corte"));
 assert.ok(professionalId.startsWith("professional-ana"));
 assert.equal(state.services[0][4],"thumb");
 snapshot.ensureStableIds(state);
 assert.equal(state.services[0][5],serviceId);
 assert.equal(state.professionals[0][4],professionalId);
});
test("maps legacy dashboard rows into tenant-scoped backend records",()=>{
 const state=sample(),data=snapshot.buildSnapshot(state,"company-demo");
 assert.equal(data.company.id,"company-demo");
 assert.equal(data.services[0].name,"Corte");
 assert.equal(data.services[0].active,true);
 assert.equal(data.services[1].active,false);
 assert.equal(data.professionals[1].active,false);
 assert.equal(data.schedules[0].professionalId,data.professionals[0].id);
 assert.equal(data.appointments[0].serviceId,data.services[0].id);
 assert.equal(data.appointments[0].professionalId,data.professionals[0].id);
 assert.equal(data.clients[0].email,"cliente@example.com");
 assert.equal(data.professionalExceptions.length,0);
});
test("requires a company identifier before creating a snapshot",()=>{
 assert.throws(()=>snapshot.buildSnapshot(sample(),""),/companyId/);
});
