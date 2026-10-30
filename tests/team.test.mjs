import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/team.js", import.meta.url), "utf8");

function createTeam() {
  const listeners = {};
  const content = { innerHTML: "" };
  const document = {
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    getElementById(id) { return id === "content" ? content : null; }
  };
  const localStorage = { getItem() { return null; }, setItem() {} };
  const window = { alert() {} };
  vm.runInNewContext(source, { window, document, localStorage, String, JSON, Date, TypeError });
  return { team: window.BookingTeam, content, listeners };
}

test("team screen stays in local demo mode by default", () => {
  const { team } = createTeam();
  const html = team.render();
  assert.match(html, /MODO DEMONSTRAÇÃO/);
  assert.match(html, /admin@demo.local/);
  assert.match(html, /Nenhum e-mail será enviado/);
});

test("live mode requires an explicitly marked Firebase adapter and tenant", () => {
  const { team } = createTeam();
  assert.throws(() => team.configureLive({ workspaceAdapter: {}, tenantId: "tenant-1" }), /Adaptador Firebase/);
  assert.throws(() => team.configureLive({
    workspaceAdapter: { mode: "firebase", getMembers() {}, inviteMember() {}, updateMember() {} }
  }), /empresa selecionada/);
});

test("explicit live mode loads tenant members and pending invitations", async () => {
  const { team, content } = createTeam();
  const calls = [];
  team.configureLive({
    tenantId: "tenant-42",
    workspaceAdapter: {
      mode: "firebase",
      async getMembers(input) {
        calls.push(input);
        return {
          members: [{ uid: "user-1", displayName: "Maria Souza", email: "maria@example.com", role: "staff", status: "active" }],
          invitations: [{ email: "novo@example.com", role: "admin", expiresAtMs: 1794000000000 }]
        };
      },
      async inviteMember() { return {}; },
      async updateMember() { return {}; }
    }
  });
  await team.mount();
  assert.deepEqual(calls.map(x => x.tenantId), ["tenant-42"]);
  assert.match(content.innerHTML, /BACKEND CONECTADO/);
  assert.match(content.innerHTML, /Maria Souza/);
  assert.match(content.innerHTML, /novo@example.com/);
  assert.match(content.innerHTML, /Suspender/);
  assert.match(content.innerHTML, /Pendente/);
  assert.doesNotMatch(content.innerHTML, /user-owner/);
  team.useDemo();
  assert.match(team.render(), /MODO DEMONSTRAÇÃO/);
});
