import test, { before } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "demo-alansm-booking";
const AUTH_URL = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTIONS_URL = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

let adminAuth;
let adminDb;

// Company A state
let userAEmail;
let userAToken;
let userAUid;
let tenantAId;
let tenantASlug;
let serviceAId;
let professionalAId;
let appointmentAId;
let publicAppointmentAId;
let publicBookedStartAt;
let publicTargetDateStr;

// Company B state
let userBEmail;
let userBToken;
let userBUid;
let tenantBId;
let tenantBSlug;

async function jsonRequest(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function callable(name, data, token) {
  return jsonRequest(
    `${FUNCTIONS_URL}/${name}`,
    { data },
    token ? { authorization: `Bearer ${token}` } : {}
  );
}

before(async () => {
  const adminApp = initializeApp({ projectId: PROJECT }, "e2e-12-steps-suite");
  adminAuth = getAuth(adminApp);
  adminDb = getFirestore(adminApp);
});

test("Passo 1: Criar conta (Auth)", async () => {
  userAEmail = `e2e-owner-${Date.now()}@example.test`;
  const signup = await jsonRequest(`${AUTH_URL}/accounts:signUp?key=fake-api-key`, {
    email: userAEmail,
    password: "Password123!",
    returnSecureToken: true
  });
  assert.equal(signup.status, 200, "User creation must succeed");
  assert.ok(signup.data.idToken, "ID token must be returned");
  assert.ok(signup.data.localId, "UID must be returned");
  userAUid = signup.data.localId;

  // Mark email as verified in Auth emulator to allow tenant creation
  await adminAuth.updateUser(userAUid, { emailVerified: true });

  // Refresh token with verified status
  const customToken = await adminAuth.createCustomToken(userAUid);
  const signin = await jsonRequest(`${AUTH_URL}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customToken,
    returnSecureToken: true
  });
  assert.equal(signin.status, 200);
  userAToken = signin.data.idToken;
  console.log("  ✓ Passo 1 concluído: Conta criada com sucesso para", userAEmail);
});

test("Passo 2: Criar empresa (Tenant)", async () => {
  tenantASlug = `barbearia-e2e-${Date.now()}`;
  const res = await callable("createTenant", {
    name: "Barbearia E2E Prime",
    slug: tenantASlug,
    timezone: "UTC",
    currency: "BRL"
  }, userAToken);

  assert.equal(res.status, 200);
  assert.equal(res.data.result?.ok, true, JSON.stringify(res.data));
  assert.equal(res.data.result.tenant.name, "Barbearia E2E Prime");
  assert.equal(res.data.result.tenant.role, "owner");
  tenantAId = res.data.result.tenant.tenantId;
  assert.ok(tenantAId, "tenantId must be present");
  console.log("  ✓ Passo 2 concluído: Empresa criada com tenantId =", tenantAId, "e slug =", tenantASlug);
});

test("Passo 3: Cadastrar serviço", async () => {
  const res = await callable("saveCatalogItem", {
    tenantId: tenantAId,
    kind: "service",
    itemId: "",
    name: "Corte Executivo E2E",
    durationMinutes: 45,
    priceMinor: 6500,
    currency: "BRL"
  }, userAToken);

  assert.equal(res.status, 200);
  assert.equal(res.data.result?.ok, true, JSON.stringify(res.data));
  serviceAId = res.data.result.itemId;
  assert.ok(serviceAId, "Service ID must be returned");
  assert.equal(res.data.result.status, "active");
  console.log("  ✓ Passo 3 concluído: Serviço cadastrado com ID =", serviceAId);
});

test("Passo 4: Cadastrar profissional", async () => {
  const res = await callable("saveCatalogItem", {
    tenantId: tenantAId,
    kind: "professional",
    itemId: "",
    name: "Carlos Barbeiro E2E",
    color: "#2563EB"
  }, userAToken);

  assert.equal(res.status, 200);
  assert.equal(res.data.result?.ok, true, JSON.stringify(res.data));
  professionalAId = res.data.result.itemId;
  assert.ok(professionalAId, "Professional ID must be returned");
  assert.equal(res.data.result.status, "active");
  console.log("  ✓ Passo 4 concluído: Profissional cadastrado com ID =", professionalAId);
});

test("Passo 5: Configurar horário de funcionamento e pausas", async () => {
  // Weekly hours: 7 days open 08:00 - 20:00 with lunch break 12:00 - 13:00
  const days = Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [
      String(day),
      [{ start: "08:00", end: "20:00", breaks: [{ start: "12:00", end: "13:00" }] }]
    ])
  );

  // 1. Save company weekly schedule
  const compRes = await callable("saveScheduleSettings", {
    tenantId: tenantAId,
    scope: "company",
    days
  }, userAToken);
  assert.equal(compRes.status, 200);
  assert.equal(compRes.data.result?.ok, true, JSON.stringify(compRes.data));

  // 2. Save professional individual schedule
  const proRes = await callable("saveScheduleSettings", {
    tenantId: tenantAId,
    scope: "professional",
    professionalId: professionalAId,
    days
  }, userAToken);
  assert.equal(proRes.status, 200);
  assert.equal(proRes.data.result?.ok, true, JSON.stringify(proRes.data));

  // 3. Read back to confirm persistence
  const check = await callable("getScheduleSettings", { tenantId: tenantAId }, userAToken);
  assert.equal(check.status, 200);
  assert.equal(check.data.result?.ok, true);
  assert.equal(check.data.result.companySchedule["1"][0].breaks[0].start, "12:00");
  assert.equal(check.data.result.professionalSchedules[professionalAId]["1"][0].breaks[0].start, "12:00");
  console.log("  ✓ Passo 5 concluído: Horários da empresa e do profissional (08h-20h) e pausas (12h-13h) gravados com sucesso.");
});

test("Passo 6: Criar agendamento", async () => {
  // Target a daytime slot 48h ahead at 10:00 UTC (outside lunch break)
  const targetDay = new Date(Date.now() + 48 * 3600 * 1000);
  targetDay.setUTCHours(10, 0, 0, 0);
  const startAtMs = targetDay.getTime();
  const dateStr = targetDay.toISOString().slice(0, 10);

  // Create client first via saveTenantClient
  const clientRes = await callable("saveTenantClient", {
    tenantId: tenantAId,
    clientId: "",
    name: "Cliente Interno VIP",
    phone: "+5511999990001",
    email: "vip@example.test"
  }, userAToken);
  assert.equal(clientRes.data.result?.ok, true, JSON.stringify(clientRes.data));
  const clientId = clientRes.data.result.clientId;

  const res = await callable("createAppointment", {
    tenantId: tenantAId,
    professionalId: professionalAId,
    serviceId: serviceAId,
    clientId,
    startAtMs,
    idempotencyKey: `internal-appt-${Date.now()}`,
    notes: "Agendamento pelo painel administrativo"
  }, userAToken);

  assert.equal(res.status, 200);
  assert.equal(res.data.result?.ok, true, JSON.stringify(res.data));
  appointmentAId = res.data.result.appointmentId;
  assert.ok(appointmentAId, "Appointment ID must be returned");
  assert.equal(res.data.result.replayed, false);
  console.log("  ✓ Passo 6 concluído: Agendamento interno criado com ID =", appointmentAId, "para", dateStr, "às 10:00 UTC");
});

test("Passo 7: Consultar a agenda", async () => {
  const startAtMs = Date.now() - 7 * 86400000;
  const endAtMs = Date.now() + 21 * 86400000;

  const res = await callable("getAgendaAppointments", {
    tenantId: tenantAId,
    startAtMs,
    endAtMs
  }, userAToken);

  assert.equal(res.status, 200);
  assert.equal(res.data.result?.ok, true, JSON.stringify(res.data));
  const appts = res.data.result.appointments;
  assert.ok(Array.isArray(appts), "Appointments must be an array");
  const found = appts.find(a => a.id === appointmentAId);
  assert.ok(found, "The created appointment must appear in agenda results");
  assert.equal(found.professionalId, professionalAId);
  assert.equal(found.serviceId, serviceAId);
  console.log("  ✓ Passo 7 concluído: Agenda consultada com sucesso (encontrados", appts.length, "agendamentos no período).");
});

test("Passo 8: Cancelar agendamento e alterar status", async () => {
  // 1. Update status to 'confirmed'
  const updateRes = await callable("updateAppointmentStatus", {
    tenantId: tenantAId,
    appointmentId: appointmentAId,
    status: "confirmed"
  }, userAToken);
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.data.result?.ok, true, JSON.stringify(updateRes.data));
  assert.equal(updateRes.data.result.status, "confirmed");

  // 2. Cancel appointment
  const cancelRes = await callable("cancelAppointment", {
    tenantId: tenantAId,
    appointmentId: appointmentAId,
    reason: "Cliente solicitou reagendamento"
  }, userAToken);
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.data.result?.ok, true, JSON.stringify(cancelRes.data));
  assert.equal(cancelRes.data.result.status, "cancelled");
  assert.equal(cancelRes.data.result.alreadyCancelled, false);
  console.log("  ✓ Passo 8 concluído: Status alterado para confirmed e posteriormente cancelado com registro de auditoria.");
});

test("Passo 9: Acessar a página pública de agendamento", async () => {
  const pageRes = await callable("getPublicBookingPage", { slug: tenantASlug }, null);
  assert.equal(pageRes.status, 200);
  assert.equal(pageRes.data.result?.ok, true, JSON.stringify(pageRes.data));
  assert.equal(pageRes.data.result.tenant?.name, "Barbearia E2E Prime");
  assert.ok(pageRes.data.result.services.some(s => s.id === serviceAId), "Service must be listed publicly");
  assert.ok(pageRes.data.result.professionals.some(p => p.id === professionalAId), "Professional must be listed publicly");
  console.log("  ✓ Passo 9 concluído: Página pública carregada sem autenticação para o slug:", tenantASlug);
});

test("Passo 10: Realizar agendamento pela página pública", async () => {
  // Target a daytime slot 72h ahead at 14:00 UTC (after lunch break)
  const targetDay = new Date(Date.now() + 72 * 3600 * 1000);
  targetDay.setUTCHours(14, 0, 0, 0);
  publicBookedStartAt = targetDay.getTime();
  publicTargetDateStr = targetDay.toISOString().slice(0, 10);

  // Check public availability
  const availRes = await callable("getPublicAvailability", {
    slug: tenantASlug,
    serviceId: serviceAId,
    professionalId: professionalAId,
    date: publicTargetDateStr
  }, null);
  assert.equal(availRes.status, 200);
  assert.equal(availRes.data.result?.ok, true, JSON.stringify(availRes.data));
  const freeSlots = (availRes.data.result.slots || []).filter(s => s.available);
  assert.ok(freeSlots.length > 0, "There must be free slots available");

  // Create public booking at 14:00
  const bookRes = await callable("createPublicAppointment", {
    slug: tenantASlug,
    serviceId: serviceAId,
    professionalId: professionalAId,
    startAtMs: publicBookedStartAt,
    idempotencyKey: `public-booking-${Date.now()}`,
    clientName: "Mariana Cliente Online",
    clientPhone: "+5511988887777",
    clientEmail: "mariana.online@example.test",
    notes: "Primeira visita agendada pelo link público"
  }, null);

  assert.equal(bookRes.status, 200);
  assert.equal(bookRes.data.result?.ok, true, JSON.stringify(bookRes.data));
  publicAppointmentAId = bookRes.data.result.appointmentId;
  assert.ok(publicAppointmentAId, "Public appointment ID must be returned");
  assert.equal(bookRes.data.result.replayed, false);
  console.log("  ✓ Passo 10 concluído: Agendamento público realizado com sucesso! ID =", publicAppointmentAId, "para", publicTargetDateStr, "às 14:00 UTC");
});

test("Passo 11: Verificar conflito de horários e bloqueios", async () => {
  // A. Time conflict: Attempting to book the EXACT SAME public slot that was just booked
  const conflictRes = await callable("createPublicAppointment", {
    slug: tenantASlug,
    serviceId: serviceAId,
    professionalId: professionalAId,
    startAtMs: publicBookedStartAt,
    idempotencyKey: `conflict-attempt-${Date.now()}`,
    clientName: "Outro Cliente em Conflito",
    clientPhone: "+5511977776666"
  }, null);

  assert.notEqual(conflictRes.data.result?.ok, true, "Conflicting appointment must be rejected");
  assert.equal(conflictRes.data.error?.status, "ALREADY_EXISTS", "Error should be ALREADY_EXISTS for slot collision");

  // B. Schedule Block conflict: Add a block on publicTargetDateStr from 16:00 to 18:00
  const blockRes = await callable("saveScheduleBlock", {
    tenantId: tenantAId,
    date: publicTargetDateStr,
    start: "16:00",
    end: "18:00",
    reason: "Manutenção do estabelecimento"
  }, userAToken);
  assert.equal(blockRes.status, 200);
  assert.equal(blockRes.data.result?.ok, true);

  // Attempt booking within blocked period (16:30)
  const blockedDay = new Date(publicTargetDateStr + "T16:30:00.000Z");
  const blockedStartAt = blockedDay.getTime();

  const blockedAttempt = await callable("createPublicAppointment", {
    slug: tenantASlug,
    serviceId: serviceAId,
    professionalId: professionalAId,
    startAtMs: blockedStartAt,
    idempotencyKey: `blocked-attempt-${Date.now()}`,
    clientName: "Tentativa no Horário Bloqueado",
    clientPhone: "+5511966665555"
  }, null);

  assert.notEqual(blockedAttempt.data.result?.ok, true, "Booking during block must be rejected");
  assert.equal(blockedAttempt.data.error?.status, "ALREADY_EXISTS", "Blocked slot should return ALREADY_EXISTS (bloqueado)");
  console.log("  ✓ Passo 11 concluído: Conflito de sobreposição e bloqueio de horário rejeitados com sucesso.");
});

test("Passo 12: Testar o isolamento multi-tenant entre empresas distintas", async () => {
  // 1. Create User B and Tenant B
  userBEmail = `e2e-owner-b-${Date.now()}@example.test`;
  const userB = await adminAuth.createUser({
    email: userBEmail,
    password: "Password123!",
    emailVerified: true
  });
  userBUid = userB.uid;
  const customTokenB = await adminAuth.createCustomToken(userBUid);
  const signinB = await jsonRequest(`${AUTH_URL}/accounts:signInWithCustomToken?key=fake-api-key`, {
    token: customTokenB,
    returnSecureToken: true
  });
  userBToken = signinB.data.idToken;

  tenantBSlug = `salao-b-${Date.now()}`;
  const tenantBRes = await callable("createTenant", {
    name: "Salão Beleza B",
    slug: tenantBSlug,
    timezone: "UTC",
    currency: "BRL"
  }, userBToken);
  assert.equal(tenantBRes.data.result?.ok, true);
  tenantBId = tenantBRes.data.result.tenant.tenantId;

  // 2. User B tries to read Tenant A catalog
  const catalogCross = await callable("getTenantCatalog", { tenantId: tenantAId }, userBToken);
  assert.notEqual(catalogCross.data.result?.ok, true, "User B must not read Tenant A catalog");
  assert.equal(catalogCross.data.error?.status, "PERMISSION_DENIED");

  // 3. User B tries to read Tenant A agenda
  const agendaCross = await callable("getAgendaAppointments", {
    tenantId: tenantAId,
    startAtMs: Date.now() - 86400000,
    endAtMs: Date.now() + 86400000
  }, userBToken);
  assert.notEqual(agendaCross.data.result?.ok, true, "User B must not read Tenant A agenda");
  assert.equal(agendaCross.data.error?.status, "PERMISSION_DENIED");

  // 4. User B tries to read Tenant A private clients
  const clientsCross = await callable("getTenantClients", { tenantId: tenantAId }, userBToken);
  assert.notEqual(clientsCross.data.result?.ok, true, "User B must not read Tenant A private clients");
  assert.equal(clientsCross.data.error?.status, "PERMISSION_DENIED");

  // 5. User B tries to modify Tenant A schedule with valid days structure
  const days = {
    "0": [], "1": [{ start: "09:00", end: "18:00", breaks: [] }],
    "2": [], "3": [], "4": [], "5": [], "6": []
  };
  const scheduleCross = await callable("saveScheduleSettings", {
    tenantId: tenantAId,
    scope: "company",
    days
  }, userBToken);
  assert.notEqual(scheduleCross.data.result?.ok, true, "User B must not modify Tenant A schedule");
  assert.equal(scheduleCross.data.error?.status, "PERMISSION_DENIED");

  // 6. User B tries to cancel Tenant A appointment
  const cancelCross = await callable("cancelAppointment", {
    tenantId: tenantAId,
    appointmentId: publicAppointmentAId,
    reason: "Tentativa maliciosa de cancelamento cruzado"
  }, userBToken);
  assert.notEqual(cancelCross.data.result?.ok, true, "User B must not cancel Tenant A appointment");
  assert.equal(cancelCross.data.error?.status, "PERMISSION_DENIED");

  console.log("  ✓ Passo 12 concluído: Isolamento multi-tenant rigorosamente comprovado em catálogo, agenda, clientes, horários e cancelamentos.");
});
