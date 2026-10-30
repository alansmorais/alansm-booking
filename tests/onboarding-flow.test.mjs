import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/onboarding-flow.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, String, TypeError, Error });

test("slug normalization handles accents and punctuation", () => {
  assert.equal(window.BookingOnboarding.normalizeSlug("  Clínica São José & Cia  "), "clinica-sao-jose-cia");
});

test("tenant is created only after verified email", async () => {
  const calls = [];
  const flow = window.BookingOnboarding.createOnboardingFlow({
    auth: {
      async register(value) { calls.push(["register", value.email]); },
      async sendEmailVerification() { calls.push(["verify"]); },
      async reloadCurrentUser() { calls.push(["reload"]); return { emailVerified: false }; }
    },
    workspace: {
      async createTenant() { calls.push(["tenant"]); },
      async getSession() { calls.push(["session"]); }
    }
  });
  const result = await flow.registerAndCreateWorkspace({
    displayName: "Alan", email: "alan@example.com", password: "not-a-real-password",
    businessName: "Clínica São José", slug: "clinica-sao-jose"
  });
  assert.equal(result.status, "verification-required");
  assert.equal(result.tenantCreated, false);
  assert.deepEqual(calls.map((item) => item[0]), ["register", "verify", "reload"]);
});

test("verified registration creates tenant then loads session", async () => {
  const calls = [];
  const flow = window.BookingOnboarding.createOnboardingFlow({
    auth: {
      async register() { calls.push("register"); },
      async sendEmailVerification() { calls.push("verify"); },
      async reloadCurrentUser() { calls.push("reload"); return { emailVerified: true }; }
    },
    workspace: {
      async createTenant(input) { calls.push("tenant"); return { tenantId: "tenant-1", ...input }; },
      async getSession() { calls.push("session"); return { tenants: [{ tenantId: "tenant-1" }] }; }
    }
  });
  const result = await flow.registerAndCreateWorkspace({
    displayName: "Alan", email: "alan@example.com", password: "not-a-real-password",
    businessName: "Barbearia Central", slug: "barbearia-central"
  });
  assert.equal(result.status, "complete");
  assert.equal(result.tenant.slug, "barbearia-central");
  assert.deepEqual(calls, ["register", "verify", "reload", "tenant", "session"]);
});

test("invalid business name is rejected before authentication", async () => {
  let called = false;
  const flow = window.BookingOnboarding.createOnboardingFlow({
    auth: { async register() { called = true; }, async sendEmailVerification() {}, async reloadCurrentUser() {} },
    workspace: { async createTenant() {}, async getSession() {} }
  });
  await assert.rejects(flow.registerAndCreateWorkspace({ businessName: "A" }), /nome de empresa válido/);
  assert.equal(called, false);
});
