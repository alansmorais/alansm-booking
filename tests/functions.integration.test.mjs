import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "demo-alansm-booking";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
let idToken;
let email;
let tenantId;

async function jsonRequest(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function callable(name, data, token = idToken) {
  return jsonRequest(`${FUNCTIONS}/${name}`, { data }, token ? { authorization: `Bearer ${token}` } : {});
}

before(async () => {
  email = `ci-${Date.now()}@example.test`;
  const adminApp = initializeApp({ projectId: PROJECT }, "booking-integration-tests");
  const auth = getAuth(adminApp);
  const user = await auth.createUser({
    email,
    password: "Test-password-123!",
    emailVerified: true
  });
  const customToken = await auth.createCustomToken(user.uid);
  const signin = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken, returnSecureToken: true
  });
  assert.equal(signin.status, 200, JSON.stringify(signin.data));
  idToken = signin.data.idToken;
});

test("createTenant rejects unauthenticated calls", async () => {
  const result = await callable("createTenant", {
    name: "Teste", slug: `teste-${Date.now()}`
  }, null);
  assert.notEqual(result.data.result?.ok, true);
});

test("createTenant rejects users whose email is not verified", async () => {
  const unverifiedEmail = `unverified-${Date.now()}@example.test`;
  const signup = await jsonRequest(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    email: unverifiedEmail,
    password: "Test-password-123!",
    returnSecureToken: true
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.data));

  const result = await callable("createTenant", {
    name: "Empresa não verificada",
    slug: `unverified-${Date.now()}`,
    timezone: "Europe/Warsaw",
    currency: "PLN"
  }, signup.data.idToken);

  assert.notEqual(result.data.result?.ok, true);
  assert.equal(result.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(result.data));
});

test("createTenant creates a tenant and owner membership for verified user", async () => {
  const slug = `ci-${Date.now()}`;
  const result = await callable("createTenant", {
    name: "Empresa de Teste",
    slug,
    timezone: "Europe/Warsaw",
    currency: "PLN"
  });
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.result.tenant.slug, slug);
  assert.equal(result.data.result.tenant.role, "owner");
  tenantId = result.data.result.tenant.tenantId;
});

test("createTenant prevents duplicate public slugs", async () => {
  const slug = `duplicate-${Date.now()}`;
  const payload = { name: "Empresa", slug, timezone: "Europe/Warsaw", currency: "PLN" };
  const first = await callable("createTenant", payload);
  assert.equal(first.data.result?.ok, true, JSON.stringify(first.data));
  const second = await callable("createTenant", payload);
  assert.notEqual(second.data.result?.ok, true);
});

test("getSession returns the signed-in user's tenant membership", async () => {
  const result = await callable("getSession", {});
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.ok(Array.isArray(result.data.result.tenants));
  assert.ok(result.data.result.tenants.some(tenant => tenant.role === "owner"));
});


test("saveScheduleSettings accepts valid company and professional weekly hours", async () => {
  const days = {
    "0": [],
    "1": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }],
    "2": [{ start: "10:00", end: "16:00", breaks: [] }],
    "3": [], "4": [], "5": [], "6": []
  };
  const result = await callable("saveScheduleSettings", { tenantId, scope: "company", days });
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.result.scheduleId, "company");
});

test("saveScheduleSettings rejects overlapping or malformed periods", async () => {
  const days = { "1": [
    { start: "09:00", end: "13:00", breaks: [] },
    { start: "12:00", end: "17:00", breaks: [] }
  ] };
  const result = await callable("saveScheduleSettings", { tenantId, scope: "company", days });
  assert.notEqual(result.data.result?.ok, true);
  assert.equal(result.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(result.data));
});

test("saveScheduleException writes a bounded company closure date range", async () => {
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const result = await callable("saveScheduleException", {
    tenantId, kind: "companyClosure", startDate: date, endDate: date, reason: "Feriado de teste"
  });
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.result.datesSaved, 1);
});

test("saveScheduleException rejects ranges longer than 90 days", async () => {
  const startDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 110 * 86400000).toISOString().slice(0, 10);
  const result = await callable("saveScheduleException", {
    tenantId, kind: "companyClosure", startDate, endDate
  });
  assert.notEqual(result.data.result?.ok, true);
  assert.equal(result.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(result.data));
});

test("saveScheduleBlock creates and removes a company-wide time block", async () => {
  const date = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
  const created = await callable("saveScheduleBlock", {
    tenantId, date, start: "14:00", end: "15:30", reason: "Manutenção"
  });
  assert.equal(created.data.result?.ok, true, JSON.stringify(created.data));
  const blockId = created.data.result.blockId;
  const removed = await callable("saveScheduleBlock", { tenantId, date, blockId, remove: true });
  assert.equal(removed.data.result?.removed, true, JSON.stringify(removed.data));
});

test("saveScheduleBlock rejects invalid time ranges", async () => {
  const date = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
  const result = await callable("saveScheduleBlock", { tenantId, date, start: "16:00", end: "15:00" });
  assert.notEqual(result.data.result?.ok, true);
  assert.equal(result.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(result.data));
});


test("getTenantCatalog returns a bounded safe catalog for an active member", async () => {
  const result = await callable("getTenantCatalog", { tenantId });
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.ok(Array.isArray(result.data.result.professionals));
  assert.ok(Array.isArray(result.data.result.services));
  assert.equal("clients" in result.data.result, false);
});

test("getTenantCatalog denies access to a tenant without membership", async () => {
  const result = await callable("getTenantCatalog", { tenantId: "tenant-not-owned-by-user" });
  assert.equal(result.data.error?.status, "PERMISSION_DENIED", JSON.stringify(result.data));
});

test("getAgendaAppointments accepts a bounded date window and rejects windows over 31 days", async () => {
  const startAtMs = Date.now();
  const valid = await callable("getAgendaAppointments", {
    tenantId, startAtMs, endAtMs: startAtMs + 7 * 86400000
  });
  assert.equal(valid.data.result?.ok, true, JSON.stringify(valid.data));
  assert.ok(Array.isArray(valid.data.result.appointments));
  const invalid = await callable("getAgendaAppointments", {
    tenantId, startAtMs, endAtMs: startAtMs + 32 * 86400000
  });
  assert.equal(invalid.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(invalid.data));
});
