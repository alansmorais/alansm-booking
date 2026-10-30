(() => {
  "use strict";
  const KEY = "alansm-booking-team-demo-v1";
  const initial = {
    members: [
      { name: "Administrador", email: "admin@demo.local", role: "Proprietário", status: "Ativo" },
      { name: "Rafael Costa", email: "rafael@demo.local", role: "Profissional", status: "Ativo" },
      { name: "Bruno Lima", email: "bruno@demo.local", role: "Profissional", status: "Ativo" }
    ], invitations: []
  };
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && Array.isArray(saved.members) && Array.isArray(saved.invitations)) return saved;
    } catch (_) {}
    return clone(initial);
  }
  let data = load();
  let live = null;
  let liveData = { members: [], invitations: [] };
  let liveBusy = false;
  let liveNotice = "";
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} }
  function esc(value) {
    return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function roleLabel(role) { return role === "owner" ? "Proprietário" : role === "admin" ? "Administrador" : "Equipa"; }
  function statusLabel(status) { return status === "active" ? "Ativo" : "Suspenso"; }
  function renderDemo() {
    const rows = data.members.map((m, i) =>
      "<tr><td><strong>" + esc(m.name) + "</strong></td><td>" + esc(m.email) + "</td><td>" +
      esc(m.role) + "</td><td><span class=\"status " + (m.status === "Ativo" ? "" : "cancelled") +
      "\">" + esc(m.status) + "</span></td><td>" + (i === 0 ? "<span class=\"team-muted\">Proprietário</span>" :
      "<button class=\"secondary-btn\" data-team-toggle=\"" + i + "\">" +
      (m.status === "Ativo" ? "Suspender" : "Reativar") + "</button>") + "</td></tr>").join("");
    const invites = data.invitations.map(x => "<tr><td>" + esc(x.email) + "</td><td>" + esc(x.role) +
      "</td><td><span class=\"status pending\">Pendente · simulado</span></td></tr>").join("");
    return "<div class=\"page-heading\"><div><div class=\"eyebrow\">GESTÃO DA EMPRESA</div><h1>Equipe e acessos</h1>" +
      "<p>Visualize membros e permissões do espaço de trabalho.</p></div><span class=\"demo-pill\">MODO DEMONSTRAÇÃO</span></div>" +
      "<section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Membros da equipa</h2><p>Contas fictícias para pré-visualização.</p></div>" +
      "<span class=\"status\">" + data.members.length + " membros</span></div><div class=\"table-wrap\"><table class=\"data-table\">" +
      "<thead><tr><th>MEMBRO</th><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th><th>AÇÃO</th></tr></thead><tbody>" + rows +
      "</tbody></table></div></section><section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Convidar membro</h2>" +
      "<p>Crie um convite de demonstração. Nenhum e-mail será enviado.</p></div></div><form id=\"teamInviteForm\" class=\"team-invite-form\">" +
      "<label>E-mail<input name=\"email\" type=\"email\" maxlength=\"160\" placeholder=\"pessoa@empresa.com\" required></label>" +
      "<label>Perfil<select name=\"role\"><option value=\"staff\">Equipa (staff)</option><option value=\"admin\">Administrador</option></select></label>" +
      "<button class=\"primary-btn\" type=\"submit\">Criar convite simulado</button></form>" +
      (invites ? "<div class=\"table-wrap\"><table class=\"data-table\"><thead><tr><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th></tr></thead><tbody>" +
      invites + "</tbody></table></div>" : "<p class=\"empty-state\">Nenhum convite criado.</p>") +
      "</section><div class=\"team-note\"><strong>Importante:</strong> esta interface é apenas uma simulação local. Não cria contas, tokens ou permissões Firebase e não envia convites por e-mail. A gestão real continua desativada até a configuração e aprovação do Firebase.</div>";
  }
  function renderLive() {
    const rows = liveData.members.map(m => "<tr><td><strong>" + esc(m.displayName || m.email || "Membro") +
      "</strong></td><td>" + esc(m.email) + "</td><td>" + esc(roleLabel(m.role)) + "</td><td><span class=\"status " +
      (m.status === "active" ? "" : "cancelled") + "\">" + esc(statusLabel(m.status)) + "</span></td><td>" +
      (m.role === "owner" ? "<span class=\"team-muted\">Protegido</span>" :
      "<button class=\"secondary-btn\" data-team-live-toggle=\"" + esc(m.uid) + "\" data-next-status=\"" +
      (m.status === "active" ? "suspended" : "active") + "\">" + (m.status === "active" ? "Suspender" : "Reativar") +
      "</button>") + "</td></tr>").join("");
    const invites = liveData.invitations.map(x => "<tr><td>" + esc(x.email) + "</td><td>" +
      esc(roleLabel(x.role)) + "</td><td><span class=\"status pending\">Pendente</span></td><td>" +
      (x.expiresAtMs ? esc(new Date(x.expiresAtMs).toLocaleDateString("pt-BR")) : "—") + "</td></tr>").join("");
    return "<div class=\"page-heading\"><div><div class=\"eyebrow\">GESTÃO DA EMPRESA</div><h1>Equipe e acessos</h1>" +
      "<p>Membros e convites da empresa selecionada.</p></div><span class=\"demo-pill\">BACKEND CONECTADO</span></div>" +
      (liveNotice ? "<div class=\"team-note\" role=\"status\">" + esc(liveNotice) + "</div>" : "") +
      "<section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Membros da equipa</h2><p>Dados carregados do espaço de trabalho.</p></div>" +
      "<span class=\"status\">" + liveData.members.length + " membros</span></div><div class=\"table-wrap\"><table class=\"data-table\">" +
      "<thead><tr><th>MEMBRO</th><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th><th>AÇÃO</th></tr></thead><tbody>" +
      (rows || "<tr><td colspan=\"5\" class=\"empty-state\">Nenhum membro encontrado.</td></tr>") + "</tbody></table></div></section>" +
      "<section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Convidar membro</h2><p>O convite será criado no backend. O envio automático de e-mail ainda não está configurado.</p></div></div>" +
      "<form id=\"teamLiveInviteForm\" class=\"team-invite-form\"><label>E-mail<input name=\"email\" type=\"email\" maxlength=\"160\" placeholder=\"pessoa@empresa.com\" required></label>" +
      "<label>Perfil<select name=\"role\"><option value=\"staff\">Equipa (staff)</option><option value=\"admin\">Administrador</option></select></label>" +
      "<button class=\"primary-btn\" type=\"submit\">Criar convite</button></form>" +
      (invites ? "<div class=\"table-wrap\"><table class=\"data-table\"><thead><tr><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th><th>EXPIRA</th></tr></thead><tbody>" +
      invites + "</tbody></table></div>" : "<p class=\"empty-state\">Nenhum convite pendente.</p>") +
      "</section><div class=\"team-note\"><strong>Segurança:</strong> as permissões são validadas pelas Firebase Functions. O proprietário não pode ser suspenso. Convites expiram em sete dias e só podem ser aceitos por uma conta com e-mail verificado correspondente.</div>";
  }
  function render() {
    if (!live) return renderDemo();
    if (liveBusy && !liveData.members.length) return "<div class=\"page-heading\"><div><div class=\"eyebrow\">GESTÃO DA EMPRESA</div><h1>Equipe e acessos</h1><p>Carregando membros…</p></div></div>";
    return renderLive();
  }
  async function refresh() {
    if (!live) return;
    liveBusy = true;
    const target = document.getElementById("content");
    if (target) target.innerHTML = render();
    try {
      const result = await live.workspaceAdapter.getMembers({ tenantId: live.tenantId });
      liveData = { members: Array.isArray(result?.members) ? result.members : [],
        invitations: Array.isArray(result?.invitations) ? result.invitations : [] };
      liveNotice = "";
    } catch (error) {
      liveNotice = error?.message || "Não foi possível carregar os membros.";
    } finally {
      liveBusy = false;
      if (target) target.innerHTML = render();
    }
  }
  function configureLive({ workspaceAdapter, tenantId } = {}) {
    if (!workspaceAdapter || workspaceAdapter.mode !== "firebase" ||
        typeof workspaceAdapter.getMembers !== "function" ||
        typeof workspaceAdapter.inviteMember !== "function" ||
        typeof workspaceAdapter.updateMember !== "function" ||
        !String(tenantId || "").trim()) throw new TypeError("Adaptador Firebase e empresa selecionada são obrigatórios.");
    live = { workspaceAdapter, tenantId: String(tenantId).trim() };
    liveData = { members: [], invitations: [] };
    liveNotice = "";
  }
  async function mount() { if (live) await refresh(); }
  document.addEventListener("submit", async e => {
    if (e.target.id === "teamInviteForm" && !live) {
      e.preventDefault();
      const email = e.target.elements.email.value.trim().toLowerCase();
      const role = e.target.elements.role.value === "admin" ? "Administrador" : "Equipa (staff)";
      if (data.members.some(m => m.email.toLowerCase() === email) || data.invitations.some(x => x.email === email)) {
        window.alert("Este e-mail já está na equipa ou tem convite pendente."); return;
      }
      data.invitations.push({ email, role, status: "pending" }); save();
      document.getElementById("content").innerHTML = render(); return;
    }
    if (e.target.id !== "teamLiveInviteForm" || !live) return;
    e.preventDefault();
    const form = e.target;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const result = await live.workspaceAdapter.inviteMember({
        tenantId: live.tenantId, email: form.elements.email.value.trim(), role: form.elements.role.value
      });
      const token = result?.token;
      liveNotice = token
        ? "Convite criado. Copie o token abaixo e compartilhe manualmente com a pessoa convidada. Ele é exibido apenas nesta resposta."
        : "Convite criado. O envio automático de e-mail ainda não está configurado.";
      await refresh();
      if (token) {
        const content = document.getElementById("content");
        const note = document.createElement("div");
        note.className = "team-note";
        note.textContent = "Token de convite (compartilhe em canal privado): " + token;
        content?.prepend(note);
      }
    } catch (error) {
      liveNotice = error?.message || "Não foi possível criar o convite.";
      const content = document.getElementById("content");
      if (content) content.innerHTML = render();
    } finally { submit.disabled = false; }
  });
  document.addEventListener("click", async e => {
    const liveButton = e.target.closest("[data-team-live-toggle]");
    if (liveButton && live) {
      const uid = liveButton.dataset.teamLiveToggle;
      const member = liveData.members.find(item => item.uid === uid);
      if (!member || member.role === "owner") return;
      liveButton.disabled = true;
      try {
        await live.workspaceAdapter.updateMember({
          tenantId: live.tenantId, memberUid: uid,
          role: member.role === "admin" ? "admin" : "staff",
          status: liveButton.dataset.nextStatus
        });
        await refresh();
      } catch (error) {
        liveNotice = error?.message || "Não foi possível atualizar o acesso.";
        const content = document.getElementById("content");
        if (content) content.innerHTML = render();
      }
      return;
    }
    const button = e.target.closest("[data-team-toggle]");
    if (!button || live) return;
    const member = data.members[Number(button.dataset.teamToggle)];
    if (!member || member.role === "Proprietário") return;
    member.status = member.status === "Ativo" ? "Suspenso" : "Ativo";
    save();
    document.getElementById("content").innerHTML = render();
  });
  window.BookingTeam = Object.freeze({ render, mount, configureLive, useDemo() { live = null; liveData = { members: [], invitations: [] }; } });
})();