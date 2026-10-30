import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const PROJECT = "demo-alansm-booking";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
let idToken;
let email;

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
  const signup = await jsonRequest(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    email, password: "Test-password-123!", returnSecureToken: true
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.data));
  idToken = signup.data.idToken;
  const verified = await jsonRequest(`${AUTH}/accounts:update?key=fake-api-key`, {
    idToken, emailVerified: true, returnSecureToken: true
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  idToken = verified.data.idToken;
});

test("createTenant rejects unauthenticated calls", async () => {
  const result = await callable("createTenant", {
    name: "Teste", slug: `teste-${Date.now()}`
  }, null);
  assert.notEqual(result.data.result?.ok, true);
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
