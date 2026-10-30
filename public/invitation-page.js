(() => {
  "use strict";

  function parseInvitationLink(search) {
    const params = new URLSearchParams(String(search || ""));
    const tenantId = String(params.get("tenantId") || "").trim();
    const token = String(params.get("invite") || "").trim();
    if (!tenantId && !token) return { status: "none" };
    if (!tenantId || tenantId.length > 128 || token.length < 32 || token.length > 128) {
      return { status: "invalid" };
    }
    return { status: "ready", tenantId, token };
  }

  function mount({ gate, search, onChooseAccess } = {}) {
    if (!gate || typeof gate.querySelector !== "function") return { status: "none" };
    const invitation = parseInvitationLink(search);
    if (invitation.status === "none") return invitation;

    const panel = document.createElement("section");
    panel.className = "invitation-card";
    panel.setAttribute("aria-live", "polite");
    if (invitation.status === "invalid") {
      panel.innerHTML = "<strong>Link de convite inválido</strong><p>O endereço está incompleto ou expirou. Peça à pessoa administradora para enviar um novo convite.</p>";
    } else {
      panel.innerHTML = "<span class=\"invitation-kicker\">CONVITE PARA A EQUIPA</span><strong>Foi convidado para um espaço de trabalho</strong><p>Entre com o e-mail que recebeu o convite. A empresa confirmará o seu acesso depois da autenticação e da verificação do e-mail.</p><div class=\"invitation-actions\"><button type=\"button\" class=\"primary-btn\" data-invitation-login>Entrar na minha conta</button><button type=\"button\" class=\"secondary-btn\" data-invitation-register>Criar conta</button></div><small>Este preview ainda não aceita convites reais. A ligação será ativada quando a autenticação Firebase for aprovada e configurada.</small>";
      panel.querySelector("[data-invitation-login]").addEventListener("click", () => {
        if (typeof onChooseAccess === "function") onChooseAccess("login");
      });
      panel.querySelector("[data-invitation-register]").addEventListener("click", () => {
        if (typeof onChooseAccess === "function") onChooseAccess("register");
      });
    }
    const tabs = gate.querySelector(".auth-tabs");
    if (tabs) gate.querySelector(".auth-card").insertBefore(panel, tabs);
    else gate.querySelector(".auth-card").appendChild(panel);
    return { status: invitation.status, tenantId: invitation.tenantId || null, token: invitation.token || null };
  }

  window.BookingInvitationPage = Object.freeze({ parseInvitationLink, mount });
})();
