import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/firebase-dashboard-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, TypeError, Date, Intl, Number, Math });

test("Firebase dashboard maps the safe catalog to legacy display rows without inventing prices", async () => {
  const adapter = window.BookingFirebaseDashboard.createFirebaseDashboardAdapter({
    workspace: { mode: "firebase", getCatalog: async () => ({
      professionals: [{ id: "pro-1", name: "Ana", status: "active" }],
      services: [
        { id: "svc-1", name: "Corte", durationMinutes: 30, priceMinor: 4500, currency: "BRL", status: "active" },
        { id: "svc-2", name: "Consulta", durationMinutes: 45, priceMinor: null, currency: null, status: "active" }
      ]
    }) }
  });
  const result = await adapter.loadCatalog();
  assert.deepEqual(JSON.parse(JSON.stringify(result.professionals[0])), ["Ana", "", "", "Ativo", "pro-1"]);
  assert.equal(result.services[0][2], "R$ 45,00");
  assert.equal(result.services[1][2], "—");
  assert.equal(result.services[0][5], "svc-1");
});

test("Firebase dashboard maps schedule records without losing tenant timezone or IDs", async () => {
  const adapter = window.BookingFirebaseDashboard.createFirebaseDashboardAdapter({
    workspace: { mode: "firebase", getCatalog: async () => ({ professionals: [{ id: "pro-1", name: "Ana", status: "active" }] }), getSchedule: async () => ({
      timezone: "Europe/Warsaw", companySchedule: { "1": [{ start: "09:00", end: "17:00", breaks: [] }] },
      professionalSchedules: { "pro-1": { "1": [{ start: "10:00", end: "16:00" }] } },
      blocks: [{ id: "b1", date: "2026-11-02", start: "12:00", end: "13:00", reason: "Pausa" }],
      exceptions: [{ id: "e1", date: "2026-11-03", reason: "Feriado" }],
      professionalExceptions: [{ id: "pe1", date: "2026-11-04", professionalId: "pro-1", reason: "Férias" }]
    }) }
  });
  const result = await adapter.loadSchedule({ startDate: "2026-11-01", endDate: "2026-11-07" });
  assert.equal(result.timezone, "Europe/Warsaw");
  assert.equal(result.blocks[0].id, "b1");
  assert.equal(result.blocks[0].label, "Pausa");
  assert.equal(result.exceptions[0].label, "Feriado");
  assert.equal(result.professionalExceptions[0].professionalId, "Ana");
  assert.deepEqual(JSON.parse(JSON.stringify(result.professionalSchedules)), { Ana: { "1": [{ start: "10:00", end: "16:00" }] } });
});

test("Firebase dashboard converts appointment timestamps in the tenant timezone and keeps client data private", async () => {
  const adapter = window.BookingFirebaseDashboard.createFirebaseDashboardAdapter({
    timeZone: "Europe/Warsaw",
    workspace: { mode: "firebase", getCatalog: async () => ({ professionals: [{ id: "pro-1", name: "Ana", status: "active" }], services: [{ id: "svc-1", name: "Corte", status: "active" }] }), getAgenda: async () => ({
      appointments: [{
        id: "a1", clientId: "c1", professionalId: "pro-1", serviceId: "svc-1",
        startAtMs: Date.parse("2026-11-02T09:00:00Z"), endAtMs: Date.parse("2026-11-02T09:30:00Z"),
        status: "booked", priceMinor: 4500, currency: "PLN"
      }]
    }) }
  });
  await adapter.loadCatalog();
  const result = await adapter.loadAgenda({ startAtMs: 1, endAtMs: 2 });
  assert.equal(result.appointments[0].date, "2026-11-02");
  assert.equal(result.appointments[0].time, "10:00");
  assert.equal(result.appointments[0].duration, 30);
  assert.equal(result.appointments[0].status, "Confirmado");
  assert.equal(result.appointments[0].name, "Cliente");
  assert.equal(result.appointments[0].clientId, "c1");
  assert.equal(result.appointments[0].professional, "Ana");
  assert.equal(result.appointments[0].service, "Corte");
});
