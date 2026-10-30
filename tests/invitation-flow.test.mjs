import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/invitation-flow.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, String, TypeError, Error });

test("invitation flow accepts only after a verified user is refreshed", async () => {
  const calls = [];
  const flow = window.BookingInvitation.createInvitationFlow({
    auth: {
      getCurrentUser() { calls.push("current"); return { uid: "user-1" }; },
      async reloadCurrentUser() { calls.push("reload"); return { uid: "user-1", emailVerified: true }; }
    },
    workspace: {
      async acceptInvitation(input) { calls.push(["accept", input]); return { ok: true, role: "staff" }; },
      async getSession() { calls.push("session"); return { tenants: [{ tenantId: "tenant-1" }] }; }
    }
  });
  const result = await flow.accept({ tenantId: "tenant-1", token: "x".repeat(48) });
  assert.equal(result.status, "accepted");
  assert.equal(result.result.role, "staff");
  assert.deepEqual(calls.map(x => Array.isArray(x) ? x[0] : x), ["current", "reload", "accept", "session"]);
});

test("invitation flow asks for authentication or email verification before accepting", async () => {
  let accepted = 0;
  const create = user => window.BookingInvitation.createInvitationFlow({
    auth: {
      getCurrentUser: () => user,
      async reloadCurrentUser() { return user; }
    },
    workspace: {
      async acceptInvitation() { accepted += 1; },
      async getSession() { return {}; }
    }
  });
  assert.equal((await create(null).accept({ tenantId: "tenant-1", token: "x".repeat(48) })).status, "authentication-required");
  assert.equal((await create({ emailVerified: false }).accept({ tenantId: "tenant-1", token: "x".repeat(48) })).status, "verification-required");
  assert.equal(accepted, 0);
});

test("invitation flow rejects malformed links before authentication", async () => {
  let authCalls = 0;
  const flow = window.BookingInvitation.createInvitationFlow({
    auth: {
      getCurrentUser() { authCalls += 1; return null; },
      async reloadCurrentUser() { authCalls += 1; return null; }
    },
    workspace: { async acceptInvitation() {}, async getSession() {} }
  });
  await assert.rejects(flow.accept({ tenantId: "tenant-1", token: "short" }), /Link de convite inválido/);
  assert.equal(authCalls, 0);
});
