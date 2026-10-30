import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/firebase-workspace-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, TypeError, Error, Number });

test("Firebase workspace calls tenant-scoped callable functions", async () => {
  const calls = [];
  const user = { emailVerified: true };
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => user },
    httpsCallable(_functions, name) {
      return async (payload) => {
        calls.push({ name, payload });
        if (name === "getSession") {
          return { data: { ok: true, name, tenants: [{ tenantId: "tenant-1", name: "Barbearia" }] } };
        }
        return { data: { ok: true, name } };
      };
    }
  });
  assert.equal(adapter.mode, "firebase");
  assert.equal((await adapter.createTenant({ name: "Barbearia", slug: "barbearia" })).name, "createTenant");
  assert.equal((await adapter.getSession()).name, "getSession");
  assert.equal((await adapter.getCatalog({ tenantId: "tenant-1" })).name, "getTenantCatalog");
  assert.equal((await adapter.getAgenda({
    tenantId: "tenant-1", startAtMs: 1000, endAtMs: 2000, professionalId: "pro-1"
  })).name, "getAgendaAppointments");
  assert.deepEqual(calls.map((call) => call.name), [
    "createTenant", "getSession", "getSession", "getTenantCatalog", "getSession", "getAgendaAppointments"
  ]);
  assert.equal(calls[3].payload.tenantId, "tenant-1");
  assert.equal(calls[5].payload.professionalId, "pro-1");
});

test("Firebase workspace blocks tenant creation for unverified users", async () => {
  let invoked = false;
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: false }) },
    httpsCallable() {
      invoked = true;
      return async () => ({ data: {} });
    }
  });
  await assert.rejects(adapter.createTenant({ name: "Barbearia", slug: "barbearia" }), /Confirme o seu e-mail/);
  assert.equal(invoked, false);
});

test("Firebase workspace rejects invalid agenda interval and missing tenant", async () => {
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async () => ({ data: name === "getSession"
        ? { tenants: [{ tenantId: "tenant-1", name: "Empresa" }] }
        : {} });
    }
  });
  await assert.doesNotReject(adapter.getCatalog({}));
  await assert.rejects(adapter.getAgenda({ tenantId: "tenant-1", startAtMs: 5, endAtMs: 5 }), /intervalo válido/);
});

test("multiple tenants require explicit selection and reject memberships outside session", async () => {
  const calls = [];
  const tenants = [
    { tenantId: "tenant-a", name: "Empresa A" },
    { tenantId: "tenant-b", name: "Empresa B" }
  ];
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async (payload) => {
        calls.push({ name, payload });
        if (name === "getSession") return { data: { tenants } };
        return { data: { ok: true } };
      };
    }
  });
  await adapter.getSession();
  assert.equal(adapter.getSelectedTenantId(), null);
  await assert.rejects(adapter.getCatalog(), /Selecione uma empresa/);
  await assert.rejects(adapter.getCatalog({ tenantId: "tenant-outsider" }), /Não tem acesso/);
  await adapter.selectTenant("tenant-b");
  assert.equal(adapter.getSelectedTenantId(), "tenant-b");
  await adapter.getCatalog();
  assert.equal(calls.at(-1).payload.tenantId, "tenant-b");
  await assert.rejects(adapter.getAgenda({
    tenantId: "tenant-a", startAtMs: 1000, endAtMs: 2000
  }), /A empresa selecionada mudou/);
});
