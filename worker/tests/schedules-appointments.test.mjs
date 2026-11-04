import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { setupMockBackend } from "./mock-backend.mjs";

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
  "6": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }]
};

test("schedules: saveScheduleSettings, saveScheduleException, saveScheduleBlock, and getScheduleSettings", async () => {
  const backend = setupMockBackend();
  const ownerToken = backend.createIdToken({ sub: "owner-sch", email: "owner@sch.com" });
  backend.registerUser({ uid: "owner-sch", email: "owner@sch.com", emailVerified: true });

  backend.seedDocument("tenants/t-sch", { name: "Studio Sch", status: "active", timezone: "UTC", currency: "EUR" });
  backend.seedDocument("tenants/t-sch/members/owner-sch", { uid: "owner-sch", tenantId: "t-sch", role: "owner", status: "active" });
  backend.seedDocument("tenants/t-sch/professionals/pro-1", { name: "Ana Pro", status: "active" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Save company schedule settings
    const resCompany = await worker.fetch(new Request("https://api.example/api/saveScheduleSettings", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-sch", scope: "company", days: standardSchedule })
    }), backend.env);
    assert.equal(resCompany.status, 200);

    // 2. Save professional schedule settings
    const resPro = await worker.fetch(new Request("https://api.example/api/saveScheduleSettings", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-sch", scope: "professional", professionalId: "pro-1", days: standardSchedule })
    }), backend.env);
    assert.equal(resPro.status, 200);

    // 3. Save company closure exception
    const resClosure = await worker.fetch(new Request("https://api.example/api/saveScheduleException", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-sch", kind: "companyClosure", startDate: "2026-12-25", reason: "Feriado de Natal" })
    }), backend.env);
    assert.equal(resClosure.status, 200);

    // 4. Save schedule block
    const resBlock = await worker.fetch(new Request("https://api.example/api/saveScheduleBlock", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-sch", date: "2026-12-24", start: "14:00", end: "16:00", professionalId: "pro-1", reason: "Reunião de Equipa" })
    }), backend.env);
    assert.equal(resBlock.status, 200);
    const bodyBlock = await resBlock.json();
    assert.ok(bodyBlock.blockId);

    // 5. Get schedule settings and verify all configured items
    const resGet = await worker.fetch(new Request("https://api.example/api/getScheduleSettings", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-sch" })
    }), backend.env);
    assert.equal(resGet.status, 200);
    const bodyGet = await resGet.json();
    assert.equal(bodyGet.ok, true);
    assert.ok(bodyGet.companySchedule);
    assert.ok(bodyGet.professionalSchedules["pro-1"]);
    assert.equal(bodyGet.exceptions.length, 1);
    assert.equal(bodyGet.exceptions[0].reason, "Feriado de Natal");
    assert.equal(bodyGet.blocks.length, 1);
    assert.equal(bodyGet.blocks[0].reason, "Reunião de Equipa");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("appointments: creation, idempotency replay, idempotency conflict, double-booking, and blocks", async () => {
  const backend = setupMockBackend();
  const ownerToken = backend.createIdToken({ sub: "owner-appt", email: "owner@appt.com" });
  backend.registerUser({ uid: "owner-appt", email: "owner@appt.com", emailVerified: true });

  const startMs = getFutureSlotMs(3, 10, 0); // 3 days ahead at 10:00 UTC
  const slotDate = new Date(startMs).toISOString().slice(0, 10);

  backend.seedDocument("tenants/t-appt", { name: "Studio Appt", status: "active", timezone: "UTC", currency: "EUR" });
  backend.seedDocument("tenants/t-appt/members/owner-appt", { uid: "owner-appt", tenantId: "t-appt", role: "owner", status: "active" });
  backend.seedDocument("tenants/t-appt/services/srv-1", { name: "Corte", durationMinutes: 30, priceMinor: 2000, currency: "EUR", status: "active" });
  backend.seedDocument("tenants/t-appt/professionals/pro-1", { name: "Rita Pro", status: "active" });
  backend.seedDocument("tenants/t-appt/clients/cli-1", { name: "João Silva", status: "active" });

  // Schedules covering every day 09:00-18:00
  backend.seedDocument("tenants/t-appt/scheduleSettings/company", { days: standardSchedule });
  backend.seedDocument("tenants/t-appt/scheduleSettings/professional_pro-1", { days: standardSchedule });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const payload = {
      tenantId: "t-appt",
      professionalId: "pro-1",
      serviceId: "srv-1",
      clientId: "cli-1",
      startAtMs: startMs,
      idempotencyKey: "unique-key-12345",
      notes: "Primeira visita"
    };

    // 1. Create appointment successfully
    const resCreate = await worker.fetch(new Request("https://api.example/api/createAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify(payload)
    }), backend.env);
    assert.equal(resCreate.status, 200);
    const bodyCreate = await resCreate.json();
    assert.equal(bodyCreate.ok, true);
    assert.equal(bodyCreate.replayed, false);
    const appointmentId = bodyCreate.appointmentId;
    assert.ok(appointmentId);

    // 2. Replay with identical idempotencyKey returns cached appointment (replayed: true)
    const resReplay = await worker.fetch(new Request("https://api.example/api/createAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify(payload)
    }), backend.env);
    assert.equal(resReplay.status, 200);
    const bodyReplay = await resReplay.json();
    assert.equal(bodyReplay.ok, true);
    assert.equal(bodyReplay.appointmentId, appointmentId);
    assert.equal(bodyReplay.replayed, true);

    // 3. Same idempotencyKey with different payload throws 409 already-exists
    const resConflictKey = await worker.fetch(new Request("https://api.example/api/createAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ ...payload, notes: "Notas diferentes que alteram o hash" })
    }), backend.env);
    assert.equal(resConflictKey.status, 409);
    const bodyConflictKey = await resConflictKey.json();
    assert.equal(bodyConflictKey.error.code, "already-exists");
    assert.match(bodyConflictKey.error.message, /outros dados/i);

    // 4. Double booking with different idempotency key on same time slot throws 409
    const resDoubleBooking = await worker.fetch(new Request("https://api.example/api/createAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        idempotencyKey: "different-key-67890",
        notes: "Outro cliente tentando mesmo horário"
      })
    }), backend.env);
    assert.equal(resDoubleBooking.status, 409);
    const bodyDouble = await resDoubleBooking.json();
    assert.equal(bodyDouble.error.code, "already-exists");
    assert.match(bodyDouble.error.message, /acabou de ser reservado/i);

    // 5. Booking on a time overlapping a schedule block is rejected with 409
    backend.seedDocument("tenants/t-appt/blocks/block-test", {
      tenantId: "t-appt",
      date: slotDate,
      start: "14:00",
      end: "15:00",
      professionalId: "pro-1",
      reason: "Indisponível"
    });
    const blockStartMs = getFutureSlotMs(3, 14, 15);
    const resBlockConflict = await worker.fetch(new Request("https://api.example/api/createAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        startAtMs: blockStartMs,
        idempotencyKey: "key-block-conflict-11"
      })
    }), backend.env);
    assert.equal(resBlockConflict.status, 409);
    const bodyBlockConf = await resBlockConflict.json();
    assert.equal(bodyBlockConf.error.code, "already-exists");
    assert.match(bodyBlockConf.error.message, /bloqueado/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("appointments: staff cannot cancel (403), owner cancels (200), and status lifecycle", async () => {
  const backend = setupMockBackend();
  const ownerToken = backend.createIdToken({ sub: "owner-cancel", email: "owner@cancel.com" });
  backend.registerUser({ uid: "owner-cancel", email: "owner@cancel.com", emailVerified: true });

  const staffToken = backend.createIdToken({ sub: "staff-cancel", email: "staff@cancel.com" });
  backend.registerUser({ uid: "staff-cancel", email: "staff@cancel.com", emailVerified: true });

  backend.seedDocument("tenants/t-canc", { name: "Studio Canc", status: "active", timezone: "UTC", currency: "EUR" });
  backend.seedDocument("tenants/t-canc/members/owner-cancel", { uid: "owner-cancel", tenantId: "t-canc", role: "owner", status: "active" });
  backend.seedDocument("tenants/t-canc/members/staff-cancel", { uid: "staff-cancel", tenantId: "t-canc", role: "staff", status: "active" });

  const nowMs = Date.now();
  const apptStart = new Date(nowMs + 86400000).toISOString();
  const apptEnd = new Date(nowMs + 86400000 + 1800000).toISOString();

  backend.seedDocument("tenants/t-canc/appointments/appt-active", {
    tenantId: "t-canc",
    professionalId: "pro-1",
    serviceId: "srv-1",
    clientId: "cli-1",
    clientName: "Cliente Ativo",
    startAt: apptStart,
    endAt: apptEnd,
    status: "booked"
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Staff attempts to cancel appointment (403 forbidden)
    const resStaffCancel = await worker.fetch(new Request("https://api.example/api/cancelAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + staffToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-canc", appointmentId: "appt-active", reason: "Cancelamento por staff" })
    }), backend.env);
    assert.equal(resStaffCancel.status, 403);
    const bodyStaffCancel = await resStaffCancel.json();
    assert.equal(bodyStaffCancel.error.code, "permission-denied");
    assert.match(bodyStaffCancel.error.message, /proprietários e administradores/i);

    // 2. Staff updates appointment status to confirmed (200 allowed for staff)
    const resStatusUpdate = await worker.fetch(new Request("https://api.example/api/updateAppointmentStatus", {
      method: "POST",
      headers: { Authorization: "Bearer " + staffToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-canc", appointmentId: "appt-active", status: "confirmed" })
    }), backend.env);
    assert.equal(resStatusUpdate.status, 200);

    // 3. Owner cancels the appointment (200)
    const resOwnerCancel = await worker.fetch(new Request("https://api.example/api/cancelAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-canc", appointmentId: "appt-active", reason: "Imprevisto do cliente" })
    }), backend.env);
    assert.equal(resOwnerCancel.status, 200);
    const bodyOwnerCancel = await resOwnerCancel.json();
    assert.equal(bodyOwnerCancel.ok, true);
    assert.equal(bodyOwnerCancel.status, "cancelled");
    assert.equal(bodyOwnerCancel.alreadyCancelled, false);

    // 4. Cancelling already cancelled appointment returns alreadyCancelled: true
    const resAlready = await worker.fetch(new Request("https://api.example/api/cancelAppointment", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-canc", appointmentId: "appt-active", reason: "Segunda tentativa" })
    }), backend.env);
    assert.equal(resAlready.status, 200);
    const bodyAlready = await resAlready.json();
    assert.equal(bodyAlready.alreadyCancelled, true);

    // 5. Updating status of a cancelled appointment is rejected (412 failed-precondition)
    const resUpdateCancelled = await worker.fetch(new Request("https://api.example/api/updateAppointmentStatus", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-canc", appointmentId: "appt-active", status: "confirmed" })
    }), backend.env);
    assert.equal(resUpdateCancelled.status, 412);
    const bodyUpdateCancelled = await resUpdateCancelled.json();
    assert.equal(bodyUpdateCancelled.error.code, "failed-precondition");

    // 6. Query agenda appointments
    const resAgenda = await worker.fetch(new Request("https://api.example/api/getAgendaAppointments", {
      method: "POST",
      headers: { Authorization: "Bearer " + staffToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-canc",
        startAtMs: nowMs,
        endAtMs: nowMs + 2 * 86400000
      })
    }), backend.env);
    assert.equal(resAgenda.status, 200);
    const bodyAgenda = await resAgenda.json();
    assert.equal(bodyAgenda.ok, true);
    assert.equal(bodyAgenda.appointments.length, 1);
    assert.equal(bodyAgenda.appointments[0].status, "cancelled");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
