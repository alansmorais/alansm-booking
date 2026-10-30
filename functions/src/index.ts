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
