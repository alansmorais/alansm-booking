import { createTenant, getSession } from "./onboarding.js";
import { createAppointment } from "./appointments.js";
import { cancelAppointment } from "./cancellations.js";
import { saveScheduleSettings, saveScheduleException, saveScheduleBlock, getScheduleSettings } from "./schedules.js";
import { getTenantCatalog, getAgendaAppointments, getTenantClients, saveTenantClient } from "./tenant-data.js";
import { createMemberInvitation, acceptMemberInvitation, updateMemberAccess, getTenantMembers, saveCatalogItem, updateAppointmentStatus } from "./team-catalog.js";
import { getPublicBookingPage, getPublicAvailability } from "./public-booking.js";
const PROJECT_ID = "gen-lang-client-0623364466";
const FIREBASE_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders }
});

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

let jwksCache;
let jwksExpiresAt = 0;
async function getFirebaseJwks() {
  if (jwksCache && Date.now() < jwksExpiresAt) return jwksCache;
  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("Não foi possível validar a assinatura do token Firebase.");
  const data = await response.json();
  jwksCache = data.keys || [];
  jwksExpiresAt = Date.now() + 50 * 60 * 1000;
  return jwksCache;
}

async function verifyFirebaseIdToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Faça login para continuar.");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Token Firebase inválido.");
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== PROJECT_ID || claims.iss !== FIREBASE_ISSUER ||
      typeof claims.sub !== "string" || !claims.sub ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      claims.auth_time > now + 60) {
    throw new Error("Sessão Firebase inválida ou expirada.");
  }
  const jwk = (await getFirebaseJwks()).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Chave de assinatura Firebase desconhecida.");
  const publicKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, base64UrlToBytes(parts[2]), signed);
  if (!valid) throw new Error("Assinatura do token Firebase inválida.");
  return claims;
}

function pemToArrayBuffer(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return base64UrlToBytes(body.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")).buffer;
}

let googleAccessToken;
let googleAccessTokenExpiresAt = 0;
async function getGoogleAccessToken(env) {
  if (googleAccessToken && Date.now() < googleAccessTokenExpiresAt - 60_000) return googleAccessToken;
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("Backend ainda não configurado: falta a credencial segura do Google.");
  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!account.client_email || !account.private_key) throw new Error("Credencial de serviço inválida.");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({
    iss: account.client_email, scope: FIRESTORE_SCOPE, aud: GOOGLE_TOKEN_URL,
    iat: now, exp: now + 3600
  });
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Não foi possível autenticar o backend no Firestore.");
  googleAccessToken = result.access_token;
  googleAccessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  return googleAccessToken;
}

async function firestoreRequest(env, path, init = {}) {
  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Falha ao consultar o banco de dados.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "https://preview.alansm-booking-preview.pages.dev")
    .split(",").map((item) => item.trim()).filter(Boolean);
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : "null",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type",
    "vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "alansm-booking-api",
        stage: "foundation",
        credentialsConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON)
      }, 200, cors);
    }
    if (url.pathname === "/api/getPublicBookingPage" || url.pathname === "/api/getPublicAvailability") {
      if (request.method !== "POST") return json({ error: { code: "method-not-allowed", message: "Método não permitido." } }, 405, cors);
      try {
        const body = await request.json().catch(() => ({}));
        const result = url.pathname === "/api/getPublicBookingPage"
          ? await getPublicBookingPage(body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) })
          : await getPublicAvailability(body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        return json(result, 200, cors);
      } catch (error) {
        const code = error.code || "internal";
        const status = error.status || (code === "not-found" ? 404 : code === "failed-precondition" ? 412 : code === "invalid-argument" ? 400 : 500);
        return json({ error: { code, message: status >= 500 ? "Não foi possível concluir a consulta. Tente novamente." : error.message } }, status, cors);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      try {
        const authorization = request.headers.get("Authorization") || "";
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        if (!match) return json({ error: { code: "unauthenticated", message: "Faça login para continuar." } }, 401, cors);
        const claims = await verifyFirebaseIdToken(match[1]);
        if (claims.email_verified !== true && url.pathname === "/api/createTenant") {
          return json({ error: { code: "failed-precondition", message: "Confirme o seu e-mail antes de criar uma empresa." } }, 412, cors);
        }
        const authClaims = { ...claims, __idToken: match[1] };
        let result;
        if (request.method !== "POST") return json({ error: { code: "method-not-allowed", message: "Método não permitido." } }, 405, cors);
        const body = await request.json().catch(() => ({}));
        if (url.pathname === "/api/createTenant") result = await createTenant(authClaims, body, {
          ...env,
          getGoogleAccessToken: () => getGoogleAccessToken(env)
        });
        else if (url.pathname === "/api/getSession") result = await getSession(authClaims, {
          ...env,
          getGoogleAccessToken: () => getGoogleAccessToken(env)
        });
        else if (url.pathname === "/api/createAppointment") result = await createAppointment(authClaims, body, {
          ...env,
          getGoogleAccessToken: () => getGoogleAccessToken(env)
        });
        else if (url.pathname === "/api/cancelAppointment") result = await cancelAppointment(authClaims, body, {
          ...env,
          getGoogleAccessToken: () => getGoogleAccessToken(env)
        });
        else if (url.pathname === "/api/saveScheduleSettings") result = await saveScheduleSettings(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/saveScheduleException") result = await saveScheduleException(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/saveScheduleBlock") result = await saveScheduleBlock(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/getScheduleSettings") result = await getScheduleSettings(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/getTenantCatalog") result = await getTenantCatalog(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/getAgendaAppointments") result = await getAgendaAppointments(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/getTenantClients") result = await getTenantClients(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/saveTenantClient") result = await saveTenantClient(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/createMemberInvitation") result = await createMemberInvitation(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/acceptMemberInvitation") result = await acceptMemberInvitation(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/updateMemberAccess") result = await updateMemberAccess(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/getTenantMembers") result = await getTenantMembers(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/saveCatalogItem") result = await saveCatalogItem(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else if (url.pathname === "/api/updateAppointmentStatus") result = await updateAppointmentStatus(authClaims, body, { ...env, getGoogleAccessToken: () => getGoogleAccessToken(env) });
        else return json({ error: { code: "not-implemented", message: "Esta operação ainda está em migração. Nenhum dado foi alterado." } }, 501, cors);
        return json(result, 200, cors);
      } catch (error) {
        const code = error.code || (error.status === 401 ? "unauthenticated" : "internal");
        const status = error.status || (code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : code === "already-exists" ? 409 : code === "failed-precondition" ? 412 : code === "invalid-argument" ? 400 : 500);
        const message = status >= 500 ? "Não foi possível concluir a operação. Tente novamente." : (error.message || "Não foi possível concluir a operação.");
        return json({ error: { code, message } }, status, cors);
      }
    }
    return json({ error: { code: "not-found", message: "Rota não encontrada." } }, 404, cors);
  }
};
