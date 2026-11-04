import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { setupMockBackend } from "./mock-backend.mjs";

test("catalog-clients: saveCatalogItem validates roles, creates services/pros, and audits", async () => {
  const backend = setupMockBackend();
  const ownerToken = backend.createIdToken({ sub: "owner-cat", email: "owner@cat.com" });
  backend.registerUser({ uid: "owner-cat", email: "owner@cat.com", emailVerified: true });

  const staffToken = backend.createIdToken({ sub: "staff-cat", email: "staff@cat.com" });
  backend.registerUser({ uid: "staff-cat", email: "staff@cat.com", emailVerified: true });

  backend.seedDocument("tenants/t-cat", { name: "Studio Cat", status: "active", timezone: "Europe/Lisbon", currency: "EUR" });
  backend.seedDocument("tenants/t-cat/members/owner-cat", { uid: "owner-cat", tenantId: "t-cat", role: "owner", status: "active" });
  backend.seedDocument("tenants/t-cat/members/staff-cat", { uid: "staff-cat", tenantId: "t-cat", role: "staff", status: "active" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Staff cannot create services (403)
    const resStaff = await worker.fetch(new Request("https://api.example/api/saveCatalogItem", {
      method: "POST",
      headers: { Authorization: "Bearer " + staffToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-cat", kind: "service", name: "Corte Masculino",
        durationMinutes: 30, priceMinor: 2500, currency: "EUR"
      })
    }), backend.env);
    assert.equal(resStaff.status, 403);
    const bodyStaff = await resStaff.json();
    assert.equal(bodyStaff.error.code, "permission-denied");

    // 2. Owner creates service successfully (200)
    const resService = await worker.fetch(new Request("https://api.example/api/saveCatalogItem", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-cat", kind: "service", name: "Corte Masculino",
        durationMinutes: 30, priceMinor: 2500, currency: "EUR"
      })
    }), backend.env);
    assert.equal(resService.status, 200);
    const bodyService = await resService.json();
    assert.equal(bodyService.ok, true);
    assert.equal(bodyService.kind, "service");
    assert.ok(bodyService.itemId);

    // Verify service in DB
    const serviceDoc = backend.getDocument(`tenants/t-cat/services/${bodyService.itemId}`);
    assert.ok(serviceDoc);
    assert.equal(serviceDoc.fields.name, "Corte Masculino");
    assert.equal(serviceDoc.fields.durationMinutes, 30);
    assert.equal(serviceDoc.fields.priceMinor, 2500);
    assert.equal(serviceDoc.fields.currency, "EUR");
    assert.equal(serviceDoc.fields.status, "active");

    // 3. Owner creates professional successfully (200)
    const resPro = await worker.fetch(new Request("https://api.example/api/saveCatalogItem", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-cat", kind: "professional", name: "Carlos Barbeiro",
        color: "#112233"
      })
    }), backend.env);
    assert.equal(resPro.status, 200);
    const bodyPro = await resPro.json();
    assert.equal(bodyPro.ok, true);
    assert.equal(bodyPro.kind, "professional");

    const proDoc = backend.getDocument(`tenants/t-cat/professionals/${bodyPro.itemId}`);
    assert.ok(proDoc);
    assert.equal(proDoc.fields.name, "Carlos Barbeiro");
    assert.equal(proDoc.fields.color, "#112233");
    assert.equal(proDoc.fields.status, "active");

    // 4. Update service details
    const resUpdate = await worker.fetch(new Request("https://api.example/api/saveCatalogItem", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-cat", kind: "service", itemId: bodyService.itemId,
        name: "Corte & Barba Premium", durationMinutes: 45, priceMinor: 4000, currency: "EUR"
      })
    }), backend.env);
    assert.equal(resUpdate.status, 200);

    const updatedServiceDoc = backend.getDocument(`tenants/t-cat/services/${bodyService.itemId}`);
    assert.equal(updatedServiceDoc.fields.name, "Corte & Barba Premium");
    assert.equal(updatedServiceDoc.fields.durationMinutes, 45);
    assert.equal(updatedServiceDoc.fields.priceMinor, 4000);

    // 5. Deactivate professional
    const resDeact = await worker.fetch(new Request("https://api.example/api/saveCatalogItem", {
      method: "POST",
      headers: { Authorization: "Bearer " + ownerToken, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "t-cat", kind: "professional", itemId: bodyPro.itemId,
        status: "inactive"
      })
    }), backend.env);
    assert.equal(resDeact.status, 200);

    const deactProDoc = backend.getDocument(`tenants/t-cat/professionals/${bodyPro.itemId}`);
    assert.equal(deactProDoc.fields.status, "inactive");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog-clients: getTenantCatalog retrieves active services and pros with tenant isolation", async () => {
  const backend = setupMockBackend();
  const tokenA = backend.createIdToken({ sub: "user-a", email: "userA@cat.com" });
  backend.registerUser({ uid: "user-a", email: "userA@cat.com", emailVerified: true });

  const tokenB = backend.createIdToken({ sub: "user-b", email: "userB@cat.com" });
  backend.registerUser({ uid: "user-b", email: "userB@cat.com", emailVerified: true });

  // Tenant A
  backend.seedDocument("tenants/tenant-a", { name: "Tenant A", status: "active" });
  backend.seedDocument("tenants/tenant-a/members/user-a", { uid: "user-a", tenantId: "tenant-a", role: "staff", status: "active" });
  backend.seedDocument("tenants/tenant-a/services/srv-a1", { name: "Service A1", durationMinutes: 30, priceMinor: 2000, currency: "EUR", status: "active" });
  backend.seedDocument("tenants/tenant-a/services/srv-a2", { name: "Service A2 Inactive", durationMinutes: 30, priceMinor: 2000, currency: "EUR", status: "inactive" });
  backend.seedDocument("tenants/tenant-a/professionals/pro-a1", { name: "Pro A1", status: "active", color: "#aabbcc" });

  // Tenant B
  backend.seedDocument("tenants/tenant-b", { name: "Tenant B", status: "active" });
  backend.seedDocument("tenants/tenant-b/members/user-b", { uid: "user-b", tenantId: "tenant-b", role: "owner", status: "active" });
  backend.seedDocument("tenants/tenant-b/services/srv-b1", { name: "Secret B Service", durationMinutes: 60, priceMinor: 5000, currency: "USD", status: "active" });
  backend.seedDocument("tenants/tenant-b/professionals/pro-b1", { name: "Pro B1 Secret", status: "active", color: "#112233" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. User A queries Tenant A catalog
    const resA = await worker.fetch(new Request("https://api.example/api/getTenantCatalog", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-a" })
    }), backend.env);
    assert.equal(resA.status, 200);
    const bodyA = await resA.json();
    assert.equal(bodyA.ok, true);
    assert.equal(bodyA.services.length, 1);
    assert.equal(bodyA.services[0].name, "Service A1");
    assert.equal(bodyA.professionals.length, 1);
    assert.equal(bodyA.professionals[0].name, "Pro A1");

    // 2. User A attempts to access Tenant B catalog (403 forbidden)
    const resForbidden = await worker.fetch(new Request("https://api.example/api/getTenantCatalog", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-b" })
    }), backend.env);
    assert.equal(resForbidden.status, 403);
    const bodyForbidden = await resForbidden.json();
    assert.equal(bodyForbidden.error.code, "permission-denied");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalog-clients: saveTenantClient and getTenantClients enforce tenant boundaries", async () => {
  const backend = setupMockBackend();
  const tokenA = backend.createIdToken({ sub: "user-client-a", email: "clientA@cat.com" });
  backend.registerUser({ uid: "user-client-a", email: "clientA@cat.com", emailVerified: true });

  const tokenB = backend.createIdToken({ sub: "user-client-b", email: "clientB@cat.com" });
  backend.registerUser({ uid: "user-client-b", email: "clientB@cat.com", emailVerified: true });

  backend.seedDocument("tenants/tenant-ca", { name: "Tenant CA", status: "active" });
  backend.seedDocument("tenants/tenant-ca/members/user-client-a", { uid: "user-client-a", tenantId: "tenant-ca", role: "staff", status: "active" });

  backend.seedDocument("tenants/tenant-cb", { name: "Tenant CB", status: "active" });
  backend.seedDocument("tenants/tenant-cb/members/user-client-b", { uid: "user-client-b", tenantId: "tenant-cb", role: "owner", status: "active" });
  backend.seedDocument("tenants/tenant-cb/clients/client-secret-b", {
    name: "VIP Confidential", phone: "+351911999888", email: "secret@corp.com", status: "active"
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = backend.mockFetch;
  try {
    // 1. Staff of Tenant CA creates a client
    const resCreate = await worker.fetch(new Request("https://api.example/api/saveTenantClient", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-ca", name: "Maria Santos", phone: "+351912345678", email: "maria@example.com", notes: "Prefere café"
      })
    }), backend.env);
    assert.equal(resCreate.status, 200);
    const bodyCreate = await resCreate.json();
    assert.equal(bodyCreate.ok, true);
    assert.ok(bodyCreate.clientId);

    // 2. Staff of Tenant CA lists clients
    const resList = await worker.fetch(new Request("https://api.example/api/getTenantClients", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-ca" })
    }), backend.env);
    assert.equal(resList.status, 200);
    const bodyList = await resList.json();
    assert.equal(bodyList.ok, true);
    assert.equal(bodyList.clients.length, 1);
    assert.equal(bodyList.clients[0].name, "Maria Santos");
    assert.equal(bodyList.clients[0].phone, "+351912345678");

    // 3. User A cannot list Tenant CB clients (403)
    const resForbiddenList = await worker.fetch(new Request("https://api.example/api/getTenantClients", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-cb" })
    }), backend.env);
    assert.equal(resForbiddenList.status, 403);

    // 4. User A cannot modify Tenant CB client (403)
    const resForbiddenSave = await worker.fetch(new Request("https://api.example/api/saveTenantClient", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenA, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-cb", clientId: "client-secret-b", name: "Hacked Name"
      })
    }), backend.env);
    assert.equal(resForbiddenSave.status, 403);

    // Verify Tenant CB client was NOT modified
    const clientB = backend.getDocument("tenants/tenant-cb/clients/client-secret-b");
    assert.equal(clientB.fields.name, "VIP Confidential");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
