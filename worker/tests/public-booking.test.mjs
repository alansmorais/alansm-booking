import test from "node:test";
import assert from "node:assert/strict";
import { getPublicBookingPage, getPublicAvailability, createPublicAppointment } from "../src/public-booking.js";

test("public booking endpoints validate parameters before Firestore access",async()=>{
 await assert.rejects(getPublicBookingPage({slug:"api"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(getPublicAvailability({slug:"salon",serviceId:"bad/id",date:"2026-11-04"},{}),e=>e.code==="invalid-argument");
 await assert.rejects(createPublicAppointment({slug:"salon",serviceId:"service",clientName:"A",clientPhone:"123",idempotencyKey:"short",startAtMs:Date.now()+3600000},{}),e=>e.code==="invalid-argument");
});
