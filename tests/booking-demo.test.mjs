import test from "node:test";
import assert from "node:assert/strict";
import booking from "../public/booking-demo.js";

test("exposes the demo service catalog with durations and prices",()=>{
  assert.equal(booking.services.length,4);
  assert.equal(booking.getService("barba").duration,60);
  assert.equal(booking.getService("missing"),null);
});

test("does not offer appointments on closed Sundays",()=>{
  assert.deepEqual(booking.slots({date:"2026-11-01",professional:"Rafael Costa",duration:30}),[]);
});

test("respects the professional lunch break and service duration",()=>{
  const slots=booking.slots({date:"2026-11-02",professional:"Rafael Costa",duration:60});
  assert.ok(slots.includes("11:00"));
  assert.ok(!slots.includes("11:30"));
  assert.ok(!slots.includes("12:00"));
});

test("respects different professional schedules",()=>{
  const slots=booking.slots({date:"2026-11-02",professional:"Bruno Lima",duration:30});
  assert.ok(slots.includes("10:00"));
  assert.ok(!slots.includes("09:00"));
  assert.ok(!slots.includes("13:00"));
});

test("rejects invalid booking input",()=>{
  assert.deepEqual(booking.slots({date:"",professional:"Rafael Costa",duration:30}),[]);
  assert.deepEqual(booking.slots({date:"2026-11-02",professional:"Unknown",duration:30}),[]);
});

test("reads the company catalogue and schedule from shared browser storage and saves a reservation",()=>{
  const key="alansm-booking-demo-v1";
  let stored=null;
  globalThis.localStorage={getItem:k=>k===key?stored:null,setItem:(k,v)=>{if(k===key)stored=v;}};
  const workspace={
    version:1,data:{
      services:[["Massagem",30,"R$ 80,00","Ativo","data:image/webp;base64,thumb"],["Oculto",20,"R$ 20,00","Inativo"]],
      professionals:[["Joana","Terapeuta","Agenda","Ativo"],["Inativa","Terapeuta","Agenda","Inativo"]],
      professionalSchedules:{Joana:{1:[{start:"09:00",end:"12:00",breaks:[]}]}},
      companySchedule:{1:[{start:"09:00",end:"12:00",breaks:[]}]},
      appointments:[],blocks:[],exceptions:[],professionalExceptions:[],clients:[]
    }
  };
  stored=JSON.stringify(workspace);
  assert.equal(booking.services.length,1);
  assert.equal(booking.services[0].name,"Massagem");
  assert.equal(booking.services[0].image,"data:image/webp;base64,thumb");
  assert.deepEqual(booking.professionals,["Joana"]);
  assert.ok(booking.slots({date:"2026-11-02",professional:"Joana",duration:30}).includes("09:00"));
  booking.saveBooking({name:"Maria",email:"maria@example.com",phone:"123",serviceId:"service-0",professional:"Joana",date:"2026-11-02",time:"09:00"});
  const saved=JSON.parse(stored).data;
  assert.equal(saved.appointments.length,1);
  assert.equal(saved.appointments[0].status,"Pendente");
  assert.equal(saved.clients[0][0],"Maria");
  assert.ok(!booking.slots({date:"2026-11-02",professional:"Joana",duration:30}).includes("09:00"));
  delete globalThis.localStorage;
});
