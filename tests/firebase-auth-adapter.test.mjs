import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/firebase-auth-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, TypeError, Error });

test("Firebase auth adapter registers, verifies and refreshes the current user", async () => {
  const calls = [];
  const user = { emailVerified: false, displayName: "" };
  const auth = { currentUser: user };
  const adapter = window.BookingFirebaseAuth.createFirebaseAuthAdapter({
    auth,
    async createUserWithEmailAndPassword(instance, email, password) {
      calls.push(["register", instance === auth, email, password]);
      return { user };
    },
    async signInWithEmailAndPassword() { return { user }; },
    async signOut() { calls.push(["signOut"]); },
    async updateProfile(target, profile) { target.displayName = profile.displayName; },
    async sendEmailVerification(target) { calls.push(["verify", target === user]); },
    async reload(target) { calls.push(["reload", target === user]); target.emailVerified = true; }
  });
  assert.equal(adapter.mode, "firebase");
  await adapter.register({ email: "test@example.com", password: "test-password", displayName: "Test User" });
  await adapter.sendEmailVerification();
  const refreshed = await adapter.reloadCurrentUser();
  assert.equal(refreshed.emailVerified, true);
  assert.equal(refreshed.displayName, "Test User");
  assert.deepEqual(calls.map((item) => item[0]), ["register", "verify", "reload"]);
});

test("Firebase auth adapter rejects incomplete SDK dependencies", () => {
  assert.throws(() => window.BookingFirebaseAuth.createFirebaseAuthAdapter({ auth: {} }), /SDK incompleto/);
});
