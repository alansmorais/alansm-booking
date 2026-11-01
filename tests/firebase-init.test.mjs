import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/firebase-init.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("Firebase initialization is opt-in and restricted to local development hosts", () => {
  assert.match(source, /params\.get\("firebaseEmulator"\) === "1"/);
  assert.match(source, /new Set\(\["localhost", "127\.0\.0\.1", "::1"\]\)/);
  assert.match(source, /allowedHosts\.has\(window\.location\.hostname\)/);
  assert.doesNotMatch(source, /https:\/\/[a-z0-9-]+\.firebaseio\.com/);
});

test("Firebase SDK initialization connects Auth, Firestore and Functions to local emulators", () => {
  assert.match(source, /projectId: "demo-alansm-booking"/);
  assert.match(source, /connectAuthEmulator\(auth, "http:\/\/127\.0\.0\.1:9099"/);
  assert.match(source, /connectFirestoreEmulator\(db, "127\.0\.0\.1", 8080\)/);
  assert.match(source, /connectFunctionsEmulator\(functions, "127\.0\.0\.1", 5001\)/);
  assert.match(source, /mode: "firebase-emulator"/);
});

test("the app includes the bootstrap as a module without changing the default demo adapters", () => {
  assert.match(html, /<script src="\.\/firebase-init\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="module" src="\.\/firebase-init\.js">/);
  assert.match(html, /<script src="\.\/auth-adapter\.js"><\/script>/);
  assert.match(html, /<script src="\.\/workspace-adapter\.js"><\/script>/);
});
