import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/firebase-init.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("Firebase bootstrap preserves the existing ASMAutomatedServices web configuration", () => {
  for (const value of [
    'apiKey: "AIzaSyB9fEcMN6Ve5r8GLqu5yilBYSAB7trmVYM"',
    'authDomain: "gen-lang-client-0623364466.firebaseapp.com"',
    'projectId: "gen-lang-client-0623364466"',
    'storageBucket: "gen-lang-client-0623364466.firebasestorage.app"',
    'messagingSenderId: "25048197899"',
    'appId: "1:25048197899:web:97f4bffee21d82bbdf100e"',
    'measurementId: "G-473CVXCTZ1"'
  ]) assert.ok(source.includes(value), `Missing Firebase config value: ${value}`);
});

test("Firebase bootstrap initializes Auth, Firestore and Cloud Functions", () => {
  for (const value of [
    "firebase-auth.js",
    "firebase-firestore.js",
    "firebase-functions.js",
    "getAuth(app)",
    "getFirestore(app)",
    'getFunctions(app, "us-central1")'
  ]) assert.ok(source.includes(value), `Missing Firebase SDK setup: ${value}`);
});

test("emulators can only be enabled explicitly on local development hosts", () => {
  for (const value of [
    'params.get("firebaseEmulator") === "1"',
    'new Set(["localhost", "127.0.0.1", "::1"])',
    'allowedEmulatorHosts.has(window.location.hostname)',
    'connectAuthEmulator(auth, "http://127.0.0.1:9099"',
    'connectFirestoreEmulator(db, "127.0.0.1", 8080)',
    'connectFunctionsEmulator(functions, "127.0.0.1", 5001)'
  ]) assert.ok(source.includes(value), `Missing emulator guard: ${value}`);
});

test("the app loads the Firebase bootstrap before its authentication UI", () => {
  assert.ok(html.includes('<script src="./firebase-init.js"></script>'));
  assert.ok(html.includes('<script src="./firebase-auth-adapter.js"></script>'));
  assert.ok(html.includes('<script src="./firebase-workspace-adapter.js"></script>'));
  assert.ok(html.indexOf("firebase-init.js") < html.indexOf("auth.js"));
});
