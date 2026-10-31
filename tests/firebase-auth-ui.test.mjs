import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const auth = await readFile(new URL("../public/auth.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("Firebase emulator bootstrap runs before the auth UI", () => {
  assert.ok(html.indexOf('src="./firebase-init.js"') < html.indexOf('src="./auth.js"'));
  assert.match(html, /id="authNoticeText"/);
  assert.match(html, /id="completeVerification"/);
});

test("auth UI uses Firebase adapters only in the explicitly enabled emulator runtime", () => {
  assert.match(auth, /runtime\?\.enabled/);
  assert.match(auth, /createFirebaseAuthAdapter/);
  assert.match(auth, /createFirebaseWorkspaceAdapter/);
  assert.match(auth, /createOnboardingFlow/);
  assert.match(auth, /onAuthStateChanged/);
});

test("registration requires email verification before creating a tenant", () => {
  assert.match(auth, /registerAndCreateWorkspace/);
  assert.match(auth, /completeAfterVerification/);
  assert.match(html, /Já confirmei o meu e-mail/);
  assert.match(auth, /workspace\.createTenant/);
});

test("demo mode remains separate and does not silently authenticate", () => {
  assert.match(auth, /createDemoAdapter/);
  assert.match(html, /Continuar na demonstração local/);
  assert.match(auth, /cadastro e login reais estão desativados/);
});
