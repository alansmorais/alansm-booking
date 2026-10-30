import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/auth-adapter.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, Error });

test("demo auth adapter never authenticates or stores credentials", async () => {
  const auth = window.BookingAuth.createDemoAdapter();
  assert.equal(auth.mode, "demo");
  assert.equal(auth.isConfigured, false);
  await assert.rejects(auth.signIn(), /não está ligada ao Firebase/);
  await assert.rejects(auth.register(), /não está ligada ao Firebase/);
  assert.equal(await auth.getCurrentUser(), null);
  assert.deepEqual(await auth.signOut(), { signedOut: true, mode: "demo" });
});
