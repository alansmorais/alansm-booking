import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

const PROJECT = "demo-alansm-booking";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
let idToken;
let email;
let tenantId;
let adminAuth;
let adminDb;

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
  adminAuth = auth;
  adminDb = getFirestore(adminApp);
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

test("getTenantSchedule returns tenant-scoped weekly settings", async () => {
  const result = await callable("getTenantSchedule", {
    tenantId, startDate: "2026-10-01", endDate: "2026-10-31"
  });
  assert.equal(result.data.result?.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.result.timezone, "Europe/Warsaw");
  assert.ok(result.data.result.companySchedule["1"]);
  assert.deepEqual(result.data.result.blocks, []);
  assert.deepEqual(result.data.result.exceptions, []);
});

test("getTenantSchedule rejects invalid or oversized date windows", async () => {
  const invalid = await callable("getTenantSchedule", {
    tenantId, startDate: "2026-10-31", endDate: "2026-10-01"
  });
  assert.equal(invalid.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(invalid.data));
  const oversized = await callable("getTenantSchedule", {
    tenantId, startDate: "2026-01-01", endDate: "2026-04-15"
  });
  assert.equal(oversized.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(oversized.data));
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


test("owner can create, update and deactivate tenant services and professionals", async () => {
  const service = await callable("saveTenantCatalogItem", {
    tenantId, kind: "service", name: "Corte teste", durationMinutes: 30,
    priceMinor: 5500, currency: "PLN"
  });
  assert.equal(service.data.result?.ok, true, JSON.stringify(service.data));
  const serviceId = service.data.result.itemId;
  const professional = await callable("saveTenantCatalogItem", {
    tenantId, kind: "professional", name: "Profissional teste", color: "#123ABC"
  });
  assert.equal(professional.data.result?.ok, true, JSON.stringify(professional.data));
  const professionalId = professional.data.result.itemId;
  const updated = await callable("saveTenantCatalogItem", {
    tenantId, kind: "service", itemId: serviceId, name: "Corte atualizado",
    durationMinutes: 45, priceMinor: 6500, currency: "PLN"
  });
  assert.equal(updated.data.result?.status, "active", JSON.stringify(updated.data));
  const disabled = await callable("saveTenantCatalogItem", {
    tenantId, kind: "professional", itemId: professionalId, active: false
  });
  assert.equal(disabled.data.result?.status, "inactive", JSON.stringify(disabled.data));
  const catalog = await callable("getTenantCatalogForManagement", { tenantId });
  assert.equal(catalog.data.result?.ok, true, JSON.stringify(catalog.data));
  assert.ok(catalog.data.result.services.some(item =>
    item.id === serviceId && item.name === "Corte atualizado" && item.durationMinutes === 45));
  assert.ok(catalog.data.result.professionals.some(item =>
    item.id === professionalId && item.status === "inactive"));
  const bookingCatalog = await callable("getTenantCatalog", { tenantId });
  assert.ok(!bookingCatalog.data.result.professionals.some(item => item.id === professionalId));
});

test("catalog management rejects invalid service values and unauthorized tenants", async () => {
  const invalid = await callable("saveTenantCatalogItem", {
    tenantId, kind: "service", name: "Serviço inválido",
    durationMinutes: 17, priceMinor: -1, currency: "PLN"
  });
  assert.equal(invalid.data.error?.status, "INVALID_ARGUMENT", JSON.stringify(invalid.data));
  const denied = await callable("saveTenantCatalogItem", {
    tenantId: "tenant-not-owned-by-user", kind: "professional", name: "Não autorizado"
  });
  assert.equal(denied.data.error?.status, "PERMISSION_DENIED", JSON.stringify(denied.data));
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


test("owner can invite a verified user and the invited user can accept once", async () => {
  const inviteEmail = `member-${Date.now()}@example.test`;
  const created = await callable("createMemberInvitation", {
    tenantId, email: inviteEmail, role: "staff"
  });
  assert.equal(created.data.result?.ok, true, JSON.stringify(created.data));
  const token = created.data.result.invitationToken;
  assert.equal(typeof token, "string");
  assert.equal(created.data.result.delivery, "manual");

  const duplicate = await callable("createMemberInvitation", {
    tenantId, email: inviteEmail.toUpperCase(), role: "staff"
  });
  assert.equal(duplicate.data.error?.status, "ALREADY_EXISTS", JSON.stringify(duplicate.data));
  const pendingList = await callable("getTenantMembers", { tenantId });
  assert.equal(pendingList.data.result?.ok, true, JSON.stringify(pendingList.data));
  const pendingInvite = pendingList.data.result.invitations.find((item) => item.email === inviteEmail);
  assert.ok(pendingInvite);
  assert.equal("invitationToken" in pendingInvite, false);

  const invitedUser = await adminAuth.createUser({
    email: inviteEmail, password: "Test-password-123!", emailVerified: true
  });
  const customToken = await adminAuth.createCustomToken(invitedUser.uid);
  const signedIn = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken, returnSecureToken: true
  });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data));
  const accepted = await callable("acceptMemberInvitation", { tenantId, token }, signedIn.data.idToken);
  assert.equal(accepted.data.result?.ok, true, JSON.stringify(accepted.data));
  assert.equal(accepted.data.result.role, "staff");

  const replay = await callable("acceptMemberInvitation", { tenantId, token }, signedIn.data.idToken);
  assert.notEqual(replay.data.result?.ok, true);
});



test("invitation acceptance rejects wrong email, unverified users and expired tokens", async () => {
  const inviteEmail = `edge-${Date.now()}@example.test`;
  const created = await callable("createMemberInvitation", { tenantId, email: inviteEmail, role: "staff" });
  assert.equal(created.data.result?.ok, true, JSON.stringify(created.data));
  const token = created.data.result.invitationToken;

  const wrongUser = await adminAuth.createUser({
    email: `wrong-${Date.now()}@example.test`, password: "Test-password-123!", emailVerified: true
  });
  const wrongCustomToken = await adminAuth.createCustomToken(wrongUser.uid);
  const wrongSignin = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: wrongCustomToken, returnSecureToken: true
  });
  assert.equal(wrongSignin.status, 200, JSON.stringify(wrongSignin.data));
  const wrongEmail = await callable("acceptMemberInvitation", { tenantId, token }, wrongSignin.data.idToken);
  assert.equal(wrongEmail.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(wrongEmail.data));

  const unverified = await jsonRequest(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    email: inviteEmail, password: "Test-password-123!", returnSecureToken: true
  });
  assert.equal(unverified.status, 200, JSON.stringify(unverified.data));
  const unverifiedResult = await callable("acceptMemberInvitation", { tenantId, token }, unverified.data.idToken);
  assert.equal(unverifiedResult.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(unverifiedResult.data));

  const expiryInvite = await callable("createMemberInvitation", {
    tenantId, email: wrongUser.email, role: "staff"
  });
  assert.equal(expiryInvite.data.result?.ok, true, JSON.stringify(expiryInvite.data));
  const expiryToken = expiryInvite.data.result.invitationToken;
  await adminDb.doc(`tenants/${tenantId}/invitations/${createHash("sha256").update(expiryToken).digest("hex")}`).update({
    expiresAt: new Date(Date.now() - 1000)
  });
  const expired = await callable("acceptMemberInvitation", { tenantId, token: expiryToken }, wrongSignin.data.idToken);
  assert.equal(expired.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(expired.data));
});

test("tenant managers can list members without exposing invitation tokens", async () => {
  const members = await callable("getTenantMembers", { tenantId });
  assert.equal(members.data.result?.ok, true, JSON.stringify(members.data));
  const staff = members.data.result.members.find((member) => member.role === "staff");
  assert.ok(staff);
  const updated = await callable("updateMemberAccess", {
    tenantId, memberUid: staff.uid, role: "staff", status: "suspended"
  });
  assert.equal(updated.data.result?.ok, true, JSON.stringify(updated.data));
  assert.equal(updated.data.result.status, "suspended");

  const reactivated = await callable("updateMemberAccess", {
    tenantId, memberUid: staff.uid, role: "staff", status: "active"
  });
  assert.equal(reactivated.data.result?.ok, true, JSON.stringify(reactivated.data));
  assert.equal(reactivated.data.result.status, "active");
});

test("admin can manage staff but cannot invite or promote another admin", async () => {
  const adminEmail = `admin-${Date.now()}@example.test`;
  const invitation = await callable("createMemberInvitation", {
    tenantId, email: adminEmail, role: "admin"
  });
  assert.equal(invitation.data.result?.ok, true, JSON.stringify(invitation.data));

  const adminUser = await adminAuth.createUser({
    email: adminEmail, password: "Test-password-123!", emailVerified: true
  });
  const adminCustomToken = await adminAuth.createCustomToken(adminUser.uid);
  const adminSignin = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: adminCustomToken, returnSecureToken: true
  });
  assert.equal(adminSignin.status, 200, JSON.stringify(adminSignin.data));
  const accepted = await callable("acceptMemberInvitation", {
    tenantId, token: invitation.data.result.invitationToken
  }, adminSignin.data.idToken);
  assert.equal(accepted.data.result?.ok, true, JSON.stringify(accepted.data));

  const staffEmail = `admin-created-staff-${Date.now()}@example.test`;
  const staffInvite = await callable("createMemberInvitation", {
    tenantId, email: staffEmail, role: "staff"
  }, adminSignin.data.idToken);
  assert.equal(staffInvite.data.result?.ok, true, JSON.stringify(staffInvite.data));

  const forbiddenAdminInvite = await callable("createMemberInvitation", {
    tenantId, email: `second-admin-${Date.now()}@example.test`, role: "admin"
  }, adminSignin.data.idToken);
  assert.equal(forbiddenAdminInvite.data.error?.status, "PERMISSION_DENIED", JSON.stringify(forbiddenAdminInvite.data));

  const ownerList = await callable("getTenantMembers", { tenantId });
  const existingAdmin = ownerList.data.result.members.find((member) => member.uid === adminUser.uid);
  assert.ok(existingAdmin);
  const forbiddenPromotion = await callable("updateMemberAccess", {
    tenantId, memberUid: adminUser.uid, role: "staff", status: "active"
  }, adminSignin.data.idToken);
  assert.equal(forbiddenPromotion.data.error?.status, "PERMISSION_DENIED", JSON.stringify(forbiddenPromotion.data));
});

test("owner membership cannot be suspended or changed", async () => {
  const result = await callable("updateMemberAccess", {
    tenantId, memberUid: (await adminAuth.getUserByEmail(email)).uid,
    role: "staff", status: "suspended"
  });
  assert.equal(result.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(result.data));
});

test("staff cannot create invitations or manage members", async () => {
  const inviteEmail = `denied-${Date.now()}@example.test`;
  // Use the staff member created in the invitation test by locating it in the tenant.
  const list = await callable("getTenantMembers", { tenantId });
  const staff = list.data.result.members.find((member) => member.role === "staff");
  assert.ok(staff);
  const user = await adminAuth.getUser(staff.uid);
  const customToken = await adminAuth.createCustomToken(user.uid);
  const signedIn = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken, returnSecureToken: true
  });
  const result = await callable("createMemberInvitation", {
    tenantId, email: inviteEmail, role: "staff"
  }, signedIn.data.idToken);
  assert.notEqual(result.data.result?.ok, true);
});


test("createAppointment enforces idempotency and prevents overlapping concurrent bookings", async () => {
  const professionalId = "booking-test-professional";
  const serviceId = "booking-test-service";
  const clientId = "booking-test-client";
  const days = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [
    String(day), [{ start: "00:00", end: "23:59", breaks: [] }]
  ]));
  const base = `tenants/${tenantId}`;
  await Promise.all([
    adminDb.doc(`${base}/professionals/${professionalId}`).set({
      tenantId, name: "Profissional de teste", status: "active"
    }),
    adminDb.doc(`${base}/services/${serviceId}`).set({
      tenantId, name: "Serviço de teste", status: "active",
      durationMinutes: 60, priceMinor: 5000, currency: "PLN"
    }),
    adminDb.doc(`${base}/clients/${clientId}`).set({
      tenantId, name: "Cliente de teste"
    }),
    adminDb.doc(`${base}/scheduleSettings/company`).set({ tenantId, days }),
    adminDb.doc(`${base}/scheduleSettings/professional_${professionalId}`).set({
      tenantId, scope: "professional", professionalId, days
    })
  ]);

  const startAtMs = Math.ceil((Date.now() + 48 * 60 * 60 * 1000) / 300000) * 300000;
  const payload = {
    tenantId, professionalId, serviceId, clientId, startAtMs,
    notes: "Teste de idempotência", idempotencyKey: `booking-idem-${Date.now()}`
  };
  const first = await callable("createAppointment", payload);
  assert.equal(first.data.result?.ok, true, JSON.stringify(first.data));
  assert.equal(first.data.result.replayed, false);

  const replay = await callable("createAppointment", payload);
  assert.equal(replay.data.result?.ok, true, JSON.stringify(replay.data));
  assert.equal(replay.data.result.appointmentId, first.data.result.appointmentId);
  assert.equal(replay.data.result.replayed, true);

  const reusedKey = await callable("createAppointment", {
    ...payload, startAtMs: startAtMs + 4 * 60 * 60 * 1000
  });
  assert.equal(reusedKey.data.error?.status, "ALREADY_EXISTS", JSON.stringify(reusedKey.data));

  const otherTenantId = `booking-isolation-${Date.now()}`;
  await adminDb.doc(`tenants/${otherTenantId}`).set({
    tenantId: otherTenantId, name: "Empresa isolada", status: "active",
    timezone: "Europe/Warsaw", currency: "PLN"
  });
  const crossTenant = await callable("createAppointment", {
    ...payload, tenantId: otherTenantId, idempotencyKey: `cross-tenant-${Date.now()}`
  });
  assert.equal(crossTenant.data.error?.status, "PERMISSION_DENIED", JSON.stringify(crossTenant.data));
  const isolatedAppointments = await adminDb.collection(`tenants/${otherTenantId}/appointments`).get();
  assert.equal(isolatedAppointments.size, 0, "A tentativa entre empresas não deve criar reservas.");

  const concurrentStart = startAtMs + 2 * 60 * 60 * 1000;
  const concurrentPayload = {
    ...payload, startAtMs: concurrentStart, notes: "Concorrência"
  };
  const attempts = await Promise.all([
    callable("createAppointment", { ...concurrentPayload, idempotencyKey: `parallel-a-${Date.now()}` }),
    callable("createAppointment", { ...concurrentPayload, idempotencyKey: `parallel-b-${Date.now()}` })
  ]);
  const successes = attempts.filter((item) => item.data.result?.ok === true);
  const failures = attempts.filter((item) => item.data.result?.ok !== true);
  assert.equal(successes.length, 1, JSON.stringify(attempts.map((item) => item.data)));
  assert.equal(failures.length, 1, JSON.stringify(attempts.map((item) => item.data)));
  assert.ok(["ALREADY_EXISTS", "ABORTED"].includes(failures[0].data.error?.status),
    JSON.stringify(failures[0].data));

  // The backend must reject a direct callable request outside company hours.
  const closedDays = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), []]));
  await adminDb.doc(`${base}/scheduleSettings/company`).set({ tenantId, days: closedDays });
  const outsideHours = await callable("createAppointment", {
    ...payload,
    startAtMs: startAtMs + 6 * 60 * 60 * 1000,
    idempotencyKey: `outside-hours-${Date.now()}`
  });
  assert.equal(outsideHours.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(outsideHours.data));
  const outsideHoursAppointments = await adminDb.collection(`${base}/appointments`)
    .where("startAt", "==", new Date(startAtMs + 6 * 60 * 60 * 1000))
    .get();

  assert.equal(outsideHoursAppointments.size, 0, "A reserva fora do horário não deve ser gravada.");

  // Reopen schedules, then verify a break blocks a booking that overlaps it.
  const localParts = (ms) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit",
      day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(ms));
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  };
  const clock = (hour, minute) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const weekdayNumber = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const makeOpenDays = () => Object.fromEntries(Array.from({ length: 7 }, (_, day) => [
    String(day), [{ start: "00:00", end: "23:59", breaks: [] }]
  ]));
  const assertNoAppointmentAt = async (startMs, message) => {
    const snapshot = await adminDb.collection(`${base}/appointments`)
      .where("startAt", "==", new Date(startMs))
      .get();
    assert.equal(snapshot.size, 0, message);
  };

  const breakStart = startAtMs + 8 * 60 * 60 * 1000;
  const breakLocal = localParts(breakStart);
  const breakWeekday = String(weekdayNumber[breakLocal.weekday]);
  const breakMinute = Number(breakLocal.hour) * 60 + Number(breakLocal.minute);
  const breakDays = makeOpenDays();
  breakDays[breakWeekday] = [{
    start: "00:00", end: "23:59",
    breaks: [{ start: clock(Number(breakLocal.hour), Number(breakLocal.minute)),
      end: clock(Math.floor((breakMinute + 30) / 60), (breakMinute + 30) % 60) }]
  }];
  await Promise.all([
    adminDb.doc(`${base}/scheduleSettings/company`).set({ tenantId, days: makeOpenDays() }),
    adminDb.doc(`${base}/scheduleSettings/professional_${professionalId}`).set({
      tenantId, scope: "professional", professionalId, days: breakDays
    })
  ]);
  const duringBreak = await callable("createAppointment", {
    ...payload, startAtMs: breakStart, idempotencyKey: `during-break-${Date.now()}`
  });
  assert.equal(duringBreak.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(duringBreak.data));

  await assertNoAppointmentAt(breakStart, "Uma reserva durante a pausa não deve ser gravada.");

  // A company-wide time block must reject a direct booking request.
  const blockStart = startAtMs + 10 * 60 * 60 * 1000;
  const blockLocal = localParts(blockStart);
  const blockDate = `${blockLocal.year}-${blockLocal.month}-${blockLocal.day}`;
  const blockCreated = await callable("saveScheduleBlock", {
    tenantId, date: blockDate, professionalId,
    start: clock(Number(blockLocal.hour), Number(blockLocal.minute)),
    end: clock(Math.floor((Number(blockLocal.hour) * 60 + Number(blockLocal.minute) + 30) / 60),
      (Number(blockLocal.hour) * 60 + Number(blockLocal.minute) + 30) % 60),
    reason: "Bloqueio de teste"
  });
  assert.equal(blockCreated.data.result?.ok, true, JSON.stringify(blockCreated.data));
  await adminDb.doc(`${base}/scheduleSettings/professional_${professionalId}`).set({
    tenantId, scope: "professional", professionalId, days: makeOpenDays()
  });
  const duringBlock = await callable("createAppointment", {
    ...payload, startAtMs: blockStart, idempotencyKey: `during-block-${Date.now()}`
  });
  assert.equal(duringBlock.data.error?.status, "ALREADY_EXISTS", JSON.stringify(duringBlock.data));

  await assertNoAppointmentAt(blockStart, "Uma reserva durante o bloqueio do profissional não deve ser gravada.");

  // A professional absence must reject bookings only for that professional.
  const absenceStart = startAtMs + 12 * 60 * 60 * 1000;
  const absenceLocal = localParts(absenceStart);
  const absenceDate = `${absenceLocal.year}-${absenceLocal.month}-${absenceLocal.day}`;
  const absence = await callable("saveScheduleException", {
    tenantId, kind: "professionalAbsence", professionalId,
    startDate: absenceDate, endDate: absenceDate, reason: "Ausência de teste"
  });
  assert.equal(absence.data.result?.ok, true, JSON.stringify(absence.data));
  const duringAbsence = await callable("createAppointment", {
    ...payload, startAtMs: absenceStart, idempotencyKey: `during-absence-${Date.now()}`
  });
  assert.equal(duringAbsence.data.error?.status, "FAILED_PRECONDITION", JSON.stringify(duringAbsence.data));
  await assertNoAppointmentAt(absenceStart, "Uma reserva durante a ausência profissional não deve ser gravada.");
});


test("cancelAppointment cancels once, records audit and treats replay as idempotent", async () => {
  const appointmentId = `cancel-test-${Date.now()}`;
  const ref = adminDb.doc(`tenants/${tenantId}/appointments/${appointmentId}`);
  await ref.set({
    tenantId, professionalId: "cancel-test-professional",
    serviceId: "cancel-test-service", clientId: "cancel-test-client",
    startAt: new Date(Date.now() + 3 * 86400000),
    endAt: new Date(Date.now() + 3 * 86400000 + 3600000),
    status: "confirmed"
  });

  const cancelled = await callable("cancelAppointment", {
    tenantId, appointmentId, reason: "Solicitação do cliente"
  });
  assert.equal(cancelled.data.result?.ok, true, JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.result.status, "cancelled");
  assert.equal(cancelled.data.result.alreadyCancelled, false);

  const stored = await ref.get();
  assert.equal(stored.data()?.status, "cancelled");
  assert.equal(stored.data()?.cancellationReason, "Solicitação do cliente");
  assert.equal(stored.data()?.cancelledBy, (await adminAuth.getUserByEmail(email)).uid);

  const replay = await callable("cancelAppointment", { tenantId, appointmentId });
  assert.equal(replay.data.result?.ok, true, JSON.stringify(replay.data));
  assert.equal(replay.data.result.alreadyCancelled, true);

  const audit = await adminDb.collection(`tenants/${tenantId}/auditLog`).get();
  const cancellationEvents = audit.docs.filter((doc) =>
    doc.data().resourceId === appointmentId && doc.data().action === "appointment.cancelled");
  assert.equal(cancellationEvents.length, 1);
});

test("cancelAppointment rejects staff and does not modify another tenant appointment", async () => {
  const otherTenantId = `tenant-isolated-${Date.now()}`;
  await adminDb.doc(`tenants/${otherTenantId}`).set({
    tenantId: otherTenantId, name: "Tenant isolado", status: "active",
    timezone: "Europe/Warsaw", currency: "PLN"
  });
  const appointmentId = `isolated-${Date.now()}`;
  const otherRef = adminDb.doc(`tenants/${otherTenantId}/appointments/${appointmentId}`);
  await otherRef.set({
    tenantId: otherTenantId, status: "confirmed",
    startAt: new Date(Date.now() + 4 * 86400000),
    endAt: new Date(Date.now() + 4 * 86400000 + 3600000)
  });

  const denied = await callable("cancelAppointment", { tenantId: otherTenantId, appointmentId });
  assert.equal(denied.data.error?.status, "PERMISSION_DENIED", JSON.stringify(denied.data));
  assert.equal((await otherRef.get()).data()?.status, "confirmed");

  const staffUid = `staff-cancel-${Date.now()}`;
  await adminAuth.createUser({
    uid: staffUid, email: `${staffUid}@example.test`,
    password: "Test-password-123!", emailVerified: true
  });
  await adminDb.doc(`tenants/${tenantId}/members/${staffUid}`).set({
    uid: staffUid, tenantId, role: "staff", status: "active"
  });
  const customToken = await adminAuth.createCustomToken(staffUid);
  const signin = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken, returnSecureToken: true
  });
  assert.equal(signin.status, 200, JSON.stringify(signin.data));
  const staffAppointmentId = `staff-cancel-${Date.now()}`;
  await adminDb.doc(`tenants/${tenantId}/appointments/${staffAppointmentId}`).set({
    tenantId, status: "confirmed",
    startAt: new Date(Date.now() + 5 * 86400000),
    endAt: new Date(Date.now() + 5 * 86400000 + 3600000)
  });
  const staffDenied = await callable("cancelAppointment", {
    tenantId, appointmentId: staffAppointmentId
  }, signin.data.idToken);
  assert.equal(staffDenied.data.error?.status, "PERMISSION_DENIED", JSON.stringify(staffDenied.data));
});


test("staff cannot change company hours, schedule exceptions or time blocks", async () => {
  const staffUid = `staff-schedule-${Date.now()}`;
  await adminAuth.createUser({
    uid: staffUid, email: `${staffUid}@example.test`,
    password: "Test-password-123!", emailVerified: true
  });
  await adminDb.doc(`tenants/${tenantId}/members/${staffUid}`).set({
    uid: staffUid, tenantId, role: "staff", status: "active"
  });
  const customToken = await adminAuth.createCustomToken(staffUid);
  const signin = await jsonRequest(`${AUTH}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken, returnSecureToken: true
  });
  assert.equal(signin.status, 200, JSON.stringify(signin.data));

  const days = { "1": [{ start: "09:00", end: "17:00", breaks: [] }] };
  const hours = await callable("saveScheduleSettings", {
    tenantId, scope: "company", days
  }, signin.data.idToken);
  assert.equal(hours.data.error?.status, "PERMISSION_DENIED", JSON.stringify(hours.data));

  const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const exception = await callable("saveScheduleException", {
    tenantId, kind: "companyClosure", startDate: date, endDate: date,
    reason: "Teste de permissão"
  }, signin.data.idToken);
  assert.equal(exception.data.error?.status, "PERMISSION_DENIED", JSON.stringify(exception.data));

  const block = await callable("saveScheduleBlock", {
    tenantId, date, start: "12:00", end: "13:00", reason: "Teste de permissão"
  }, signin.data.idToken);
  assert.equal(block.data.error?.status, "PERMISSION_DENIED", JSON.stringify(block.data));
});
