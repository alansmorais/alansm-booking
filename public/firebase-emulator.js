(() => {
  "use strict";

  const PROJECT_ID = "demo-alansm-booking";
  const SDK_VERSION = "11.0.0";
  const PREVIEW_HOST = "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev";
  const EMULATORS = Object.freeze({
    auth: Object.freeze({ host: "127.0.0.1", port: 9099 }),
    firestore: Object.freeze({ host: "127.0.0.1", port: 8080 }),
    functions: Object.freeze({ host: "127.0.0.1", port: 5001 })
  });

  function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  function resolveMode({ search = "", hostname = "" } = {}) {
    const requested = new URLSearchParams(search).get("backend");
    if (requested === "firebase-emulator") {
      if (!isLocalHost(hostname)) {
        throw new Error("O modo Firebase Emulator só pode ser iniciado em localhost. A demonstração permanece isolada.");
      }
      return Object.freeze({ mode: "firebase-emulator", projectId: PROJECT_ID, emulators: EMULATORS });
    }
    if (requested === "firebase-development") {
      if (hostname !== PREVIEW_HOST) {
        throw new Error("Firebase Development só pode ser iniciado no preview autorizado. A demonstração permanece isolada.");
      }
      return Object.freeze({ mode: "firebase-development", configUrl: "/api/firebase-config" });
    }
    return Object.freeze({ mode: "demo", reason: "Firebase was not explicitly requested." });
  }

  function firebaseOptions() {
    return Object.freeze({
      apiKey: "demo-api-key-not-a-secret",
      authDomain: "localhost",
      projectId: PROJECT_ID,
      appId: "demo-alansm-booking-app"
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar o SDK Firebase."));
      document.head.appendChild(script);
    });
  }

  async function loadFirebaseSdk() {
    const base = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/";
    await loadScript(base + "firebase-app-compat.js");
    await loadScript(base + "firebase-auth-compat.js");
    await loadScript(base + "firebase-firestore-compat.js");
    await loadScript(base + "firebase-functions-compat.js");
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      throw new Error("SDK Firebase indisponível.");
    }
  }

  async function initialize() {
    const mode = resolveMode({ search: window.location.search, hostname: window.location.hostname });
    if (mode.mode === "demo") {
      window.BookingFirebaseRuntime = Object.freeze({ mode: "demo", ready: Promise.resolve(null) });
      return;
    }

    document.documentElement.dataset.bookingBackend = mode.mode;
    const modeNotice = document.querySelector(".demo-pill");
    if (modeNotice) modeNotice.textContent = mode.mode === "firebase-emulator"
      ? "EMULADOR LOCAL · PAINEL AINDA EM DEMO"
      : "FIREBASE DEVELOPMENT · AMBIENTE DE TESTE";

    await loadFirebaseSdk();

    let options;
    if (mode.mode === "firebase-emulator") {
      options = firebaseOptions();
    } else {
      const response = await fetch(mode.configUrl, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || payload.environment !== "development" ||
          !payload.config?.projectId || payload.config.projectId === PROJECT_ID) {
        throw new Error(payload?.error || "A configuração remota de desenvolvimento não está disponível. Nenhuma conexão foi iniciada.");
      }
      options = payload.config;
    }

    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(options);
    if (app.options.projectId !== options.projectId) {
      throw new Error("O projeto Firebase já inicializado não corresponde ao ambiente solicitado.");
    }

    const auth = app.auth();
    const firestore = app.firestore();
    const functions = app.functions("us-central1");

    if (mode.mode === "firebase-emulator") {
      auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
      firestore.useEmulator("127.0.0.1", 8080);
      functions.useEmulator("127.0.0.1", 5001);
    }

    window.BookingFirebaseRuntime = Object.freeze({
      mode: mode.mode,
      projectId: options.projectId,
      app,
      auth,
      firestore,
      functions,
      ready: Promise.resolve({ app, auth, firestore, functions })
    });
  }

  window.BookingFirebaseRuntime = Object.freeze({
    mode: "initializing",
    ready: initialize().catch((error) => {
      console.error("[AlanSM Booking] Firebase initialization failed:", error);
      window.BookingFirebaseRuntime = Object.freeze({
        mode: "error",
        error,
        ready: Promise.resolve(null)
      });
      throw error;
    })
  });

  window.BookingFirebaseRuntime.ready.catch(() => {});
  window.BookingFirebaseConfig = Object.freeze({ resolveMode, isLocalHost, firebaseOptions });
})();
