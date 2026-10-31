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


test("Firebase workspace scopes member listing, invitations and access changes to selected tenant", async () => {
  const calls = [];
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async (payload) => {
        calls.push({ name, payload });
        if (name === "getSession") return { data: { tenants: [{ tenantId: "tenant-team", name: "Empresa" }] } };
        return { data: { ok: true, name } };
      };
    }
  });
  const members = await adapter.getMembers();
  assert.equal(members.name, "getTenantMembers");
  const invite = await adapter.inviteMember({ email: "  Pessoa@Exemplo.com ", role: "staff" });
  assert.equal(invite.name, "createMemberInvitation");
  const update = await adapter.updateMember({ memberUid: "member-1", role: "staff", status: "suspended" });
  assert.equal(update.name, "updateMemberAccess");
  const writes = calls.filter((call) => call.name !== "getSession");
  assert.deepEqual(writes.map((call) => call.name), [
    "getTenantMembers", "createMemberInvitation", "updateMemberAccess"
  ]);
  assert.ok(writes.every((call) => call.payload.tenantId === "tenant-team"));
  assert.equal(writes[1].payload.email, "pessoa@exemplo.com");
  assert.equal(writes[2].payload.status, "suspended");
});

test("Firebase workspace rejects invalid member mutations before calling Functions", async () => {
  let mutations = 0;
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async () => {
        if (name === "getSession") return { data: { tenants: [{ tenantId: "tenant-team", name: "Empresa" }] } };
        mutations += 1;
        return { data: {} };
      };
    }
  });
  await assert.rejects(adapter.inviteMember({ email: "email-invalido", role: "staff" }), /e-mail válido/);
  await assert.rejects(adapter.inviteMember({ email: "a@b.com", role: "owner" }), /Perfil de acesso inválido/);
  await assert.rejects(adapter.updateMember({ memberUid: "", role: "staff", status: "active" }), /Membro inválido/);
  await assert.rejects(adapter.updateMember({ memberUid: "member-1", role: "owner", status: "active" }), /Perfil ou estado/);
  assert.equal(mutations, 0);
});


test("Firebase workspace accepts an invitation without requiring prior tenant membership", async () => {
  const calls = [];
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async (payload) => {
        calls.push({ name, payload });
        return { data: { ok: true, role: "staff" } };
      };
    }
  });
  const result = await adapter.acceptInvitation({
    tenantId: "tenant-invited",
    token: "x".repeat(48)
  });
  assert.equal(result.role, "staff");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "acceptMemberInvitation");
  assert.equal(calls[0].payload.tenantId, "tenant-invited");
  assert.equal(calls[0].payload.token, "x".repeat(48));
});

test("Firebase workspace blocks invitation acceptance for unverified or invalid users", async () => {
  let callableCount = 0;
  const create = (user) => window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => user },
    httpsCallable() {
      callableCount += 1;
      return async () => ({ data: {} });
    }
  });
  await assert.rejects(
    create({ emailVerified: false }).acceptInvitation({ tenantId: "tenant-1", token: "x".repeat(48) }),
    /Confirme o seu e-mail/
  );
  await assert.rejects(
    create({ emailVerified: true }).acceptInvitation({ tenantId: "tenant-1", token: "short" }),
    /Convite inválido/
  );
  await assert.rejects(
    create(null).acceptInvitation({ tenantId: "tenant-1", token: "x".repeat(48) }),
    /Faça login/
  );
  assert.equal(callableCount, 0);
});


test("Firebase workspace reads a bounded schedule for the selected tenant", async () => {
  const calls = [];
  const adapter = window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
    functions: {},
    authAdapter: { mode: "firebase", getCurrentUser: () => ({ emailVerified: true }) },
    httpsCallable(_functions, name) {
      return async (payload) => {
        calls.push({ name, payload });
        return { data: name === "getSession"
          ? { tenants: [{ tenantId: "tenant-schedule", name: "Empresa" }] }
          : { ok: true, companySchedule: { "1": [] } } };
      };
    }
  });
  const result = await adapter.getSchedule({ startDate: "2026-10-01", endDate: "2026-10-31" });
  assert.equal(result.ok, true);
  assert.equal(calls.at(-1).name, "getTenantSchedule");
  assert.equal(calls.at(-1).payload.tenantId, "tenant-schedule");
  assert.equal(calls.at(-1).payload.startDate, "2026-10-01");
  await assert.rejects(adapter.getSchedule({ startDate: "2026-01-01", endDate: "2026-04-15" }), /até 90 dias/);
});
