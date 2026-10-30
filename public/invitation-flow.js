(() => {
  "use strict";

  function createInvitationFlow({ auth, workspace } = {}) {
    if (!auth || !workspace ||
        typeof auth.getCurrentUser !== "function" ||
        typeof auth.reloadCurrentUser !== "function" ||
        typeof workspace.acceptInvitation !== "function" ||
        typeof workspace.getSession !== "function") {
      throw new TypeError("Os serviços de autenticação e convites não cumprem o contrato.");
    }

    function validate(input = {}) {
      const tenantId = String(input.tenantId || "").trim();
      const token = String(input.token || "").trim();
      if (!tenantId || tenantId.length > 128 || token.length < 32 || token.length > 128) {
        throw new Error("Link de convite inválido ou incompleto.");
      }
      return { tenantId, token };
    }

    return Object.freeze({
      async accept(input = {}) {
        const invitation = validate(input);
        const current = auth.getCurrentUser();
        if (!current) return { status: "authentication-required" };
        const user = await auth.reloadCurrentUser();
        if (!user) return { status: "authentication-required" };
        if (user.emailVerified !== true) return { status: "verification-required" };
        const result = await workspace.acceptInvitation(invitation);
        const session = await workspace.getSession();
        return { status: "accepted", result, session };
      }
    });
  }

  window.BookingInvitation = Object.freeze({ createInvitationFlow });
})();
