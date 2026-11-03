import test from "node:test";
import assert from "node:assert/strict";
import { createMemberInvitation, acceptMemberInvitation, updateMemberAccess, getTenantMembers, saveCatalogItem, updateAppointmentStatus } from "../src/team-catalog.js";

test("team operations reject malformed input before network calls",async()=>{
 await assert.rejects(createMemberInvitation({sub:"u"},{tenantId:"bad/id",email:"x",role:"staff"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(acceptMemberInvitation({sub:"u"},{tenantId:"t",token:"short"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(updateMemberAccess({sub:"u"},{tenantId:"t",memberUid:"u",role:"owner",status:"active"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(saveCatalogItem({sub:"u"},{tenantId:"t",kind:"service",name:"A",status:"active"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(updateAppointmentStatus({sub:"u"},{tenantId:"t",appointmentId:"a",status:"cancelled"},{}),e=>e.code==="invalid-argument");
});

test("member listing validates authentication configuration after tenant input",async()=>{
 await assert.rejects(getTenantMembers({sub:"u"},{tenantId:"bad/id"},{}),e=>e.code==="invalid-argument");
});
