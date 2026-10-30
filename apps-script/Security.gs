/** Security helpers for the Apps Script V8 runtime. */
function requireAuthSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty(BOOKING_CONFIG.PROPERTY_AUTH_SECRET);
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET_KEY_MISSING_OR_TOO_SHORT");
  return secret;
}
function base64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}
function base64UrlDecode_(value) {
  const padded = value + "===".slice((value.length + 3) % 4);
  return Utilities.base64DecodeWebSafe(padded);
}
function hmacBytes_(value, key) {
  return Utilities.computeHmacSha256Signature(value, key);
}
function constantTimeEqual_(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function newId_() { return Utilities.getUuid(); }
function nowIso_() { return new Date().toISOString(); }
function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}
function safeText_(value, maxLength) {
  let text = String(value == null ? "" : value).trim().slice(0, maxLength || 500);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return text;
}
/**
 * PBKDF2-HMAC-SHA256. 12,000 iterations are a conservative bootstrap value
 * for Apps Script; benchmark in the actual GAS runtime before pilot use and
 * increase the work factor where execution limits permit.
 */
function pbkdf2Sha256_(password, saltBytes, iterations) {
  const passwordBytes = Utilities.newBlob(String(password)).getBytes();
  const count = iterations || 12000;
  const blockInput = saltBytes.concat([0, 0, 0, 1]);
  let u = hmacBytes_(blockInput, passwordBytes);
  let derived = u.slice();
  for (let i = 1; i < count; i++) {
    u = hmacBytes_(u, passwordBytes);
    for (let j = 0; j < derived.length; j++) derived[j] = (derived[j] ^ u[j]);
  }
  return derived;
}
function passwordHash_(password, saltB64) {
  const salt = saltB64 ? base64UrlDecode_(saltB64) : Utilities.getUuid().split("-").join("").split("").map(function(c){return parseInt(c,16);});
  const hash = pbkdf2Sha256_(password, salt, 12000);
  return { salt: base64UrlEncode_(salt), hash: base64UrlEncode_(hash), iterations: 12000 };
}
function issueToken_(user) {
  const secret = requireAuthSecret_();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.userId, tid: user.tenantId, role: user.role,
    jti: newId_(), iat: now, exp: now + 60 * 60 * 8
  };
  const header = base64UrlEncode_(Utilities.newBlob(JSON.stringify({alg:"HS256",typ:"JWT"})).getBytes());
  const body = base64UrlEncode_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  const input = header + "." + body;
  const signature = base64UrlEncode_(hmacBytes_(input, secret));
  return { token: input + "." + signature, expiresAt: new Date(payload.exp * 1000).toISOString(), tokenId: payload.jti };
}
function verifyToken_(token) {
  requireAuthSecret_();
  if (typeof token !== "string" || token.length > 4096) throw new Error("INVALID_SESSION");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("INVALID_SESSION");
  const expected = base64UrlEncode_(hmacBytes_(parts[0] + "." + parts[1], requireAuthSecret_()));
  if (!constantTimeEqual_(expected, parts[2])) throw new Error("INVALID_SESSION");
  let payload;
  try { payload = JSON.parse(Utilities.newBlob(base64UrlDecode_(parts[1])).getDataAsString()); }
  catch (err) { throw new Error("INVALID_SESSION"); }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.tid || !payload.jti || !payload.exp || payload.exp <= now) throw new Error("SESSION_EXPIRED");
  if (isTokenRevoked_(payload.jti)) throw new Error("SESSION_REVOKED");
  return payload;
}
