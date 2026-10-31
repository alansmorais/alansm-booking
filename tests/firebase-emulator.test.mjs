import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/firebase-emulator.js", import.meta.url), "utf8");

function loadConfig(search, hostname) {
  const window = { location: { search, hostname } };
  const context = {
    window,
    URLSearchParams,
    Object,
    Promise,
    console: { error() {} },
    document: { createElement() { throw new Error("No scripts should load in config-only tests."); }, head: { appendChild() {} } }
  };
  vm.runInNewContext(source, context);
  return window.BookingFirebaseConfig;
}

test("demo remains the default and does not require Firebase SDK", () => {
  const config = loadConfig("", "localhost");
  assert.equal(config.resolveMode({ search: "", hostname: "localhost" }).mode, "demo");
  assert.equal(config.resolveMode({ search: "?backend=demo", hostname: "localhost" }).mode, "demo");
});

test("Firebase mode requires explicit opt-in on a local hostname", () => {
  const config = loadConfig("?backend=firebase-emulator", "localhost");
  const mode = config.resolveMode({ search: "?backend=firebase-emulator", hostname: "localhost" });
  assert.equal(mode.mode, "firebase-emulator");
  assert.equal(mode.projectId, "demo-alansm-booking");
  assert.equal(mode.emulators.auth.port, 9099);
  assert.equal(mode.emulators.firestore.port, 8080);
  assert.equal(mode.emulators.functions.port, 5001);
});

test("Firebase emulator mode is rejected on preview and production hosts", () => {
  const config = loadConfig("", "localhost");
  for (const hostname of ["preview.alansm-booking-preview.pages.dev", "alansm-booking.com", "example.com"]) {
    assert.throws(
      () => config.resolveMode({ search: "?backend=firebase-emulator", hostname }),
      /só pode ser iniciado em localhost/
    );
  }
});

test("emulator Firebase options contain only the demo project identity", () => {
  const config = loadConfig("", "localhost");
  const options = config.firebaseOptions();
  assert.equal(options.projectId, "demo-alansm-booking");
  assert.equal(options.authDomain, "localhost");
  assert.equal(options.apiKey, "demo-api-key-not-a-secret");
  assert.equal(options.appId, "demo-alansm-booking-app");
});

test("remote Firebase development mode is restricted to the dedicated preview host", () => {
  const config = loadConfig("", "localhost");
  const allowed = config.resolveMode({
    search: "?backend=firebase-development",
    hostname: "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev"
  });
  assert.equal(allowed.mode, "firebase-development");
  assert.equal(allowed.configUrl, "/api/firebase-config");

  for (const hostname of ["localhost", "alansm-booking.com", "alansm-booking-preview.pages.dev", "evil.example"]) {
    assert.throws(
      () => config.resolveMode({ search: "?backend=firebase-development", hostname }),
      /preview autorizado/
    );
  }
});

test("remote Firebase development is never selected by default", () => {
  const config = loadConfig("", "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev");
  assert.equal(config.resolveMode({ search: "", hostname: "firebase-emulator-bootstrap.alansm-booking-preview.pages.dev" }).mode, "demo");
});
