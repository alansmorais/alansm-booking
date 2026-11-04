import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { setupMockBackend } from "./mock-backend.mjs";

test("tenant-operations: createTenant creates tenant, slug, and owner membership", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "owner-1", email: "owner1@example.com" });
  backend.registerUser({ uid: "owner-1", email: "owner1@example.com", emailVerified: true, displayName: "Owner One" });

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
      body: JSON.stringify({ name: "Studio Alfa", slug: "studio-alfa", timezone: "Europe/Lisbon", currency: "EUR" })
    }), backend.env);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.tenant.name, "Studio Alfa");
    assert.equal(body.tenant.slug, "studio-alfa");
    assert.equal(body.tenant.currency, "EUR");
    assert.equal(body.tenant.role, "owner");

    // Verify stored records
    const tenantDoc = backend.getDocument(`tenants/${body.tenant.tenantId}`);
    assert.ok(tenantDoc);
    assert.equal(tenantDoc.fields.status, "active");
    assert.equal(tenantDoc.fields.slug, "studio-alfa");

    const slugDoc = backend.getDocument("tenantSlugs/studio-alfa");
    assert.ok(slugDoc);
    assert.equal(slugDoc.fields.tenantId, body.tenant.tenantId);

    const memberDoc = backend.getDocument(`tenants/${body.tenant.tenantId}/members/owner-1`);
    assert.ok(memberDoc);
    assert.equal(memberDoc.fields.role, "owner");
    assert.equal(memberDoc.fields.status, "active");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant-operations: createTenant rejects duplicate slug with 409 already-exists", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "owner-2", email: "owner2@example.com" });
  backend.registerUser({ uid: "owner-2", email: "owner2@example.com", emailVerified: true });

  // Pre-seed the slug
  backend.seedDocument("tenantSlugs/salao-vip", { tenantId: "other-tenant-id" });

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
      body: JSON.stringify({ name: "Salão VIP", slug: "salao-vip" })
    }), backend.env);

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "already-exists");
    assert.match(body.error.message, /já está em utilização/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant-operations: getSession returns user memberships and tenant summaries", async () => {
  const backend = setupMockBackend();
  const token = backend.createIdToken({ sub: "user-multi", email: "multi@example.com" });
  backend.registerUser({ uid: "user-multi", email: "multi@example.com", emailVerified: true, displayName: "Multi User" });

  backend.seedDocument("tenants/t-alfa", { name: "Studio Alfa", slug: "studio-alfa", status: "active", timezone: "Europe/Lisbon", currency: "EUR" });
  backend.seedDocument("tenants/t-alfa/members/user-multi", { uid: "user-multi", tenantId: "t-alfa", role: "owner", status: "active" });

  backend.seedDocument("tenants/t-beta", { name: "Barbearia Beta", slug: "barbearia-beta", status: "active", timezone: "America/Sao_Paulo", currency: "BRL" });
  backend.seedDocument("tenants/t-beta/members/user-multi", { uid: "user-multi", tenantId: "t-beta", role: "staff", status: "active" });

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
    assert.equal(body.user.uid, "user-multi");
    assert.equal(body.tenants.length, 2);

    const alfa = body.tenants.find(t => t.tenantId === "t-alfa");
    assert.ok(alfa);
    assert.equal(alfa.role, "owner");

    const beta = body.tenants.find(t => t.tenantId === "t-beta");
    assert.ok(beta);
    assert.equal(beta.role, "staff");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant-operations: member invitations, acceptance, access updates, and listing", async () => {
  const backend = setupMockBackend();
  const ownerToken = backend.createIdToken({ sub: "owner-invite", email: "owner@invite.com" });
  backend.registerUser({ uid: "owner-invite", email: "owner@invite.com", emailVerified: true });

  const adminToken = backend.createIdToken({ sub: "admin-invite", email: "admin@invite.com" });
  backend.registerUser({ uid: "admin-invite", email: "admin@invite.com", emailVerified: true });

  const inviteeToken = backend.createIdToken({ sub: "invitee-1", email: "collab@invite.com" });
  backend.registerUser({ uid: "invitee-1", email: "collab@invite.com", emailVerified: true, displayName: "Novo Colaborador" });

  backend.seedDocument("tenants/t-inv", { name: "Empresa Convites", slug: "empresa-convites", status: "active" });
  backend.seedDocument("tenants/t-inv/members/owner-invite", { uid: "owner-invite", tenantId: "t-inv", role: "owner", status: "active" });
  backend.seedDocument("tenants/t-inv/members/admin-invite", { uid: "admin-invite", tenantId: "t-inv", role: "admin", status: "active" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Non-owner admin cannot invite another admin (403)
    const resAdminForbidden = await worker.fetch(new Request("https://api.example/api/createMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", email: "newadmin@invite.com", role: "admin" })
    }), backend.env);
    assert.equal(resAdminForbidden.status, 403);
    const bodyAdminForbidden = await resAdminForbidden.json();
    assert.equal(bodyAdminForbidden.error.code, "permission-denied");

    // 2. Owner invites a staff member
    const resInvite = await worker.fetch(new Request("https://api.example/api/createMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", email: "collab@invite.com", role: "staff" })
    }), backend.env);
    assert.equal(resInvite.status, 200);
    const bodyInvite = await resInvite.json();
    assert.equal(bodyInvite.ok, true);
    assert.ok(bodyInvite.invitationToken);

    // 3. Duplicate invitation for same email is rejected (409)
    const resDupInvite = await worker.fetch(new Request("https://api.example/api/createMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", email: "collab@invite.com", role: "staff" })
    }), backend.env);
    assert.equal(resDupInvite.status, 409);
    const bodyDupInvite = await resDupInvite.json();
    assert.equal(bodyDupInvite.error.code, "already-exists");

    // 4. Invitee accepts the invitation
    const resAccept = await worker.fetch(new Request("https://api.example/api/acceptMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + inviteeToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", token: bodyInvite.invitationToken })
    }), backend.env);
    assert.equal(resAccept.status, 200);
    const bodyAccept = await resAccept.json();
    assert.equal(bodyAccept.ok, true);
    assert.equal(bodyAccept.role, "staff");

    // Verify member created
    const newMemberDoc = backend.getDocument("tenants/t-inv/members/invitee-1");
    assert.ok(newMemberDoc);
    assert.equal(newMemberDoc.fields.role, "staff");
    assert.equal(newMemberDoc.fields.status, "active");

    // 5. Re-inviting existing member is rejected (409)
    const resReinvite = await worker.fetch(new Request("https://api.example/api/createMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", email: "collab@invite.com", role: "staff" })
    }), backend.env);
    assert.equal(resReinvite.status, 409);
    const bodyReinvite = await resReinvite.json();
    assert.equal(bodyReinvite.error.code, "already-exists");

    // 6. Non-owner admin cannot promote staff to admin (403)
    const resPromoteForbidden = await worker.fetch(new Request("https://api.example/api/updateMemberAccess", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", memberUid: "invitee-1", role: "admin", status: "active" })
    }), backend.env);
    assert.equal(resPromoteForbidden.status, 403);
    const bodyPromoteForbidden = await resPromoteForbidden.json();
    assert.equal(bodyPromoteForbidden.error.code, "permission-denied");

    // 7. Owner promotes staff to admin (200)
    const resPromote = await worker.fetch(new Request("https://api.example/api/updateMemberAccess", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv", memberUid: "invitee-1", role: "admin", status: "active" })
    }), backend.env);
    assert.equal(resPromote.status, 200);

    // 8. Get tenant members list
    const resMembers = await worker.fetch(new Request("https://api.example/api/getTenantMembers", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-inv" })
    }), backend.env);
    assert.equal(resMembers.status, 200);
    const bodyMembers = await resMembers.json();
    assert.equal(bodyMembers.ok, true);
    assert.equal(bodyMembers.members.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant-operations: acceptMemberInvitation rejects expired invitation with 412 failed-precondition", async () => {
  const backend = setupMockBackend();
  const inviteeToken = backend.createIdToken({ sub: "invitee-exp", email: "expired@invite.com" });
  backend.registerUser({ uid: "invitee-exp", email: "expired@invite.com", emailVerified: true });

  const crypto = await import("node:crypto");
  const rawToken = "a".repeat(43);
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

  backend.seedDocument("tenants/t-exp", { name: "Empresa Exp", status: "active" });
  backend.seedDocument(`tenants/t-exp/invitations/${hash}`, {
    tenantId: "t-exp",
    email: "expired@invite.com",
    role: "staff",
    status: "pending",
    expiresAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    const res = await worker.fetch(new Request("https://api.example/api/acceptMemberInvitation", {
      method: "POST",
      headers: { Authorization: "Bearer " + inviteeToken, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "t-exp", token: rawToken })
    }), backend.env);

    assert.equal(res.status, 412);
    const body = await res.json();
    assert.equal(body.error.code, "failed-precondition");
    assert.match(body.error.message, /expirado/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
