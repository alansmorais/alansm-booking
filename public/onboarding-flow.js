(() => {
  "use strict";

  function normalizeSlug(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function createOnboardingFlow({ auth, workspace } = {}) {
    if (!auth || !workspace ||
        typeof auth.register !== "function" ||
        typeof auth.sendEmailVerification !== "function" ||
        typeof auth.reloadCurrentUser !== "function" ||
        typeof workspace.createTenant !== "function" ||
        typeof workspace.getSession !== "function") {
      throw new TypeError("Os serviços de autenticação e espaço de trabalho não cumprem o contrato.");
    }

    return Object.freeze({
      normalizeSlug,
      async registerAndCreateWorkspace(input = {}) {
        const name = String(input.businessName || "").trim();
        const slug = normalizeSlug(input.slug || name);
        if (name.length < 2) throw new Error("Informe um nome de empresa válido.");
        if (slug.length < 3) throw new Error("Escolha um endereço público com pelo menos 3 caracteres.");

        await auth.register({
          email: input.email,
          password: input.password,
          displayName: input.displayName
        });
        await auth.sendEmailVerification();
        const user = await auth.reloadCurrentUser();
        if (!user || user.emailVerified !== true) {
          return { status: "verification-required", tenantCreated: false };
        }

        const tenant = await workspace.createTenant({
          name,
          slug,
          timezone: input.timezone || "America/Sao_Paulo",
          currency: input.currency || "BRL"
        });
        const session = await workspace.getSession();
        return { status: "complete", tenant, session };
      }
    });
  }

  window.BookingOnboarding = Object.freeze({ normalizeSlug, createOnboardingFlow });
})();
