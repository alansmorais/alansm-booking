import { createHash } from "node:crypto";
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
