/**
 * Same-origin proxy for the Google Apps Script Web App.
 * Secrets belong in Cloudflare Pages Preview environment variables:
 * GAS_WEB_APP_URL, GAS_API_TOKEN, BOOKING_ADMIN_EMAIL.
 * The browser must never receive GAS_API_TOKEN.
 */
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function onRequestPost({ request, env }) {
  if (!env.GAS_WEB_APP_URL || !env.GAS_API_TOKEN) {
    return Response.json({ ok: false, error: "backend_not_configured" }, { status: 503, headers: JSON_HEADERS });
  }
  let input;
  try { input = await request.json(); }
  catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: JSON_HEADERS }); }
  const action = String(input.action || "");
  const adminActions = ["get_snapshot", "save_snapshot"];
  if (adminActions.includes(action)) {
    const email = request.headers.get("cf-access-authenticated-user-email") || "";
    if (!env.BOOKING_ADMIN_EMAIL || email.toLowerCase() !== String(env.BOOKING_ADMIN_EMAIL).toLowerCase()) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: JSON_HEADERS });
    }
  }
  const allowed = ["health", "get_snapshot", "save_snapshot", "public_catalog", "create_booking"];
  if (!allowed.includes(action)) return Response.json({ ok: false, error: "unsupported_action" }, { status: 400, headers: JSON_HEADERS });
  try {
    const upstream = await fetch(env.GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, token: env.GAS_API_TOKEN })
    });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { return Response.json({ ok: false, error: "invalid_backend_response" }, { status: 502, headers: JSON_HEADERS }); }
    return Response.json(payload, { status: upstream.ok ? 200 : 502, headers: JSON_HEADERS });
  } catch {
    return Response.json({ ok: false, error: "backend_unavailable" }, { status: 502, headers: JSON_HEADERS });
  }
}
