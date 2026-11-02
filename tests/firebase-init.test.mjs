import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/firebase-init.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("Firebase bootstrap preserves the existing ASMAutomatedServices web configuration", () => {
  assert.match(source, /apiKey: "AIzaSyB9fEcMN6Ve5r8GLqu5yilBYSAB7trmVYM"/);
  assert.match(source, /authDomain: "gen-lang-client-0623364466\\.firebaseapp\\.com"/);
  assert.match(source, /projectId: "gen-lang-client-0623364466"/);
  assert.match(source, /storageBucket: "gen-lang-client-0623364466\\.firebasestorage\\.app"/);
  assert.match(source, /messagingSenderId: "25048197899"/);
  assert.match(source, /appId: "1:25048197899:web:97f4bffee21d82bbdf100e"/);
  assert.match(source, /measurementId: "G-473CVXCTZ1"/);
});

test("Firebase bootstrap initializes Auth, Firestore and Cloud Functions", () => {
  assert.match(source, /firebase-auth\\.js/);
  assert.match(source, /firebase-firestore\\.js/);
  assert.match(source, /firebase-functions\\.js/);
  assert.match(source, /getAuth\\(app\\)/);
  assert.match(source, /getFirestore\\(app\\)/);
  assert.match(source, /getFunctions\\(app, "us-central1"\\)/);
});

test("emulators can only be enabled explicitly on local development hosts", () => {
  assert.match(source, /params\\.get\\("firebaseEmulator"\\) === "1"/);
  assert.match(source, /new Set\\(\\["localhost", "127\\.0\\.0\\.1", "::1"\\]\\)/);
  assert.match(source, /allowedEmulatorHosts\\.has\\(window\\.location\\.hostname\\)/);
  assert.match(source, /connectAuthEmulator\\(auth, "http:\\/\\/127\\.0\\.0\\.1:9099"/);
  assert.match(source, /connectFirestoreEmulator\\(db, "127\\.0\\.0\\.1", 8080\\)/);
  assert.match(source, /connectFunctionsEmulator\\(functions, "127\\.0\\.0\\.1", 5001\\)/);
});

test("the app loads the Firebase bootstrap before its authentication UI", () => {
  assert.match(html, /<script src="\\.\\/firebase-init\\.js"><\\/script>/);
  assert.match(html, /<script src="\\.\\/firebase-auth-adapter\\.js"><\\/script>/);
  assert.match(html, /<script src="\\.\\/firebase-workspace-adapter\\.js"><\\/script>/);
  assert.ok(html.indexOf("firebase-init.js") < html.indexOf("auth.js"));
});
