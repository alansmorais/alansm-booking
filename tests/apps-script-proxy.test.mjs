import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/api/booking.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { onRequestPost } = await import(moduleUrl);

test("Apps Script proxy fails closed when backend secrets are missing", async () => {
  const response = await onRequestPost({
    request: new Request("https://preview.example/api/booking", {
      method: "POST", body: JSON.stringify({ action: "health" })
    }),
    env: {}
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "backend_not_configured");
});

test("admin snapshot actions require the authorized Cloudflare Access identity", async () => {
  const response = await onRequestPost({
    request: new Request("https://preview.example/api/booking", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "get_snapshot", companyId: "demo" })
    }),
    env: { GAS_WEB_APP_URL: "https://script.google.com/macros/s/test/exec", GAS_API_TOKEN: "secret", BOOKING_ADMIN_EMAIL: "owner@example.com" }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "forbidden");
});

test("proxy injects the server-side token and forwards an authorized request", async () => {
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ ok: true, result: { status: "ready" } }), { status: 200 });
  };
  try {
    const response = await onRequestPost({
      request: new Request("https://preview.example/api/booking", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-access-authenticated-user-email": "owner@example.com" },
        body: JSON.stringify({ action: "get_snapshot", companyId: "demo" })
      }),
      env: { GAS_WEB_APP_URL: "https://script.google.com/macros/s/test/exec", GAS_API_TOKEN: "server-secret", BOOKING_ADMIN_EMAIL: "owner@example.com" }
    });
    assert.equal(response.status, 200);
    assert.equal(sent.body.token, "server-secret");
    assert.equal(sent.body.companyId, "demo");
    assert.equal((await response.json()).result.status, "ready");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Apps Script source is valid JavaScript syntax", async () => {
  const gas = await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
  assert.doesNotThrow(() => new Function(gas));
});
