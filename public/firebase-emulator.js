(() => {
  "use strict";

  const PROJECT_ID = "demo-alansm-booking";
  const SDK_VERSION = "11.0.0";
  const EMULATORS = Object.freeze({
    auth: Object.freeze({ host: "127.0.0.1", port: 9099 }),
    firestore: Object.freeze({ host: "127.0.0.1", port: 8080 }),
    functions: Object.freeze({ host: "127.0.0.1", port: 5001 })
  });

  function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  }

  function resolveMode({ search = "", hostname = "" } = {}) {
    const params = new URLSearchParams(search);
    const requested = params.get("backend");
    if (requested !== "firebase-emulator") {
      return Object.freeze({ mode: "demo", reason: "Firebase emulator mode was not explicitly requested." });
    }
    if (!isLocalHost(hostname)) {
      throw new Error("O modo Firebase Emulator só pode ser iniciado em localhost. A demonstração permanece isolada.");
    }
    return Object.freeze({
      mode: "firebase-emulator",
      projectId: PROJECT_ID,
      emulators: EMULATORS
    });
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
      script.onerror = () => reject(new Error("Não foi possível carregar o SDK Firebase para os emuladores."));
      document.head.appendChild(script);
    });
  }

  async function initialize() {
    const mode = resolveMode({ search: window.location.search, hostname: window.location.hostname });
    if (mode.mode === "demo") {
      window.BookingFirebaseRuntime = Object.freeze({ mode: "demo", ready: Promise.resolve(null) });
      return;
    }

    const base = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/";
    await loadScript(base + "firebase-app-compat.js");
    await loadScript(base + "firebase-auth-compat.js");
    await loadScript(base + "firebase-firestore-compat.js");
    await loadScript(base + "firebase-functions-compat.js");

    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      throw new Error("SDK Firebase indisponível.");
    }

    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(firebaseOptions());

    const auth = app.auth();
    const firestore = app.firestore();
    const functions = app.functions();

    auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
    firestore.useEmulator("127.0.0.1", 8080);
    functions.useEmulator("127.0.0.1", 5001);

    window.BookingFirebaseRuntime = Object.freeze({
      mode: "firebase-emulator",
      projectId: PROJECT_ID,
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
      console.error("[AlanSM Booking] Firebase emulator initialization failed:", error);
      window.BookingFirebaseRuntime = Object.freeze({
        mode: "error",
        error,
        ready: Promise.reject(error)
      });
      throw error;
    })
  });

  window.BookingFirebaseRuntime.ready.catch(() => {});
  window.BookingFirebaseConfig = Object.freeze({ resolveMode, isLocalHost, firebaseOptions });
})();
