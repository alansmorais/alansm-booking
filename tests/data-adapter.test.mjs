import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/data-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, Array, TypeError });
const createDemoAdapter = window.BookingData.createDemoAdapter;

test("schedule adapter returns detached copies of all availability data", () => {
  const state = {
    professionals: [["Rafael", "Barbeiro", "1", "Ativo"]],
    services: [["Corte", 30, "R$ 40", "Ativo"]],
    appointments: [{ date: "2026-10-30", time: "09:00", professional: "Rafael" }],
    companySchedule: { 1: [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }] },
    professionalSchedules: { Rafael: { 1: [{ start: "10:00", end: "17:00", breaks: [] }] } },
    blocks: [{ date: "2026-10-30", start: "14:00", end: "15:00" }],
    exceptions: [{ date: "2026-12-25", label: "Feriado" }],
    professionalExceptions: [{ professional: "Rafael", date: "2026-11-02", endDate: "2026-11-03" }]
  };
  const adapter = createDemoAdapter(state);
  const snapshot = adapter.getScheduleData();
  assert.equal(adapter.mode, "demo");
  assert.equal(snapshot.companySchedule[1][0].breaks[0].start, "12:00");
  assert.equal(snapshot.professionalSchedules.Rafael[1][0].start, "10:00");
  assert.equal(snapshot.blocks.length, 1);
  assert.equal(snapshot.exceptions.length, 1);
  assert.equal(snapshot.professionalExceptions.length, 1);
  snapshot.companySchedule[1][0].breaks[0].start = "08:00";
  snapshot.professionalSchedules.Rafael[1][0].start = "08:00";
  snapshot.blocks[0].start = "08:00";
  snapshot.exceptions[0].label = "Alterado";
  snapshot.professionalExceptions[0].date = "2020-01-01";
  assert.equal(state.companySchedule[1][0].breaks[0].start, "12:00");
  assert.equal(state.professionalSchedules.Rafael[1][0].start, "10:00");
  assert.equal(state.blocks[0].start, "14:00");
  assert.equal(state.exceptions[0].label, "Feriado");
  assert.equal(state.professionalExceptions[0].date, "2026-11-02");
});

test("adapter rejects incomplete demo state", () => {
  assert.throws(() => createDemoAdapter({ professionals: [], services: [] }), /Estado de demonstração inválido/);
});
