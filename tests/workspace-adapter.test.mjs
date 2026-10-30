import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/workspace-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, TypeError, Error });

test("demo workspace exposes an isolated sample tenant and delegates reads", () => {
  const catalog = { professionals: [["Demo"]], services: [["Service"]] };
  const agenda = [{ date: "2026-10-30" }];
  const schedule = { companySchedule: { 1: [] } };
  const dataAdapter = {
    mode: "demo",
    getCatalog: () => catalog,
    getAppointments: () => agenda,
    getScheduleData: () => schedule
  };
  const authAdapter = { mode: "demo" };
  const workspace = window.BookingWorkspace.createDemoWorkspaceAdapter({ authAdapter, dataAdapter });
  assert.equal(workspace.mode, "demo");
  assert.equal(workspace.getSession().user, null);
  assert.equal(workspace.getSession().tenants[0].id, "demo-tenant");
  assert.equal(workspace.getCatalog(), catalog);
  assert.equal(workspace.getAgenda()[0].date, "2026-10-30");
  assert.equal(workspace.getSchedule(), schedule);
  assert.throws(() => workspace.createTenant(), /ainda não estão ligados/);
});

test("workspace adapter refuses non-demo dependencies", () => {
  assert.throws(() => window.BookingWorkspace.createDemoWorkspaceAdapter({
    authAdapter: { mode: "firebase" },
    dataAdapter: { mode: "demo" }
  }), /adaptadores de demonstração/);
});
