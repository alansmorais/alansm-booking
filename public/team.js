(() => {
  "use strict";
  const KEY = "alansm-booking-team-demo-v1";
  const initial = {
    members: [
      { name: "Administrador", email: "admin@demo.local", role: "Proprietário", status: "Ativo" },
      { name: "Rafael Costa", email: "rafael@demo.local", role: "Profissional", status: "Ativo" },
      { name: "Bruno Lima", email: "bruno@demo.local", role: "Profissional", status: "Ativo" }
    ],
    invitations: []
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
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} }
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function render() {
    const rows = data.members.map((m, i) =>
      "<tr><td><strong>" + esc(m.name) + "</strong></td><td>" + esc(m.email) +
      "</td><td>" + esc(m.role) + "</td><td><span class=\"status " +
      (m.status === "Ativo" ? "" : "cancelled") + "\">" + esc(m.status) +
      "</span></td><td>" + (i === 0
        ? "<span class=\"team-muted\">Proprietário</span>"
        : "<button class=\"secondary-btn\" data-team-toggle=\"" + i + "\">" +
          (m.status === "Ativo" ? "Suspender" : "Reativar") + "</button>") +
      "</td></tr>"
    ).join("");
    const invites = data.invitations.map(x =>
      "<tr><td>" + esc(x.email) + "</td><td>" + esc(x.role) +
      "</td><td><span class=\"status pending\">Pendente · simulado</span></td></tr>"
    ).join("");
    return "<div class=\"page-heading\"><div><div class=\"eyebrow\">GESTÃO DA EMPRESA</div>" +
      "<h1>Equipe e acessos</h1><p>Visualize membros e permissões do espaço de trabalho.</p></div>" +
      "<span class=\"demo-pill\">MODO DEMONSTRAÇÃO</span></div>" +
      "<section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Membros da equipa</h2>" +
      "<p>Contas fictícias para pré-visualização.</p></div><span class=\"status\">" +
      data.members.length + " membros</span></div><div class=\"table-wrap\"><table class=\"data-table\">" +
      "<thead><tr><th>MEMBRO</th><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th><th>AÇÃO</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div></section>" +
      "<section class=\"panel team-panel\"><div class=\"panel-heading\"><div><h2>Convidar membro</h2>" +
      "<p>Crie um convite de demonstração. Nenhum e-mail será enviado.</p></div></div>" +
      "<form id=\"teamInviteForm\" class=\"team-invite-form\">" +
      "<label>E-mail<input name=\"email\" type=\"email\" maxlength=\"160\" placeholder=\"pessoa@empresa.com\" required></label>" +
      "<label>Perfil<select name=\"role\"><option value=\"staff\">Equipa (staff)</option>" +
      "<option value=\"admin\">Administrador</option></select></label>" +
      "<button class=\"primary-btn\" type=\"submit\">Criar convite simulado</button></form>" +
      (invites ? "<div class=\"table-wrap\"><table class=\"data-table\"><thead><tr><th>E-MAIL</th><th>PERFIL</th><th>ESTADO</th></tr></thead><tbody>" +
        invites + "</tbody></table></div>" : "<p class=\"empty-state\">Nenhum convite criado.</p>") +
      "</section><div class=\"team-note\"><strong>Importante:</strong> esta interface é apenas uma simulação local. " +
      "Não cria contas, tokens ou permissões Firebase e não envia convites por e-mail. " +
      "A gestão real será ligada às Firebase Functions seguras depois da configuração e aprovação do projeto.</div>";
  }
  document.addEventListener("submit", e => {
    if (e.target.id !== "teamInviteForm") return;
    e.preventDefault();
    const email = e.target.elements.email.value.trim().toLowerCase();
    const role = e.target.elements.role.value === "admin" ? "Administrador" : "Equipa (staff)";
    if (data.members.some(m => m.email.toLowerCase() === email) ||
        data.invitations.some(x => x.email === email)) {
      window.alert("Este e-mail já está na equipa ou tem convite pendente.");
      return;
    }
    data.invitations.push({ email, role, status: "pending" });
    save();
    document.getElementById("content").innerHTML = render();
  });
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-team-toggle]");
    if (!button) return;
    const member = data.members[Number(button.dataset.teamToggle)];
    if (!member || member.role === "Proprietário") return;
    member.status = member.status === "Ativo" ? "Suspenso" : "Ativo";
    save();
    document.getElementById("content").innerHTML = render();
  });
  window.BookingTeam = Object.freeze({ render });
})();