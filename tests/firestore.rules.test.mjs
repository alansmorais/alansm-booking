import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

const projectId = "demo-alansm-booking";
let env;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: "127.0.0.1", port: 8080 }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "tenants", "tenant-a"), { tenantId: "tenant-a", name: "Empresa A", status: "active" });
    await setDoc(doc(db, "tenants", "tenant-a", "members", "owner-a"), { uid: "owner-a", tenantId: "tenant-a", role: "owner", status: "active" });
    await setDoc(doc(db, "tenants", "tenant-a", "members", "inactive-a"), { uid: "inactive-a", tenantId: "tenant-a", role: "staff", status: "inactive" });
    await setDoc(doc(db, "tenants", "tenant-b"), { tenantId: "tenant-b", name: "Empresa B", status: "active" });
    await setDoc(doc(db, "tenants", "tenant-b", "members", "owner-b"), { uid: "owner-b", tenantId: "tenant-b", role: "owner", status: "active" });
    await setDoc(doc(db, "tenants", "tenant-a", "appointments", "appointment-a"), { tenantId: "tenant-a", label: "private", clientId: "client-a", notes: "private notes" });
    await setDoc(doc(db, "tenants", "tenant-a", "clients", "client-a"), { tenantId: "tenant-a", name: "Cliente privado", phone: "+5511999999999" });
    await setDoc(doc(db, "tenants", "tenant-a", "professionals", "professional-a"), { tenantId: "tenant-a", name: "Profissional", email: "private@example.com" });
    await setDoc(doc(db, "tenants", "tenant-a", "services", "service-a"), { tenantId: "tenant-a", name: "Serviço", internalCost: 123 });
    await setDoc(doc(db, "tenants", "tenant-a", "blocks", "block-a"), { tenantId: "tenant-a", reason: "Compromisso privado" });
    await setDoc(doc(db, "tenants", "tenant-a", "scheduleSettings", "company"), { tenantId: "tenant-a", internal: true });
    await setDoc(doc(db, "publicBookingPages", "published"), { published: true, publicName: "Página pública" });
    await setDoc(doc(db, "publicBookingPages", "draft"), { published: false, publicName: "Rascunho" });
  });
});

after(async () => { await env?.cleanup(); });

test("tenant metadata and private operational records require callable APIs", async () => {
  const db = env.authenticatedContext("owner-a").firestore();
  await assertFails(getDoc(doc(db, "tenants", "tenant-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "appointments", "appointment-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "clients", "client-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "professionals", "professional-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "services", "service-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "blocks", "block-a")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "scheduleSettings", "company")));
});

test("member cannot read another tenant or another member's private membership", async () => {
  const db = env.authenticatedContext("owner-a").firestore();
  await assertFails(getDoc(doc(db, "tenants", "tenant-b")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-b", "appointments", "anything")));
  await assertFails(getDoc(doc(db, "tenants", "tenant-a", "members", "inactive-a")));
});

test("inactive and unauthenticated users cannot read tenant data", async () => {
  const inactive = env.authenticatedContext("inactive-a").firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(inactive, "tenants", "tenant-a")));
  await assertFails(getDoc(doc(anonymous, "tenants", "tenant-a")));
});

test("browser-side writes are denied even for owner", async () => {
  const db = env.authenticatedContext("owner-a").firestore();
  await assertFails(setDoc(doc(db, "tenants", "tenant-a", "appointments", "forged"), { tenantId: "tenant-a" }));
  await assertFails(setDoc(doc(db, "tenants", "tenant-a"), { tenantId: "tenant-a", name: "Overwritten" }));
});

test("public pages allow get only when published", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "publicBookingPages", "published")));
  await assertFails(getDoc(doc(db, "publicBookingPages", "draft")));
  await assertFails(getDocs(collection(db, "publicBookingPages")));
});
