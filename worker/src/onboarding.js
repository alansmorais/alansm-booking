const PROJECT_ID = "gen-lang-client-0623364466";
const DB_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN_ROOT = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const text = (value, max) => typeof value === "string" ? value.trim().replace(/\\s+/g, " ").slice(0, max) : "";
const slugify = (value) => value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const RESERVED = new Set(["admin","administrator","api","app","assets","auth","booking","dashboard","help","login","logout","public","register","root","settings","support","www"]);
const enc = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k,enc(v)])) } };
};
const dec = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k,dec(x)]));
  return null;
};
const decodeDoc = (doc) => Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k,dec(v)]));
async function firestore(env, path, init = {}) {
  const token = await env.getGoogleAccessToken();
  const endpoint = path.startsWith(":") ? `${DB_ROOT}${path}` : `${DB_ROOT}/${path}`;
  const response = await fetch(endpoint, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(data.error?.message || "Falha no Firestore.");
    e.status = response.status;
    e.firestoreStatus = data.error?.status;
    throw e;
  }
  return data;
}
async function lookupFirebaseUser(claims, env) {
  if (!env.FIREBASE_WEB_API_KEY) throw new Error("Configuração de autenticação indisponível.");
  const response = await fetch(`${TOKEN_ROOT}?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: claims.__idToken })
  });
  const data = await response.json().catch(() => ({}));
  const user = data.users?.[0];
  if (!response.ok || !user || user.localId !== claims.sub) throw new Error("Não foi possível confirmar a conta. Entre novamente.");
  if (user.disabled === true) {
    const e = new Error("Esta conta está desativada."); e.code = "permission-denied"; throw e;
  }
  return user;
}
function fail(code, message, status = 400) {
  const e = new Error(message); e.code = code; e.status = status; return e;
}
function docWrite(name, fields, exists) {
  const write = { update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,enc(v)])) } };
  if (exists !== undefined) write.currentDocument = { exists };
  return write;
}
function serverTimeWrite(name, fields, timestampFields, exists) {
  const write = docWrite(name, fields, exists);
  write.updateTransforms = timestampFields.map(fieldPath => ({ fieldPath, setToServerValue: "REQUEST_TIME" }));
  return write;
}
export async function createTenant(claims, input, env) {
  const name = text(input?.name, 80);
  const slug = slugify(text(input?.slug, 80));
  const timezone = text(input?.timezone || "America/Sao_Paulo", 80);
  const currency = text(input?.currency || "BRL", 10).toUpperCase();
  if (name.length < 2) throw fail("invalid-argument", "Informe um nome de empresa válido.");
  if (slug.length < 3 || RESERVED.has(slug)) throw fail("invalid-argument", "Escolha um endereço curto e disponível.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw fail("invalid-argument", "Fuso horário inválido."); }
  if (!/^[A-Z]{3}$/.test(currency)) throw fail("invalid-argument", "Moeda inválida.");
  const user = await lookupFirebaseUser(claims, env);
  if (user.emailVerified !== true) throw fail("failed-precondition", "Confirme o seu e-mail antes de criar uma empresa.", 412);
  const tenantId = crypto.randomUUID().replace(/-/g, "");
  const uid = claims.sub;
  const tenantName = `${DB_ROOT}/tenants/${tenantId}`;
  const slugName = `${DB_ROOT}/tenantSlugs/${slug}`;
  const memberName = `${tenantName}/members/${uid}`;
  const nowFields = { tenantId, name, slug, status: "active", planId: "trial", timezone, currency };
  const memberFields = { uid, tenantId, email: user.email || "", displayName: text(user.displayName || "", 80), role: "owner", status: "active" };
  try {
    await firestore(env, ":commit", {
      method: "POST",
      body: JSON.stringify({ writes: [
        serverTimeWrite(tenantName, nowFields, ["createdAt","updatedAt"], false),
        serverTimeWrite(slugName, { tenantId }, ["createdAt"], false),
        serverTimeWrite(memberName, memberFields, ["createdAt"], false)
      ] })
    });
  } catch (e) {
    if (e.firestoreStatus === "ALREADY_EXISTS" || e.status === 409 || e.status === 400 && /already exists|ALREADY_EXISTS/i.test(e.message)) {
      throw fail("already-exists", "Este endereço já está em utilização.", 409);
    }
    throw e;
  }
  return { ok: true, tenant: { tenantId, name, slug, timezone, currency, role: "owner" } };
}
export async function getSession(claims, env) {
  const user = await lookupFirebaseUser(claims, env);
  const query = {
    structuredQuery: {
      from: [{ collectionId: "members", allDescendants: true }],
      where: { compositeFilter: { op: "AND", filters: [
        { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: enc(claims.sub) } },
        { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: enc("active") } }
      ] } },
      limit: 50
    }
  };
  const rows = await firestore(env, ":runQuery", { method: "POST", body: JSON.stringify(query) });
  const memberships = (Array.isArray(rows) ? rows : []).map(x => x.document).filter(Boolean).map(doc => ({ path: doc.name, data: decodeDoc(doc) }));
  const tenants = await Promise.all(memberships.map(async (member) => {
    const tenantId = text(member.data.tenantId, 128);
    if (!tenantId) return null;
    try {
      const doc = await firestore(env, `tenants/${encodeURIComponent(tenantId)}`);
      const t = decodeDoc(doc);
      if (t.status !== "active") return null;
      return { tenantId, name: text(t.name,80), slug: text(t.slug,40), timezone: text(t.timezone,80), currency: text(t.currency,3), role: text(member.data.role,20) };
    } catch (e) { if (e.status === 404) return null; throw e; }
  }));
  return { ok: true, user: { uid: claims.sub, email: user.email || null, displayName: user.displayName || null, emailVerified: user.emailVerified === true }, tenants: tenants.filter(Boolean) };
}
