import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/invitation-page.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object, String, URLSearchParams });

test("invitation page recognizes a complete invitation link without exposing its token in display data", () => {
  const parsed = window.BookingInvitationPage.parseInvitationLink(
    "?tenantId=tenant-123&invite=" + "x".repeat(48)
  );
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.tenantId, "tenant-123");
  assert.equal(parsed.token.length, 48);
});

test("invitation page distinguishes no invitation from malformed invitation links", () => {
  assert.equal(window.BookingInvitationPage.parseInvitationLink("").status, "none");
  assert.equal(window.BookingInvitationPage.parseInvitationLink("?tenantId=tenant-1").status, "invalid");
  assert.equal(window.BookingInvitationPage.parseInvitationLink("?invite=short").status, "invalid");
});
