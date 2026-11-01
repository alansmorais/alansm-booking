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

test("dashboard switches to tenant-scoped Firebase data after authentication", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /connectFirebaseWorkspace/);
  assert.match(app, /firebaseWorkspaceAdapter\.getCatalog/);
  assert.match(app, /firebaseWorkspaceAdapter\.getAgenda/);
  assert.match(app, /firebaseMode\)\{renderFirebaseView\(\);return;/);
  assert.match(app, /Nenhum dado fictício será exibido aqui/);
  assert.match(app, /Dados carregados do Firebase Emulator/);
});

test("Firebase dashboard reads no more than the backend 31-day appointment window", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /startAtMs:Date\.now\(\)-7\*86400000,endAtMs:Date\.now\(\)\+24\*86400000/);
});

test("Firebase catalog screens expose create edit and deactivate actions", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /id="firebaseServiceForm"/);
  assert.match(app, /id="firebaseProfessionalForm"/);
  assert.match(app, /data-action="edit-catalog"/);
  assert.match(app, /data-action="deactivate-catalog"/);
  assert.match(app, /firebaseWorkspaceAdapter\.saveCatalogItem/);
  assert.match(app, /itemId:String\(values\.get\("itemId"\)\|\|""\)/);
  assert.match(app, /status:"inactive"/);
});

test("Firebase clients screen uses tenant-scoped private client APIs", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /firebaseWorkspaceAdapter\.getClients/);
  assert.match(app, /firebaseWorkspaceAdapter\.saveClient/);
  assert.match(app, /id="firebaseClientForm"/);
  assert.match(app, /data-action="edit-client"/);
  assert.match(app, /data-action="deactivate-client"/);
  assert.match(app, /Dados de contacto privados da empresa/);
});

test("Firebase schedule settings screen exposes company, pro schedules and closures", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /id="firebaseCompanyScheduleForm"/);
  assert.match(app, /id="firebaseProfessionalScheduleForm"/);
  assert.match(app, /id="firebaseCompanyExceptionForm"/);
  assert.match(app, /id="firebaseProExceptionForm"/);
  assert.match(app, /id="firebaseBlockForm"/);
  assert.match(app, /firebaseWorkspaceAdapter\.saveScheduleSettings/);
  assert.match(app, /firebaseWorkspaceAdapter\.saveScheduleException/);
  assert.match(app, /firebaseWorkspaceAdapter\.saveScheduleBlock/);
});

test("Firebase appointment actions support status updates and cancellation", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /data-action="update-appointment-status"/);
  assert.match(app, /data-action="cancel-firebase-appointment"/);
  assert.match(app, /firebaseWorkspaceAdapter\.updateAppointmentStatus/);
  assert.match(app, /firebaseWorkspaceAdapter\.cancelAppointment/);
  assert.match(app, /data-action="new-firebase-appointment"/);
});

test("Public customer booking flow initializes when slug query parameter is present", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /initPublicCustomerBooking/);
  assert.match(app, /id="publicBookingForm"/);
  assert.match(app, /adapter\.getPublicBookingPage/);
  assert.match(app, /adapter\.getPublicAvailability/);
  assert.match(app, /adapter\.createPublicAppointment/);
});

