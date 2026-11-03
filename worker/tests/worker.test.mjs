import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

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

test("unknown origins are not granted cross-origin access", async () => {
  const response = await worker.fetch(new Request("https://api.example/health", {
    headers: { Origin: "https://attacker.example" }
  }), env);
  assert.equal(response.headers.get("access-control-allow-origin"), "null");
});
