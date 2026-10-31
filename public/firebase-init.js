// Emulator-only Firebase bootstrap. Production Firebase is intentionally unsupported here.
const params = new URLSearchParams(window.location.search);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const enabled = params.get("firebaseEmulator") === "1" &&
  allowedHosts.has(window.location.hostname);

window.BookingFirebaseRuntime = Object.freeze({
  mode: enabled ? "firebase-emulator" : "demo",
  enabled,
  ready: null,
  error: null
});

if (enabled) {
  window.BookingFirebaseRuntime.ready = (async () => {
    const version = "11.0.0";
    const [appSdk, authSdk, firestoreSdk, functionsSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-functions.js`)
    ]);

    const firebaseConfig = {
      apiKey: "demo-api-key-not-a-secret",
      authDomain: "demo-alansm-booking.firebaseapp.com",
      projectId: "demo-alansm-booking",
      appId: "demo-app-id"
    };
    const app = appSdk.initializeApp(firebaseConfig, "alansm-booking-emulator");
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const functions = functionsSdk.getFunctions(app, "us-central1");

    authSdk.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true
    });
    firestoreSdk.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    functionsSdk.connectFunctionsEmulator(functions, "127.0.0.1", 5001);

    const runtime = Object.freeze({
      mode: "firebase-emulator",
      enabled: true,
      app,
      auth,
      db,
      functions,
      authSdk,
      firestoreSdk,
      functionsSdk
    });
    window.BookingFirebaseRuntime = runtime;
    return runtime;
  })().catch((error) => {
    window.BookingFirebaseRuntime = Object.freeze({
      mode: "firebase-emulator",
      enabled: true,
      error
    });
    throw error;
  });
}
