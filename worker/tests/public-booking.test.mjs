import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { setupMockBackend } from "./mock-backend.mjs";
import { getPublicBookingPage, getPublicAvailability, createPublicAppointment } from "../src/public-booking.js";

function getFutureSlotMs(daysAhead = 2, hour = 10, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, minute, 0, 0);
  return d.getTime();
}

const standardSchedule = {
  "0": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "1": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "2": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "3": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "4": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "5": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
  "6": [{ start: "09:00", end: "14:00", breaks: [] }]
};

test("public-booking: unit validation before Firestore access", async () => {
  await assert.rejects(getPublicBookingPage({ slug: "api" }, {}), (e) => e.code === "invalid-argument");
  await assert.rejects(getPublicAvailability({ slug: "salon", serviceId: "bad/id", date: "2026-11-04" }, {}), (e) => e.code === "invalid-argument");
  await assert.rejects(createPublicAppointment({
    slug: "salon", serviceId: "service", clientName: "A", clientPhone: "123",
    idempotencyKey: "short", startAtMs: Date.now() + 3600000
  }, {}), (e) => e.code === "invalid-argument");
});

test("public-booking: getPublicBookingPage returns public catalog without authentication", async () => {
  const backend = setupMockBackend();
  backend.seedDocument("tenantSlugs/salao-publico", { tenantId: "t-pub" });
  backend.seedDocument("tenants/t-pub", {
    name: "Salão Público", slug: "salao-publico", status: "active",
    timezone: "UTC", currency: "EUR"
  });
  backend.seedDocument("tenants/t-pub/services/srv-1", {
    name: "Corte Cabelo", durationMinutes: 30, priceMinor: 1500, currency: "EUR", status: "active"
  });
  backend.seedDocument("tenants/t-pub/services/srv-secret", {
    name: "Serviço Inativo", status: "inactive"
  });
  backend.seedDocument("tenants/t-pub/professionals/pro-1", {
    name: "Marta Estilista", color: "#336699", status: "active"
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getPublicBookingPage", {
      method: "POST",
      headers: { Origin: "https://preview.alansm-booking-preview.pages.dev", "content-type": "application/json" },
      body: JSON.stringify({ slug: "salao-publico" })
    }), backend.env);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.tenant.name, "Salão Público");
    assert.equal(body.tenant.currency, "EUR");
    assert.equal(body.services.length, 1);
    assert.equal(body.services[0].name, "Corte Cabelo");
    assert.equal(body.professionals.length, 1);
    assert.equal(body.professionals[0].name, "Marta Estilista");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public-booking: getPublicAvailability calculates slots respecting breaks, blocks, closures, and absences", async () => {
  const backend = setupMockBackend();
  backend.seedDocument("tenantSlugs/salao-slots", { tenantId: "t-slots" });
  backend.seedDocument("tenants/t-slots", {
    name: "Salão Slots", slug: "salao-slots", status: "active", timezone: "UTC", currency: "EUR"
  });
  backend.seedDocument("tenants/t-slots/services/srv-30", {
    name: "Tratamento", durationMinutes: 30, status: "active"
  });
  backend.seedDocument("tenants/t-slots/professionals/pro-1", {
    name: "Tiago Pro", status: "active"
  });
  backend.seedDocument("tenants/t-slots/scheduleSettings/company", { days: standardSchedule });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Availability on a company closure date returns empty slots
    backend.seedDocument("tenants/t-slots/scheduleExceptions/2026-12-25", {
      date: "2026-12-25", kind: "companyClosure", reason: "Feriado"
    });
    const resClosed = await worker.fetch(new Request("https://api.example/api/getPublicAvailability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "salao-slots", serviceId: "srv-30", date: "2026-12-25" })
    }), backend.env);
    assert.equal(resClosed.status, 200);
    const bodyClosed = await resClosed.json();
    assert.equal(bodyClosed.slots.length, 0);

    // 2. Availability on a professional absence date returns empty slots
    backend.seedDocument("tenants/t-slots/professionalExceptions/pro-1_2026-12-26", {
      date: "2026-12-26", professionalId: "pro-1", kind: "professionalAbsence"
    });
    const resAbsent = await worker.fetch(new Request("https://api.example/api/getPublicAvailability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "salao-slots", serviceId: "srv-30", date: "2026-12-26" })
    }), backend.env);
    assert.equal(resAbsent.status, 200);
    const bodyAbsent = await resAbsent.json();
    assert.equal(bodyAbsent.slots.length, 0);

    // 3. Normal business day: slots are generated, but lunch break (12:00-13:00) has no slots
    // Pick a date in future that is a Monday (weekday 1)
    const monday = new Date("2026-12-07T00:00:00.000Z"); // 2026-12-07 is Monday
    const mondayStr = "2026-12-07";

    // Add a block from 10:00 to 11:00 on that Monday
    backend.seedDocument("tenants/t-slots/blocks/block-mon", {
      tenantId: "t-slots", date: mondayStr, start: "10:00", end: "11:00", professionalId: "pro-1"
    });

    const resAvail = await worker.fetch(new Request("https://api.example/api/getPublicAvailability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "salao-slots", serviceId: "srv-30", date: mondayStr })
    }), backend.env);
    assert.equal(resAvail.status, 200);
    const bodyAvail = await resAvail.json();
    assert.ok(bodyAvail.slots.length > 0);

    const slotTimes = bodyAvail.slots.map(s => s.time);
    // 09:00 and 09:30 should be available
    assert.ok(slotTimes.includes("09:00"));
    assert.ok(slotTimes.includes("09:30"));
    // 10:00 and 10:30 should be blocked
    assert.equal(slotTimes.includes("10:00"), false);
    assert.equal(slotTimes.includes("10:30"), false);
    // 12:00 and 12:30 (break) should not be available
    assert.equal(slotTimes.includes("12:00"), false);
    assert.equal(slotTimes.includes("12:30"), false);
    // 13:00 after lunch should be available
    assert.ok(slotTimes.includes("13:00"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public-booking: createPublicAppointment without auth, idempotency replay, and rate limiting (5/day)", async () => {
  const backend = setupMockBackend();
  const startMs = getFutureSlotMs(4, 11, 0); // 4 days ahead at 11:00 UTC

  backend.seedDocument("tenantSlugs/salao-agendar", { tenantId: "t-pub-agendar" });
  backend.seedDocument("tenants/t-pub-agendar", {
    name: "Salão Agendar", slug: "salao-agendar", status: "active", timezone: "UTC", currency: "EUR"
  });
  backend.seedDocument("tenants/t-pub-agendar/services/srv-1", {
    name: "Manicure", durationMinutes: 30, priceMinor: 1800, currency: "EUR", status: "active"
  });
  backend.seedDocument("tenants/t-pub-agendar/professionals/pro-1", {
    name: "Sofia Pro", status: "active"
  });
  backend.seedDocument("tenants/t-pub-agendar/scheduleSettings/company", { days: standardSchedule });
  backend.seedDocument("tenants/t-pub-agendar/scheduleSettings/professional_pro-1", { days: standardSchedule });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const payload = {
      slug: "salao-agendar",
      serviceId: "srv-1",
      professionalId: "pro-1",
      clientName: "Cliente Público",
      clientPhone: "+351933444555",
      clientEmail: "publico@exemplo.com",
      startAtMs: startMs,
      idempotencyKey: "public-idem-112233",
      notes: "Agendado via site"
    };

    // 1. Create public appointment without authorization header
    const resCreate = await worker.fetch(new Request("https://api.example/api/createPublicAppointment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }), backend.env);
    assert.equal(resCreate.status, 200);
    const bodyCreate = await resCreate.json();
    assert.equal(bodyCreate.ok, true);
    assert.equal(bodyCreate.replayed, false);
    const appointmentId = bodyCreate.appointmentId;
    assert.ok(appointmentId);

    // Verify stored appointment has origin public_online and confirmed status
    const apptDoc = backend.getDocument(`tenants/t-pub-agendar/appointments/${appointmentId}`);
    assert.ok(apptDoc);
    assert.equal(apptDoc.fields.status, "confirmed");
    assert.equal(apptDoc.fields.origin, "public_online");
    assert.equal(apptDoc.fields.clientPhone, "+351933444555");

    // 2. Replay with identical idempotencyKey returns cached appointment
    const resReplay = await worker.fetch(new Request("https://api.example/api/createPublicAppointment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }), backend.env);
    assert.equal(resReplay.status, 200);
    const bodyReplay = await resReplay.json();
    assert.equal(bodyReplay.ok, true);
    assert.equal(bodyReplay.appointmentId, appointmentId);
    assert.equal(bodyReplay.replayed, true);

    // 3. Same idempotencyKey with different data throws 409 already-exists
    const resConflict = await worker.fetch(new Request("https://api.example/api/createPublicAppointment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, clientPhone: "+351911222333" })
    }), backend.env);
    assert.equal(resConflict.status, 409);
    const bodyConflict = await resConflict.json();
    assert.equal(bodyConflict.error.code, "already-exists");

    // 4. Anti-abuse rate limit: seed 4 more appointments in last 24h for phone +351933444555
    const now = new Date();
    for (let i = 1; i <= 4; i++) {
      backend.seedDocument(`tenants/t-pub-agendar/appointments/fake-appt-${i}`, {
        tenantId: "t-pub-agendar",
        clientPhone: "+351933444555",
        createdAt: new Date(now.getTime() - i * 3600000).toISOString()
      });
    }

    // Now phone has 1 real + 4 seeded = 5 appointments in last 24h. The 6th request must be rejected with 429
    const slot6Ms = getFutureSlotMs(5, 14, 0);
    const resRateLimited = await worker.fetch(new Request("https://api.example/api/createPublicAppointment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        startAtMs: slot6Ms,
        idempotencyKey: "public-idem-over-limit-key"
      })
    }), backend.env);
    assert.equal(resRateLimited.status, 429);
    const bodyRate = await resRateLimited.json();
    assert.equal(bodyRate.error.code, "resource-exhausted");
    assert.match(bodyRate.error.message, /Limite diário de agendamentos/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
