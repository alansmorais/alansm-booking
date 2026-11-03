import test from "node:test";
import assert from "node:assert/strict";
import { getTenantCatalog, getAgendaAppointments, getTenantClients, saveTenantClient } from "../src/tenant-data.js";

test("tenant catalog rejects invalid tenant before remote calls",async()=>{
 await assert.rejects(getTenantCatalog({sub:"u"},{tenantId:"bad/id"},{}),e=>e.code==="invalid-argument");
});
test("agenda rejects invalid or excessive date windows before remote calls",async()=>{
 await assert.rejects(getAgendaAppointments({sub:"u"},{tenantId:"t",startAtMs:100,endAtMs:99},{}),e=>e.code==="invalid-argument");
 await assert.rejects(getAgendaAppointments({sub:"u"},{tenantId:"t",startAtMs:0,endAtMs:31*86400000+1},{}),e=>e.code==="invalid-argument");
 await assert.rejects(getAgendaAppointments({sub:"u"},{tenantId:"t",startAtMs:0,endAtMs:1000,professionalId:"bad/id"},{}),e=>e.code==="invalid-argument");
});
test("client save validates contact fields before remote calls",async()=>{
 await assert.rejects(saveTenantClient({sub:"u"},{tenantId:"t",name:"A",phone:"x"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(saveTenantClient({sub:"u"},{tenantId:"t",name:"Valid Name",email:"invalid"},{}),e=>e.code==="invalid-argument");
});
test("client list rejects invalid tenant before remote calls",async()=>{
 await assert.rejects(getTenantClients({sub:"u"},{tenantId:""},{}),e=>e.code==="invalid-argument");
});
