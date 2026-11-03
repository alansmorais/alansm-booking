import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { createTenant } from "../src/onboarding.js";
import { FirestoreRestTransaction, encodeValue, decodeValue } from "../src/firestore-rest.js";

const env = { ALLOWED_ORIGINS: "https://preview.alansm-booking-preview.pages.dev" };

test("health endpoint reports foundation state without exposing credentials", async () => {
  const response = await worker.fetch(new Request("https://api.example/health", {
    headers: { Origin: "https://preview.alansm-booking-preview.pages.dev" }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "alansm-booking-api");
  assert.equal(body.stage, "foundation");
  assert.equal(body.credentialsConfigured, false);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://preview.alansm-booking-preview.pages.dev");
  assert.equal(JSON.stringify(body).includes("private_key"), false);
});

test("business API refuses requests without Firebase bearer token", async () => {
  const response = await worker.fetch(new Request("https://api.example/api/session"), env);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "unauthenticated");
});


test("public booking routes are reachable without a signed-in customer", async () => {
  const response = await worker.fetch(new Request("https://api.example/api/getPublicBookingPage", {
    method: "POST",
    headers: { Origin: "https://preview.alansm-booking-preview.pages.dev", "content-type": "application/json" },
    body: JSON.stringify({ slug: "api" })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "invalid-argument");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://preview.alansm-booking-preview.pages.dev");
});

test("unknown origins are not granted cross-origin access", async () => {
  const response = await worker.fetch(new Request("https://api.example/health", {
    headers: { Origin: "https://attacker.example" }
  }), env);
  assert.equal(response.headers.get("access-control-allow-origin"), "null");
});

test("tenant onboarding rejects invalid company names before external access", async () => {
  await assert.rejects(
    createTenant({ sub: "test-user" }, { name: "A", slug: "empresa-valida" }, {}),
    (error) => error.code === "invalid-argument"
  );
});

test("tenant onboarding rejects reserved slugs", async () => {
  await assert.rejects(
    createTenant({ sub: "test-user" }, { name: "Empresa válida", slug: "admin" }, {}),
    (error) => error.code === "invalid-argument"
  );
});

test("tenant onboarding rejects invalid timezones and currencies", async () => {
  await assert.rejects(
    createTenant({ sub: "test-user" }, { name: "Empresa válida", slug: "empresa-valida", timezone: "Mars/Olympus_Mons" }, {}),
    (error) => error.code === "invalid-argument"
  );
  await assert.rejects(
    createTenant({ sub: "test-user" }, { name: "Empresa válida", slug: "empresa-valida", currency: "REAIS" }, {}),
    (error) => error.code === "invalid-argument"
  );
});


test("Firestore REST transaction reads documents and commits queued writes atomically", async () => {
  const calls = [];
  const request = async (path, body) => {
    calls.push({ path, body });
    if (path === ":batchGet") return [{ found: { name: "projects/p/databases/(default)/documents/tenants/t1", fields: { status: { stringValue: "active" }, seats: { integerValue: "4" } } } }];
    if (path === ":commit") return { writeResults: [{}] };
    return [];
  };
  const tx = new FirestoreRestTransaction(request, "transaction-bytes");
  const tenant = await tx.get("tenants/t1");
  assert.equal(tenant.exists, true);
  assert.equal(tenant.fields.status, "active");
  assert.equal(tenant.fields.seats, 4);
  tx.create("tenants/t1/auditLog/a1", { action: "created", active: true });
  await tx.commit();
  assert.equal(calls[0].path, ":batchGet");
  assert.equal(calls[0].body.transaction, "transaction-bytes");
  assert.equal(calls[1].path, ":commit");
  assert.equal(calls[1].body.transaction, "transaction-bytes");
  assert.equal(calls[1].body.writes.length, 1);
  assert.equal(calls[1].body.writes[0].currentDocument.exists, false);
});

test("Firestore REST transaction prevents reads after the first write", async () => {
  const tx = new FirestoreRestTransaction(async () => [], "tx");
  tx.set("tenants/t1", { status: "active" });
  await assert.rejects(tx.get("tenants/t1"), /all reads before writes/);
});

test("Firestore REST transaction encodes and decodes Firestore values", () => {
  assert.deepEqual(encodeValue({ count: 3, active: true, tags: ["a", "b"] }), {
    mapValue: { fields: {
      count: { integerValue: "3" },
      active: { booleanValue: true },
      tags: { arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } }
    } }
  });
  assert.deepEqual(decodeValue({ mapValue: { fields: { amount: { doubleValue: 12.5 } } } }), { amount: 12.5 });
});


test("Firestore collection queries use the parent document resource in the REST URL", async () => {
  let captured;
  const tx = new FirestoreRestTransaction(async (path, body) => {
    captured = { path, body };
    return [];
  }, "tx-query");
  await tx.query({ from: [{ collectionId: "appointments" }] }, "tenants/tenant-1");
  assert.equal(captured.path, "https://firestore.googleapis.com/v1/projects/gen-lang-client-0623364466/databases/(default)/documents/tenants/tenant-1:runQuery");
  assert.equal(captured.body.transaction, "tx-query");
  assert.equal("parent" in captured.body, false);
});
