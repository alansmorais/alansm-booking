(() => {
  "use strict";

  function createFirebaseWorkspaceAdapter({ functions, httpsCallable, authAdapter } = {}) {
    if (!functions || typeof httpsCallable !== "function" ||
        !authAdapter || authAdapter.mode !== "firebase") {
      throw new TypeError("Firebase Functions e autenticação válida são obrigatórios.");
    }

    async function invoke(name, payload = {}) {
      const call = httpsCallable(functions, name);
      const response = await call(payload);
      return response.data;
    }

    async function getSession() {
      const user = authAdapter.getCurrentUser();
      if (!user) throw new Error("Faça login para carregar as suas empresas.");
      return invoke("getSession");
    }

    return Object.freeze({
      mode: "firebase",
      async getSession() {
        return getSession();
      },
      async createTenant(input) {
        const user = authAdapter.getCurrentUser();
        if (!user) throw new Error("Faça login para criar uma empresa.");
        if (user.emailVerified !== true) {
          throw new Error("Confirme o seu e-mail antes de criar uma empresa.");
        }
        return invoke("createTenant", input);
      },
      async getCatalog({ tenantId } = {}) {
        if (!tenantId) throw new Error("Selecione uma empresa.");
        return invoke("getTenantCatalog", { tenantId });
      },
      async getAgenda({ tenantId, startAtMs, endAtMs, professionalId = "" } = {}) {
        if (!tenantId) throw new Error("Selecione uma empresa.");
        if (!Number.isSafeInteger(startAtMs) || !Number.isSafeInteger(endAtMs) ||
            endAtMs <= startAtMs) {
          throw new Error("Informe um intervalo válido para a agenda.");
        }
        return invoke("getAgendaAppointments", {
          tenantId, startAtMs, endAtMs, ...(professionalId ? { professionalId } : {})
        });
      }
    });
  }

  window.BookingFirebaseWorkspace = Object.freeze({ createFirebaseWorkspaceAdapter });
})();
