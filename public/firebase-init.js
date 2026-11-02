// Firebase Web SDK bootstrap for AlanSM Booking.
// The firebaseConfig values below are kept exactly as supplied by the project owner.
(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyB9fEcMN6Ve5r8GLqu5yilBYSAB7trmVYM",
    authDomain: "gen-lang-client-0623364466.firebaseapp.com",
    projectId: "gen-lang-client-0623364466",
    storageBucket: "gen-lang-client-0623364466.firebasestorage.app",
    messagingSenderId: "25048197899",
    appId: "1:25048197899:web:97f4bffee21d82bbdf100e",
    measurementId: "G-473CVXCTZ1"
  };

  const params = new URLSearchParams(window.location.search);
  const allowedEmulatorHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const useEmulators = params.get("firebaseEmulator") === "1" &&
    allowedEmulatorHosts.has(window.location.hostname);

  const runtime = {
    mode: useEmulators ? "firebase-emulator" : "firebase",
    enabled: true,
    ready: null,
    error: null
  };
  window.BookingFirebaseRuntime = runtime;

  runtime.ready = (async () => {
    const version = "11.0.0";
    const [appSdk, authSdk, firestoreSdk, functionsSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-functions.js`)
    ]);

    // Keep the original Firebase project configuration intact.
    const app = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    // Cloud Functions in functions/src/index.ts are deployed to us-central1.
    const functions = functionsSdk.getFunctions(app, "us-central1");

    if (useEmulators) {
      authSdk.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true
      });
      firestoreSdk.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      functionsSdk.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    }

    const connectedRuntime = Object.freeze({
      mode: useEmulators ? "firebase-emulator" : "firebase",
      enabled: true,
      app,
      auth,
      db,
      functions,
      authSdk,
      firestoreSdk,
      functionsSdk
    });
    window.BookingFirebaseRuntime = connectedRuntime;
    return connectedRuntime;
  })().catch((error) => {
    window.BookingFirebaseRuntime = Object.freeze({
      mode: useEmulators ? "firebase-emulator" : "firebase",
      enabled: true,
      error
    });
    throw error;
  });
})();
