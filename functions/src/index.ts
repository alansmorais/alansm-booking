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
