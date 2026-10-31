const test=require("node:test");
const assert=require("node:assert/strict");
const booking=require("../public/booking-demo.js");

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
