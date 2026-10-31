import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/api/firebase-config.js", import.meta.url), "utf8");
const handler = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const host = "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev";
const config = {
  FIREBASE_ENVIRONMENT: "development",
  FIREBASE_PROJECT_ID: "alansm-booking-dev",
  FIREBASE_API_KEY: "public-development-api-key",
  FIREBASE_AUTH_DOMAIN: "alansm-booking-dev.firebaseapp.com",
  FIREBASE_APP_ID: "1:123456789:web:development"
};

test("configuration endpoint refuses non-preview hosts", async () => {
  const response = await handler.onRequestGet({
    request: new Request("https://example.com/api/firebase-config"),
    env: config
  });
  assert.equal(response.status, 404);
});

test("configuration endpoint fails closed until preview variables are configured", async () => {
  const response = await handler.onRequestGet({
    request: new Request("https://" + host + "/api/firebase-config"),
    env: {}
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});

test("configuration endpoint returns only explicit development Firebase config", async () => {
  const response = await handler.onRequestGet({
    request: new Request("https://" + host + "/api/firebase-config", {
      headers: { Origin: "https://" + host }
    }),
    env: config
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.environment, "development");
  assert.equal(payload.config.projectId, "alansm-booking-dev");
  assert.equal(payload.config.apiKey, "public-development-api-key");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

test("configuration endpoint rejects a non-development environment marker", async () => {
  const response = await handler.onRequestGet({
    request: new Request("https://" + host + "/api/firebase-config"),
    env: { ...config, FIREBASE_ENVIRONMENT: "production" }
  });
  assert.equal(response.status, 503);
});
