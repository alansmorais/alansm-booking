const PREVIEW_HOST = "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.hostname !== PREVIEW_HOST || request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  const apiKey = String(env.FIREBASE_API_KEY || "").trim();
  const authDomain = String(env.FIREBASE_AUTH_DOMAIN || "").trim();
  const appId = String(env.FIREBASE_APP_ID || "").trim();

  if (env.FIREBASE_ENVIRONMENT !== "development" ||
      !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
      projectId === "demo-alansm-booking" ||
      !apiKey || !authDomain || !appId) {
    return Response.json(
      { ok: false, error: "Firebase Development ainda não foi configurado neste preview." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json({
    ok: true,
    environment: "development",
    config: {
      apiKey,
      authDomain,
      projectId,
      appId,
      ...(env.FIREBASE_MESSAGING_SENDER_ID ? { messagingSenderId: String(env.FIREBASE_MESSAGING_SENDER_ID) } : {})
    }
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin"
    }
  });
}
