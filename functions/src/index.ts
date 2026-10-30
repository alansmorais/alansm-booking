import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();
const REGION = "us-central1";
const RESERVED_SLUGS = new Set([
  "admin", "administrator", "api", "app", "assets", "auth", "booking",
  "dashboard", "help", "login", "logout", "public", "register", "root",
  "settings", "support", "www"
]);

type CreateTenantInput = {
  name?: unknown;
  slug?: unknown;
  timezone?: unknown;
  currency?: unknown;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizeSlug(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function requireUser(request: { auth?: { uid: string; token: Record<string, unknown> } | undefined }) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  return request.auth;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/**
 * First authenticated onboarding action.
 * The tenant, slug reservation and owner membership are created atomically.
 * Firebase Admin SDK bypasses Firestore Rules, so all authorization and
 * validation is performed here before writing.
 */
export const createTenant = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as CreateTenantInput;

    const name = cleanText(input.name, 80);
    const slug = normalizeSlug(cleanText(input.slug, 80));
    const timezone = cleanText(input.timezone || "America/Sao_Paulo", 80);
    const currency = cleanText(input.currency || "BRL", 3).toUpperCase();

    if (name.length < 2) {
      throw new HttpsError("invalid-argument", "Informe um nome de empresa válido.");
    }
    if (slug.length < 3 || RESERVED_SLUGS.has(slug)) {
      throw new HttpsError("invalid-argument", "Escolha um endereço curto e disponível.");
    }
    if (!validTimezone(timezone)) {
      throw new HttpsError("invalid-argument", "Fuso horário inválido.");
    }
    if (!validCurrency(currency)) {
      throw new HttpsError("invalid-argument", "Moeda inválida.");
    }

    const user = await getAuth().getUser(auth.uid);
    if (user.disabled) {
      throw new HttpsError("permission-denied", "Esta conta está desativada.");
    }
    if (!user.emailVerified) {
      throw new HttpsError("failed-precondition", "Confirme o seu e-mail antes de criar uma empresa.");
    }

    const tenantRef = db.collection("tenants").doc();
    const slugRef = db.collection("tenantSlugs").doc(slug);
    const memberRef = tenantRef.collection("members").doc(auth.uid);
    const now = FieldValue.serverTimestamp();

    try {
      await db.runTransaction(async (tx) => {
        const slugSnapshot = await tx.get(slugRef);
        if (slugSnapshot.exists) {
          throw new HttpsError("already-exists", "Este endereço já está em utilização.");
        }

        tx.create(tenantRef, {
          tenantId: tenantRef.id,
          name,
          slug,
          status: "active",
          planId: "trial",
          timezone,
          currency,
          createdAt: now,
          updatedAt: now
        });

        tx.create(slugRef, {
          tenantId: tenantRef.id,
          createdAt: now
        });

        tx.create(memberRef, {
          uid: auth.uid,
          tenantId: tenantRef.id,
          email: user.email || "",
          displayName: cleanText(user.displayName || "", 80),
          role: "owner",
          status: "active",
          createdAt: now
        });
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Não foi possível criar a empresa. Tente novamente.");
    }

    return {
      ok: true,
      tenant: {
        tenantId: tenantRef.id,
        name,
        slug,
        timezone,
        currency,
        role: "owner"
      }
    };
  }
);

/** Return only memberships belonging to the authenticated user. */
export const getSession = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 20 },
  async (request) => {
    const auth = requireUser(request);
    const user = await getAuth().getUser(auth.uid);
    if (user.disabled) {
      throw new HttpsError("permission-denied", "Esta conta está desativada.");
    }

    const memberships = await db.collectionGroup("members")
      .where("uid", "==", auth.uid)
      .where("status", "==", "active")
      .limit(50)
      .get();

    const tenants = await Promise.all(memberships.docs.map(async (member) => {
      const data = member.data();
      const tenantId = cleanText(data.tenantId, 128);
      if (!tenantId) return null;
      const tenant = await db.collection("tenants").doc(tenantId).get();
      if (!tenant.exists || tenant.data()?.status !== "active") return null;
      const t = tenant.data()!;
      return {
        tenantId,
        name: cleanText(t.name, 80),
        slug: cleanText(t.slug, 40),
        timezone: cleanText(t.timezone, 80),
        currency: cleanText(t.currency, 3),
        role: cleanText(data.role, 20)
      };
    }));

    return {
      ok: true,
      user: {
        uid: auth.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        emailVerified: user.emailVerified
      },
      tenants: tenants.filter(Boolean)
    };
  }
);


type CancelAppointmentInput = {
  tenantId?: unknown;
  appointmentId?: unknown;
  reason?: unknown;
};

/**
 * Owner/admin cancellation scaffold.
 * Tenant access is established from the caller's active membership; the
 * submitted tenantId is only a resource locator, never proof of authorization.
 * Appointment state and its audit event are updated atomically.
 */
export const cancelAppointment = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 20 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as CancelAppointmentInput;
    const tenantId = cleanText(input.tenantId, 128);
    const appointmentId = cleanText(input.appointmentId, 128);
    const reason = cleanText(input.reason, 240);

    if (!tenantId || !appointmentId) {
      throw new HttpsError("invalid-argument", "Empresa e reserva são obrigatórias.");
    }

    const user = await getAuth().getUser(auth.uid);
    if (user.disabled) {
      throw new HttpsError("permission-denied", "Esta conta está desativada.");
    }

    const memberRef = db.doc(`tenants/${tenantId}/members/${auth.uid}`);
    const tenantRef = db.doc(`tenants/${tenantId}`);
    const appointmentRef = db.doc(`tenants/${tenantId}/appointments/${appointmentId}`);
    const auditRef = db.collection(`tenants/${tenantId}/auditLog`).doc();

    return db.runTransaction(async (tx) => {
      const [memberSnap, tenantSnap, appointmentSnap] = await Promise.all([
        tx.get(memberRef),
        tx.get(tenantRef),
        tx.get(appointmentRef)
      ]);

      if (!memberSnap.exists || memberSnap.data()?.status !== "active" ||
          !tenantSnap.exists || tenantSnap.data()?.status !== "active") {
        throw new HttpsError("permission-denied", "Não tem acesso a esta empresa.");
      }

      const role = cleanText(memberSnap.data()?.role, 20);
      if (!["owner", "admin"].includes(role)) {
        throw new HttpsError("permission-denied", "Apenas proprietários e administradores podem cancelar reservas.");
      }
      if (!appointmentSnap.exists) {
        throw new HttpsError("not-found", "Reserva não encontrada.");
      }

      const appointment = appointmentSnap.data()!;
      if (appointment.tenantId !== tenantId) {
        throw new HttpsError("permission-denied", "Reserva inválida para esta empresa.");
      }

      if (appointment.status === "cancelled" || appointment.status === "Cancelado") {
        return { ok: true, appointmentId, status: "cancelled", alreadyCancelled: true };
      }
      if (!["booked", "confirmed", "pending"].includes(appointment.status)) {
        throw new HttpsError("failed-precondition", "Esta reserva não pode ser cancelada neste estado.");
      }

      const now = FieldValue.serverTimestamp();
      tx.update(appointmentRef, {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: auth.uid,
        cancellationReason: reason,
        updatedAt: now
      });
      tx.create(auditRef, {
        tenantId,
        actorUid: auth.uid,
        action: "appointment.cancelled",
        resourceType: "appointment",
        resourceId: appointmentId,
        reason,
        createdAt: now
      });

      return { ok: true, appointmentId, status: "cancelled", alreadyCancelled: false };
    });
  }
);


type CreateAppointmentInput = {
  tenantId?: unknown;
  professionalId?: unknown;
  serviceId?: unknown;
  clientId?: unknown;
  startAtMs?: unknown;
  idempotencyKey?: unknown;
  notes?: unknown;
};

const SLOT_MINUTES = 5;
const MAX_SERVICE_MINUTES = 8 * 60;
const MAX_BOOKING_DAYS_AHEAD = 180;
const ACTIVE_APPOINTMENT_STATUSES = new Set(["pending", "booked", "confirmed"]);

type SchedulePeriod = { start?: unknown; end?: unknown; breaks?: unknown };
function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[getPart("weekday")];
  return {
    date: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    weekday,
    minute: Number(getPart("hour")) * 60 + Number(getPart("minute"))
  };
}
function clockMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
function scheduleCovers(periods: unknown, start: number, end: number): boolean {
  if (!Array.isArray(periods)) return false;
  return periods.some((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const p = raw as SchedulePeriod;
    const pStart = clockMinutes(p.start), pEnd = clockMinutes(p.end);
    if (pStart === null || pEnd === null || pStart >= pEnd || start < pStart || end > pEnd) return false;
    const breaks = Array.isArray(p.breaks) ? p.breaks : [];
    return !breaks.some((b) => {
      if (!b || typeof b !== "object") return false;
      const item = b as { start?: unknown; end?: unknown };
      const bStart = clockMinutes(item.start), bEnd = clockMinutes(item.end);
      return bStart !== null && bEnd !== null && bStart < bEnd && start < bEnd && bStart < end;
    });
  });
}


function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validDocumentId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !value.includes("/");
}

/**
 * Authenticated appointment creation.
 *
 * A per-professional/per-UTC-day guard document serializes booking transactions.
 * Each transaction reads all guard documents for the interval before querying
 * existing appointments and writing. This avoids relying on a range query alone
 * as a concurrency lock. Appointments may span UTC midnight, so both day guards
 * are included. Duration/price come from the service document, never the client.
 *
 * Business opening hours, breaks, leave and date exceptions are deliberately
 * not inferred here; they must be added to this transaction before enabling
 * real bookings.
 */
export const createAppointment = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 30 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as CreateAppointmentInput;
    const tenantId = cleanText(input.tenantId, 128);
    const professionalId = cleanText(input.professionalId, 128);
    const serviceId = cleanText(input.serviceId, 128);
    const clientId = cleanText(input.clientId, 128);
    const idempotencyKey = cleanText(input.idempotencyKey, 128);
    const notes = cleanText(input.notes, 500);
    const startAtMs = input.startAtMs;

    if (!validDocumentId(tenantId) || !validDocumentId(professionalId) ||
        !validDocumentId(serviceId) || !validDocumentId(clientId) ||
        idempotencyKey.length < 8 || idempotencyKey.length > 128 ||
        !Number.isSafeInteger(startAtMs)) {
      throw new HttpsError("invalid-argument", "Dados obrigatórios da reserva inválidos.");
    }

    const startMs = startAtMs as number;
    const nowMs = Date.now();
    const slotMs = SLOT_MINUTES * 60_000;
    if (startMs % slotMs !== 0 || startMs <= nowMs ||
        startMs > nowMs + MAX_BOOKING_DAYS_AHEAD * 86_400_000) {
      throw new HttpsError("invalid-argument", "Escolha um horário futuro válido, em intervalos de cinco minutos.");
    }

    const user = await getAuth().getUser(auth.uid);
    if (user.disabled) {
      throw new HttpsError("permission-denied", "Esta conta está desativada.");
    }

    const tenantRef = db.doc(`tenants/${tenantId}`);
    const memberRef = db.doc(`tenants/${tenantId}/members/${auth.uid}`);
    const serviceRef = db.doc(`tenants/${tenantId}/services/${serviceId}`);
    const professionalRef = db.doc(`tenants/${tenantId}/professionals/${professionalId}`);
    const clientRef = db.doc(`tenants/${tenantId}/clients/${clientId}`);
    const requestHash = sha256(JSON.stringify({
      tenantId, professionalId, serviceId, clientId, startMs, notes
    }));
    const idempotencyRef = db.doc(`tenants/${tenantId}/idempotencyKeys/${sha256(idempotencyKey)}`);
    const appointmentRef = db.collection(`tenants/${tenantId}/appointments`).doc();
    const auditRef = db.collection(`tenants/${tenantId}/auditLog`).doc();

    return db.runTransaction(async (tx) => {
      const [tenantSnap, memberSnap, serviceSnap, professionalSnap, clientSnap, idemSnap] =
        await Promise.all([
          tx.get(tenantRef), tx.get(memberRef), tx.get(serviceRef),
          tx.get(professionalRef), tx.get(clientRef), tx.get(idempotencyRef)
        ]);

      if (!tenantSnap.exists || tenantSnap.data()?.status !== "active" ||
          !memberSnap.exists || memberSnap.data()?.status !== "active") {
        throw new HttpsError("permission-denied", "Não tem acesso a esta empresa.");
      }
      const role = cleanText(memberSnap.data()?.role, 20);
      if (!["owner", "admin", "staff"].includes(role)) {
        throw new HttpsError("permission-denied", "Não tem permissão para criar reservas.");
      }
      if (!serviceSnap.exists || serviceSnap.data()?.status !== "active" ||
          !professionalSnap.exists || professionalSnap.data()?.status !== "active" ||
          !clientSnap.exists) {
        throw new HttpsError("failed-precondition", "Profissional, serviço ou cliente indisponível.");
      }

      if (idemSnap.exists) {
        const saved = idemSnap.data()!;
        if (saved.requestHash !== requestHash) {
          throw new HttpsError("already-exists", "Esta chave de operação já foi utilizada com outros dados.");
        }
        return { ok: true, appointmentId: saved.appointmentId, replayed: true };
      }

      const service = serviceSnap.data()!;
      const duration = service.durationMinutes;
      const priceMinor = service.priceMinor;
      const currency = cleanText(service.currency, 3);
      if (!Number.isInteger(duration) || duration < SLOT_MINUTES ||
          duration > MAX_SERVICE_MINUTES || duration % SLOT_MINUTES !== 0 ||
          !Number.isSafeInteger(priceMinor) || priceMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
        throw new HttpsError("failed-precondition", "O serviço tem duração ou preço inválido.");
      }

      const endMs = startMs + duration * 60_000;
      const startAt = new Date(startMs);
      const endAt = new Date(endMs);
      const dayMs = 86_400_000;
      const firstDay = Math.floor(startMs / dayMs);
      const lastDay = Math.floor((endMs - 1) / dayMs);
      const guardRefs = [];
      for (let day = firstDay; day <= lastDay; day++) {
        guardRefs.push(db.doc(`tenants/${tenantId}/bookingGuards/${sha256(professionalId).slice(0, 24)}_${day}`));
      }

      const guardSnaps = await Promise.all(guardRefs.map((ref) => tx.get(ref)));

      const timezone = cleanText(tenantSnap.data()?.timezone, 80);
      if (!validTimezone(timezone)) {
        throw new HttpsError("failed-precondition", "A empresa precisa de um fuso horário válido.");
      }
      const localStart = localDateParts(startAt, timezone);
      const localEnd = localDateParts(new Date(endMs - 1), timezone);
      if (localStart.date !== localEnd.date || !Number.isInteger(localStart.weekday)) {
        throw new HttpsError("failed-precondition", "Reservas que atravessam a meia-noite local ainda não são suportadas.");
      }

      const companyScheduleRef = db.doc(`tenants/${tenantId}/scheduleSettings/company`);
      const professionalScheduleRef = db.doc(`tenants/${tenantId}/scheduleSettings/professional_${professionalId}`);
      const companyExceptionRef = db.doc(`tenants/${tenantId}/scheduleExceptions/${localStart.date}`);
      const professionalExceptionRef = db.doc(`tenants/${tenantId}/professionalExceptions/${professionalId}_${localStart.date}`);
      const blocksQuery = db.collection(`tenants/${tenantId}/blocks`).where("date", "==", localStart.date);
      const [companyScheduleSnap, professionalScheduleSnap, companyExceptionSnap,
        professionalExceptionSnap, blocksSnap] = await Promise.all([
        tx.get(companyScheduleRef), tx.get(professionalScheduleRef),
        tx.get(companyExceptionRef), tx.get(professionalExceptionRef), tx.get(blocksQuery)
      ]);

      if (companyExceptionSnap.exists || professionalExceptionSnap.exists) {
        throw new HttpsError("failed-precondition", "A empresa ou o profissional está indisponível nesta data.");
      }
      const dayKey = String(localStart.weekday);
      const companyPeriods = companyScheduleSnap.data()?.days?.[dayKey];
      const professionalPeriods = professionalScheduleSnap.data()?.days?.[dayKey];
      const localEndMinute = localEnd.minute + 1;
      if (!scheduleCovers(companyPeriods, localStart.minute, localEndMinute) ||
          !scheduleCovers(professionalPeriods, localStart.minute, localEndMinute)) {
        throw new HttpsError("failed-precondition", "O horário está fora do funcionamento da empresa ou do profissional, ou inclui uma pausa.");
      }

      const blocked = blocksSnap.docs.some((doc) => {
        const block = doc.data();
        if (block.professionalId && block.professionalId !== professionalId) return false;
        const blockStart = clockMinutes(block.start);
        const blockEnd = clockMinutes(block.end);
        return blockStart !== null && blockEnd !== null &&
          localStart.minute < blockEnd && blockStart < localEndMinute;
      });
      if (blocked) {
        throw new HttpsError("already-exists", "Este horário está bloqueado.");
      }

      const searchStart = new Date(startMs - MAX_SERVICE_MINUTES * 60_000);
      const searchEnd = new Date(endMs);
      const existingQuery = db.collection(`tenants/${tenantId}/appointments`)
        .where("professionalId", "==", professionalId)
        .where("startAt", ">=", searchStart)
        .where("startAt", "<", searchEnd);
      const existing = await tx.get(existingQuery);

      const conflict = existing.docs.some((doc) => {
        const appointment = doc.data();
        if (!ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) return false;
        const existingStart = appointment.startAt?.toMillis?.();
        const existingEnd = appointment.endAt?.toMillis?.();
        return Number.isFinite(existingStart) && Number.isFinite(existingEnd) &&
          existingStart < endMs && startMs < existingEnd;
      });
      if (conflict) {
        throw new HttpsError("already-exists", "Este horário acabou de ser reservado. Escolha outro horário.");
      }

      const now = FieldValue.serverTimestamp();
      guardRefs.forEach((ref, index) => {
        const current = guardSnaps[index].data()?.revision;
        tx.set(ref, {
          professionalId,
          utcDay: firstDay + index,
          revision: Number.isSafeInteger(current) ? current + 1 : 1,
          updatedAt: now
        }, { merge: true });
      });

      tx.create(appointmentRef, {
        tenantId,
        professionalId,
        serviceId,
        clientId,
        startAt,
        endAt,
        status: "booked",
        priceMinor,
        currency,
        notes,
        idempotencyKeyHash: sha256(idempotencyKey),
        createdBy: auth.uid,
        createdAt: now,
        updatedAt: now
      });
      tx.create(idempotencyRef, {
        requestHash,
        appointmentId: appointmentRef.id,
        createdAt: now
      });
      tx.create(auditRef, {
        tenantId,
        actorUid: auth.uid,
        action: "appointment.created",
        resourceType: "appointment",
        resourceId: appointmentRef.id,
        createdAt: now
      });

      return { ok: true, appointmentId: appointmentRef.id, replayed: false };
    });
  }
);

type ScheduleAdminInput = { tenantId?: unknown; scope?: unknown; professionalId?: unknown; days?: unknown };
async function requireScheduleAdmin(uid: string, tenantId: string) {
  const [user, tenant, member] = await Promise.all([
    getAuth().getUser(uid), db.doc(`tenants/${tenantId}`).get(),
    db.doc(`tenants/${tenantId}/members/${uid}`).get()
  ]);
  if (user.disabled || !tenant.exists || tenant.data()?.status !== "active" ||
      !member.exists || member.data()?.status !== "active") {
    throw new HttpsError("permission-denied", "Não tem acesso a esta empresa.");
  }
  if (!["owner", "admin"].includes(cleanText(member.data()?.role, 20))) {
    throw new HttpsError("permission-denied", "Apenas proprietários e administradores podem alterar horários.");
  }
  return tenant.data()!;
}
function validatePeriods(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 2) return false;
  let lastEnd = -1;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return false;
    const p = raw as { start?: unknown; end?: unknown; breaks?: unknown };
    const start = clockMinutes(p.start), end = clockMinutes(p.end);
    if (start === null || end === null || start >= end || start < lastEnd) return false;
    lastEnd = end;
    const breaks = p.breaks ?? [];
    if (!Array.isArray(breaks) || breaks.length > 4) return false;
    let breakEnd = start;
    for (const rawBreak of breaks) {
      if (!rawBreak || typeof rawBreak !== "object") return false;
      const b = rawBreak as { start?: unknown; end?: unknown };
      const bs = clockMinutes(b.start), be = clockMinutes(b.end);
      if (bs === null || be === null || bs >= be || bs < start || be > end || bs < breakEnd) return false;
      breakEnd = be;
    }
  }
  return true;
}

/** Owner/admin-only weekly schedule update. */
export const saveScheduleSettings = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as ScheduleAdminInput;
    const tenantId = cleanText(input.tenantId, 128);
    const scope = cleanText(input.scope, 20);
    const professionalId = cleanText(input.professionalId, 128);
    if (!validDocumentId(tenantId) || !["company", "professional"].includes(scope) ||
        (scope === "professional" && !validDocumentId(professionalId))) {
      throw new HttpsError("invalid-argument", "Empresa ou profissional inválido.");
    }
    const tenant = await requireScheduleAdmin(auth.uid, tenantId);
    if (scope === "professional" &&
        !(await db.doc(`tenants/${tenantId}/professionals/${professionalId}`).get()).exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }
    if (!input.days || typeof input.days !== "object" || Array.isArray(input.days)) {
      throw new HttpsError("invalid-argument", "Informe os horários da semana.");
    }
    const source = input.days as Record<string, unknown>;
    if (Object.keys(source).some((key) => !/^[0-6]$/.test(key))) {
      throw new HttpsError("invalid-argument", "Os dias da semana devem usar números de 0 a 6.");
    }
    const days: Record<string, unknown> = {};
    for (let day = 0; day <= 6; day++) {
      const periods = source[String(day)] ?? [];
      if (!validatePeriods(periods)) throw new HttpsError("invalid-argument", `Horários inválidos para o dia ${day}.`);
      days[String(day)] = periods;
    }
    const id = scope === "company" ? "company" : `professional_${professionalId}`;
    const ref = db.doc(`tenants/${tenantId}/scheduleSettings/${id}`);
    const audit = db.collection(`tenants/${tenantId}/auditLog`).doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      tx.set(ref, { tenantId, scope, professionalId: scope === "professional" ? professionalId : null,
        timezone: cleanText(tenant.timezone, 80), days, updatedAt: now, updatedBy: auth.uid });
      tx.create(audit, { tenantId, actorUid: auth.uid, action: "schedule.updated",
        resourceType: "schedule", resourceId: id, createdAt: now });
    });
    return { ok: true, scheduleId: id };
  }
);

type ScheduleExceptionInput = { tenantId?: unknown; kind?: unknown; professionalId?: unknown; startDate?: unknown; endDate?: unknown; reason?: unknown };
function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Saves company closures or professional absences, one record per local date. */
export const saveScheduleException = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as ScheduleExceptionInput;
    const tenantId = cleanText(input.tenantId, 128);
    const kind = cleanText(input.kind, 30);
    const professionalId = cleanText(input.professionalId, 128);
    const startDate = input.startDate;
    const endDate = input.endDate ?? input.startDate;
    const reason = cleanText(input.reason, 240);
    if (!validDocumentId(tenantId) || !["companyClosure", "professionalAbsence"].includes(kind) ||
        (kind === "professionalAbsence" && !validDocumentId(professionalId)) ||
        !isLocalDate(startDate) || !isLocalDate(endDate) || endDate < startDate) {
      throw new HttpsError("invalid-argument", "Período de indisponibilidade inválido.");
    }
    const tenant = await requireScheduleAdmin(auth.uid, tenantId);
    if (kind === "professionalAbsence" &&
        !(await db.doc(`tenants/${tenantId}/professionals/${professionalId}`).get()).exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }
    const first = new Date(startDate + "T00:00:00.000Z").getTime();
    const last = new Date(endDate + "T00:00:00.000Z").getTime();
    const count = Math.round((last - first) / 86400000) + 1;
    if (count > 90) throw new HttpsError("invalid-argument", "O período máximo é de 90 dias por operação.");
    const collection = kind === "companyClosure" ? "scheduleExceptions" : "professionalExceptions";
    const records = Array.from({ length: count }, (_, index) => {
      const date = new Date(first + index * 86400000).toISOString().slice(0, 10);
      const id = kind === "companyClosure" ? date : `${professionalId}_${date}`;
      return { date, ref: db.doc(`tenants/${tenantId}/${collection}/${id}`) };
    });
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    for (const record of records) {
      batch.set(record.ref, { tenantId, date: record.date, kind,
        professionalId: kind === "professionalAbsence" ? professionalId : null,
        reason, timezone: cleanText(tenant.timezone, 80), updatedAt: now, updatedBy: auth.uid });
    }
    const audit = db.collection(`tenants/${tenantId}/auditLog`).doc();
    batch.create(audit, { tenantId, actorUid: auth.uid, action: "schedule.exception_saved",
      resourceType: "scheduleException", resourceId: records[0].ref.id, reason, createdAt: now });
    await batch.commit();
    return { ok: true, datesSaved: count };
  }
);

type ScheduleBlockInput = { tenantId?: unknown; blockId?: unknown; date?: unknown; start?: unknown; end?: unknown; professionalId?: unknown; reason?: unknown; remove?: unknown };

/** Owner/admin-only create, update or remove a time block. */
export const saveScheduleBlock = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as ScheduleBlockInput;
    const tenantId = cleanText(input.tenantId, 128);
    const blockId = cleanText(input.blockId, 128);
    const date = input.date;
    const professionalId = cleanText(input.professionalId, 128);
    if (!validDocumentId(tenantId) || !isLocalDate(date)) {
      throw new HttpsError("invalid-argument", "Empresa ou data inválida.");
    }
    await requireScheduleAdmin(auth.uid, tenantId);
    if (input.remove === true) {
      if (!validDocumentId(blockId)) throw new HttpsError("invalid-argument", "Identificador do bloqueio inválido.");
      const ref = db.doc(`tenants/${tenantId}/blocks/${blockId}`);
      const audit = db.collection(`tenants/${tenantId}/auditLog`).doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Bloqueio não encontrado.");
        tx.delete(ref);
        tx.create(audit, { tenantId, actorUid: auth.uid, action: "schedule.block_removed",
          resourceType: "scheduleBlock", resourceId: blockId, createdAt: FieldValue.serverTimestamp() });
      });
      return { ok: true, blockId, removed: true };
    }
    const startMinute = clockMinutes(input.start), endMinute = clockMinutes(input.end);
    if (!validDocumentId(blockId || "new") || startMinute === null || endMinute === null || startMinute >= endMinute) {
      throw new HttpsError("invalid-argument", "Horário do bloqueio inválido.");
    }
    if (professionalId &&
        !(await db.doc(`tenants/${tenantId}/professionals/${professionalId}`).get()).exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }
    const ref = blockId ? db.doc(`tenants/${tenantId}/blocks/${blockId}`) :
      db.collection(`tenants/${tenantId}/blocks`).doc();
    const audit = db.collection(`tenants/${tenantId}/auditLog`).doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      if (blockId && !(await tx.get(ref)).exists) throw new HttpsError("not-found", "Bloqueio não encontrado.");
      tx.set(ref, { tenantId, date, start: input.start, end: input.end,
        professionalId: professionalId || null, reason: cleanText(input.reason, 240),
        updatedAt: now, updatedBy: auth.uid, createdAt: now }, { merge: true });
      tx.create(audit, { tenantId, actorUid: auth.uid,
        action: blockId ? "schedule.block_updated" : "schedule.block_created",
        resourceType: "scheduleBlock", resourceId: ref.id, createdAt: now });
    });
    return { ok: true, blockId: ref.id, removed: false };
  }
);


type TenantReadInput = { tenantId?: unknown; startAtMs?: unknown; endAtMs?: unknown; professionalId?: unknown };

/** Shared read authorization: tenantId locates data but never grants access. */
async function requireTenantReader(uid: string, tenantId: string) {
  if (!validDocumentId(tenantId)) throw new HttpsError("invalid-argument", "Empresa inválida.");
  const [user, tenant, member] = await Promise.all([
    getAuth().getUser(uid),
    db.doc(`tenants/${tenantId}`).get(),
    db.doc(`tenants/${tenantId}/members/${uid}`).get()
  ]);
  if (user.disabled || !tenant.exists || tenant.data()?.status !== "active" ||
      !member.exists || member.data()?.status !== "active") {
    throw new HttpsError("permission-denied", "Não tem acesso a esta empresa.");
  }
  const role = cleanText(member.data()?.role, 20);
  if (!["owner", "admin", "staff"].includes(role)) {
    throw new HttpsError("permission-denied", "Não tem permissão para consultar os dados da agenda.");
  }
  return { tenant: tenant.data()!, role };
}

/**
 * Returns a deliberately small catalog for the authenticated tenant.
 * No client records, contact details, credentials or internal billing data are exposed.
 */
export const getTenantCatalog = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 20 },
  async (request) => {
    const auth = requireUser(request);
    const tenantId = cleanText((request.data || {}).tenantId, 128);
    await requireTenantReader(auth.uid, tenantId);

    const [professionals, services] = await Promise.all([
      db.collection(`tenants/${tenantId}/professionals`).where("status", "==", "active").limit(100).get(),
      db.collection(`tenants/${tenantId}/services`).where("status", "==", "active").limit(200).get()
    ]);
    return {
      ok: true,
      professionals: professionals.docs.map((doc) => {
        const value = doc.data();
        return {
          id: doc.id,
          name: cleanText(value.name || value.displayName, 100),
          status: "active",
          ...(typeof value.color === "string" ? { color: cleanText(value.color, 20) } : {})
        };
      }),
      services: services.docs.map((doc) => {
        const value = doc.data();
        return {
          id: doc.id,
          name: cleanText(value.name || value.title, 100),
          status: "active",
          durationMinutes: Number.isInteger(value.durationMinutes) ? value.durationMinutes : null,
          priceMinor: Number.isSafeInteger(value.priceMinor) ? value.priceMinor : null,
          currency: /^[A-Z]{3}$/.test(value.currency) ? value.currency : null
        };
      })
    };
  }
);

/**
 * Bounded tenant agenda read. The client supplies epoch milliseconds for a
 * tenant-local date window resolved by the caller; this endpoint validates a
 * maximum 31-day interval and returns no client PII or free-text notes.
 */
export const getAgendaAppointments = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 20 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as TenantReadInput;
    const tenantId = cleanText(input.tenantId, 128);
    const startAtMs = input.startAtMs;
    const endAtMs = input.endAtMs;
    const professionalId = cleanText(input.professionalId, 128);
    await requireTenantReader(auth.uid, tenantId);

    if (!Number.isSafeInteger(startAtMs) || !Number.isSafeInteger(endAtMs) ||
        (endAtMs as number) <= (startAtMs as number) ||
        (endAtMs as number) - (startAtMs as number) > 31 * 86400000 ||
        (professionalId && !validDocumentId(professionalId))) {
      throw new HttpsError("invalid-argument", "Intervalo da agenda inválido. Consulte no máximo 31 dias.");
    }

    const start = (startAtMs as number) - MAX_SERVICE_MINUTES * 60000;
    const end = endAtMs as number;
    let query: FirebaseFirestore.Query = db.collection(`tenants/${tenantId}/appointments`)
      .where("startAt", ">=", new Date(start))
      .where("startAt", "<", new Date(end))
      .orderBy("startAt", "asc")
      .limit(500);
    if (professionalId) query = query.where("professionalId", "==", professionalId);

    const snapshot = await query.get();
    const appointments = snapshot.docs.flatMap((doc) => {
      const value = doc.data();
      const startMs = value.startAt?.toMillis?.();
      const endMs = value.endAt?.toMillis?.();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) ||
          endMs <= (startAtMs as number) || startMs >= end ||
          !["pending", "booked", "confirmed", "cancelled", "completed", "no_show"].includes(value.status)) {
        return [];
      }
      return [{
        id: doc.id,
        professionalId: cleanText(value.professionalId, 128),
        serviceId: cleanText(value.serviceId, 128),
        clientId: cleanText(value.clientId, 128),
        startAtMs: startMs,
        endAtMs: endMs,
        status: cleanText(value.status, 24),
        priceMinor: Number.isSafeInteger(value.priceMinor) ? value.priceMinor : null,
        currency: /^[A-Z]{3}$/.test(value.currency) ? value.currency : null
      }];
    });
    return { ok: true, appointments, truncated: snapshot.size === 500 };
  }
);


type CreateMemberInvitationInput = { tenantId?: unknown; email?: unknown; role?: unknown };
type AcceptMemberInvitationInput = { tenantId?: unknown; token?: unknown };
type UpdateMemberAccessInput = { tenantId?: unknown; memberUid?: unknown; role?: unknown; status?: unknown };

async function requireTenantManager(uid: string, tenantId: string) {
  const access = await requireTenantReader(uid, tenantId);
  if (!["owner", "admin"].includes(access.role)) {
    throw new HttpsError("permission-denied", "Apenas proprietários e administradores podem gerir membros.");
  }
  return access;
}

/** Create a one-time invitation token. Only its hash is stored; raw token is returned once for sharing. */
export const createMemberInvitation = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as CreateMemberInvitationInput;
    const tenantId = cleanText(input.tenantId, 128);
    const email = cleanText(input.email, 254).toLowerCase();
    const role = cleanText(input.role, 20);
    if (!validDocumentId(tenantId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !["admin", "staff"].includes(role)) {
      throw new HttpsError("invalid-argument", "E-mail, empresa ou função inválidos.");
    }
    await requireTenantManager(auth.uid, tenantId);
    const existingUsers = await getAuth().getUserByEmail(email).catch(() => null);
    if (existingUsers) {
      const existingMember = await db.doc(`tenants/${tenantId}/members/${existingUsers.uid}`).get();
      if (existingMember.exists && existingMember.data()?.status === "active") {
        throw new HttpsError("already-exists", "Este utilizador já pertence à empresa.");
      }
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const invitationRef = db.doc(`tenants/${tenantId}/invitations/${tokenHash}`);
    const now = Date.now();
    await invitationRef.create({
      tenantId, email, role, status: "pending",
      invitedBy: auth.uid,
      expiresAt: new Date(now + 7 * 86400000),
      createdAt: FieldValue.serverTimestamp()
    });
    return {
      ok: true,
      invitationId: tokenHash,
      invitationToken: token,
      expiresAtMs: now + 7 * 86400000,
      delivery: "manual"
    };
  }
);

/** Accept a one-time invitation only when the signed-in, verified email matches. */
export const acceptMemberInvitation = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as AcceptMemberInvitationInput;
    const token = cleanText(input.token, 128);
    if (token.length < 32) throw new HttpsError("invalid-argument", "Convite inválido.");
    const user = await getAuth().getUser(auth.uid);
    if (user.disabled || !user.emailVerified || !user.email) {
      throw new HttpsError("failed-precondition", "Entre com um e-mail confirmado para aceitar o convite.");
    }
    // Tenant ID is supplied only as a locator; the invitation and email are verified transactionally.
    const tenantId = cleanText(input.tenantId, 128);
    if (!validDocumentId(tenantId)) throw new HttpsError("invalid-argument", "Convite inválido.");
    const invitationRef = db.doc(`tenants/${tenantId}/invitations/${sha256(token)}`);
    const memberRef = db.doc(`tenants/${tenantId}/members/${auth.uid}`);
    const tenantRef = db.doc(`tenants/${tenantId}`);
    return db.runTransaction(async (tx) => {
      const [inviteSnap, tenantSnap, memberSnap] = await Promise.all([
        tx.get(invitationRef), tx.get(tenantRef), tx.get(memberRef)
      ]);
      if (!inviteSnap.exists || !tenantSnap.exists || tenantSnap.data()?.status !== "active") {
        throw new HttpsError("not-found", "Convite não encontrado ou empresa indisponível.");
      }
      const invite = inviteSnap.data()!;
      if (invite.status !== "pending" || invite.email !== user.email!.toLowerCase() ||
          !(invite.expiresAt?.toDate?.() instanceof Date) || invite.expiresAt.toDate().getTime() <= Date.now()) {
        throw new HttpsError("failed-precondition", "Convite expirado, utilizado ou destinado a outro e-mail.");
      }
      if (memberSnap.exists && memberSnap.data()?.status === "active") {
        throw new HttpsError("already-exists", "Já tem acesso a esta empresa.");
      }
      tx.set(memberRef, {
        uid: auth.uid, tenantId, email: user.email.toLowerCase(),
        displayName: cleanText(user.displayName || "", 80),
        role: invite.role, status: "active",
        createdAt: FieldValue.serverTimestamp(), invitedBy: invite.invitedBy
      });
      tx.update(invitationRef, {
        status: "accepted", acceptedBy: auth.uid,
        acceptedAt: FieldValue.serverTimestamp()
      });
      const auditRef = db.collection(`tenants/${tenantId}/auditLog`).doc();
      tx.create(auditRef, {
        tenantId, actorUid: auth.uid, action: "member.invitation_accepted",
        resourceType: "member", resourceId: auth.uid, createdAt: FieldValue.serverTimestamp()
      });
      return { ok: true, tenantId, role: invite.role };
    });
  }
);

/** Change or suspend a member; owners cannot be modified through this endpoint. */
export const updateMemberAccess = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const input = (request.data || {}) as UpdateMemberAccessInput;
    const tenantId = cleanText(input.tenantId, 128);
    const memberUid = cleanText(input.memberUid, 128);
    const role = cleanText(input.role, 20);
    const status = cleanText(input.status, 20);
    if (!validDocumentId(tenantId) || !validDocumentId(memberUid) ||
        !["admin", "staff"].includes(role) || !["active", "suspended"].includes(status)) {
      throw new HttpsError("invalid-argument", "Função ou estado do membro inválidos.");
    }
    const manager = await requireTenantManager(auth.uid, tenantId);
    if (manager.role !== "owner" && role === "admin") {
      throw new HttpsError("permission-denied", "Apenas o proprietário pode promover outro administrador.");
    }
    const memberRef = db.doc(`tenants/${tenantId}/members/${memberUid}`);
    const auditRef = db.collection(`tenants/${tenantId}/auditLog`).doc();
    await db.runTransaction(async (tx) => {
      const member = await tx.get(memberRef);
      if (!member.exists || member.data()?.role === "owner") {
        throw new HttpsError("failed-precondition", "O proprietário ou membro não pode ser alterado desta forma.");
      }
      if (manager.role !== "owner" && member.data()?.role === "admin") {
        throw new HttpsError("permission-denied", "Apenas o proprietário pode alterar outro administrador.");
      }
      tx.update(memberRef, { role, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.uid });
      tx.create(auditRef, {
        tenantId, actorUid: auth.uid, action: "member.access_updated",
        resourceType: "member", resourceId: memberUid, role, status,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    return { ok: true, memberUid, role, status };
  }
);


export const getTenantMembers = onCall(
  { region: REGION, enforceAppCheck: false, maxInstances: 10 },
  async (request) => {
    const auth = requireUser(request);
    const tenantId = cleanText((request.data || {}).tenantId, 128);
    await requireTenantManager(auth.uid, tenantId);
    const [members, invitations] = await Promise.all([
      db.collection(`tenants/${tenantId}/members`).limit(100).get(),
      db.collection(`tenants/${tenantId}/invitations`).where("status", "==", "pending").limit(100).get()
    ]);
    return {
      ok: true,
      members: members.docs.map((doc) => {
        const value = doc.data();
        return {
          uid: doc.id, email: cleanText(value.email, 254),
          displayName: cleanText(value.displayName, 80),
          role: cleanText(value.role, 20), status: cleanText(value.status, 20)
        };
      }),
      invitations: invitations.docs.map((doc) => ({
        invitationId: doc.id, email: cleanText(doc.data().email, 254),
        role: cleanText(doc.data().role, 20),
        expiresAtMs: doc.data().expiresAt?.toMillis?.() || null
      }))
    };
  }
);
