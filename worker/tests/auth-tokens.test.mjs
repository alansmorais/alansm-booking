import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { setupMockBackend } from "./mock-backend.mjs";

test("valid Firebase ID token is accepted and reaches protected operations", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "user-1", email: "user1@example.com" });
  backend.registerUser({ uid: "user-1", email: "user1@example.com", emailVerified: true });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.user.uid, "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing authorization header returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const res = await worker.fetch(new Request("https://api.example/api/getSession", {
    method: "POST",
    headers: {
      Origin: "https://preview.alansm-booking-preview.pages.dev",
      "content-type": "application/json"
    },
    body: "{}"
  }), backend.env);

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthenticated");
  assert.match(body.error.message, /login/i);
});

test("malformed token format returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const res = await worker.fetch(new Request("https://api.example/api/getSession", {
    method: "POST",
    headers: {
      Authorization: "Bearer not.a.valid.jwt.token",
      Origin: "https://preview.alansm-booking-preview.pages.dev",
      "content-type": "application/json"
    },
    body: "{}"
  }), backend.env);

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "unauthenticated");
});

test("expired token returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const now = Math.floor(Date.now() / 1000);
  const token = backend.createIdToken({
    sub: "user-exp",
    iat: now - 7200,
    exp: now - 3600
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "unauthenticated");
    assert.match(body.error.message, /expirada/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token with tampered signature returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "user-tamper" }, { corruptSignature: true });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "unauthenticated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token signed with unknown kid returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "user-kid" }, { kid: "unknown-kid" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "unauthenticated");
    assert.match(body.error.message, /desconhecida/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token with wrong audience or issuer returns 401 unauthenticated", async () => {
  const backend = setupMockBackend();
  const tokenWrongAud = backend.createIdToken({ aud: "wrong-project-id" });
  const tokenWrongIss = backend.createIdToken({ iss: "https://securetoken.google.com/wrong-project" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const resAud = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenWrongAud,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);
    assert.equal(resAud.status, 401);

    const resIss = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + tokenWrongIss,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);
    assert.equal(resIss.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("disabled Firebase user account is rejected with 403 permission-denied", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "user-disabled", email: "disabled@example.com" });
  backend.registerUser({ uid: "user-disabled", email: "disabled@example.com", disabled: true });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/getSession", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: "{}"
    }), backend.env);

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "permission-denied");
    assert.match(body.error.message, /desativada/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unverified email cannot create a tenant (412 failed-precondition)", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({
    sub: "user-unverified",
    email: "unverified@example.com",
    email_verified: false
  });
  backend.registerUser({ uid: "user-unverified", email: "unverified@example.com", emailVerified: false });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/createTenant", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://preview.alansm-booking-preview.pages.dev",
        "content-type": "application/json"
      },
      body: JSON.stringify({ name: "Empresa Nova", slug: "empresa-nova" })
    }), backend.env);

    assert.equal(res.status, 412);
    const body = await res.json();
    assert.equal(body.error.code, "failed-precondition");
    assert.match(body.error.message, /Confirme o seu e-mail/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
