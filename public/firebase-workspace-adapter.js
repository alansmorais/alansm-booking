(() => {
  "use strict";

  function createFirebaseWorkspaceAdapter({ functions, httpsCallable, authAdapter } = {}) {
    if (!functions || typeof httpsCallable !== "function" ||
        !authAdapter || authAdapter.mode !== "firebase") {
      throw new TypeError("Firebase Functions e autenticação válida são obrigatórios.");
    }

    let selectedTenantId = null;

    async function invoke(name, payload = {}) {
      const call = httpsCallable(functions, name);
      const response = await call(payload);
      return response.data;
    }

    async function getSession() {
      const user = authAdapter.getCurrentUser();
      if (!user) throw new Error("Faça login para carregar as suas empresas.");
      const session = await invoke("getSession");
      const tenants = Array.isArray(session?.tenants) ? session.tenants : [];
      if (!tenants.some((tenant) => tenant.tenantId === selectedTenantId)) {
        selectedTenantId = tenants.length === 1 ? tenants[0].tenantId : null;
      }
      return { ...session, tenants };
    }

    async function selectTenant(tenantId) {
      const id = String(tenantId || "").trim();
      if (!id) throw new Error("Selecione uma empresa.");
      const session = await getSession();
      const tenant = session.tenants.find((item) => item.tenantId === id);
      if (!tenant) throw new Error("Não tem acesso a esta empresa.");
      selectedTenantId = id;
      return tenant;
    }

    async function requireSelectedTenant(tenantId) {
      const requestedId = String(tenantId || "").trim();
      const session = await getSession();
      if (requestedId && requestedId !== selectedTenantId) {
        if (selectedTenantId) {
          throw new Error("A empresa selecionada mudou. Atualize o espaço de trabalho.");
        }
        const allowed = session.tenants.some((item) => item.tenantId === requestedId);
        if (!allowed) throw new Error("Não tem acesso a esta empresa.");
        selectedTenantId = requestedId;
      }
      if (!selectedTenantId) throw new Error("Selecione uma empresa.");
      if (!session.tenants.some((item) => item.tenantId === selectedTenantId)) {
        selectedTenantId = null;
        throw new Error("Não tem acesso a esta empresa.");
      }
      return selectedTenantId;
    }

    return Object.freeze({
      mode: "firebase",
      async getSession() {
        return getSession();
      },
      async selectTenant(tenantId) {
        return selectTenant(tenantId);
      },
      getSelectedTenantId() {
        return selectedTenantId;
      },
      async createTenant(input) {
        const user = authAdapter.getCurrentUser();
        if (!user) throw new Error("Faça login para criar uma empresa.");
        if (user.emailVerified !== true) {
          throw new Error("Confirme o seu e-mail antes de criar uma empresa.");
        }
        const result = await invoke("createTenant", input);
        const created = result?.tenant;
        if (created?.tenantId) {
          selectedTenantId = created.tenantId;
        }
        return result;
      },
      async acceptInvitation({ tenantId, token } = {}) {
        const id = String(tenantId || "").trim();
        const invitationToken = String(token || "").trim();
        if (!id || id.length > 128) throw new Error("Convite inválido.");
        if (invitationToken.length < 32 || invitationToken.length > 128) {
          throw new Error("Convite inválido.");
        }
        const user = authAdapter.getCurrentUser();
        if (!user) throw new Error("Faça login para aceitar o convite.");
        if (user.emailVerified !== true) {
          throw new Error("Confirme o seu e-mail antes de aceitar o convite.");
        }
        return invoke("acceptMemberInvitation", { tenantId: id, token: invitationToken });
      },
      async getMembers({ tenantId } = {}) {
        const id = await requireSelectedTenant(tenantId);
        return invoke("getTenantMembers", { tenantId: id });
      },
      async inviteMember({ tenantId, email, role } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          throw new Error("Informe um e-mail válido.");
        }
        if (!["admin", "staff"].includes(role)) throw new Error("Perfil de acesso inválido.");
        return invoke("createMemberInvitation", { tenantId: id, email: normalizedEmail, role });
      },
      async updateMember({ tenantId, memberUid, role, status } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const uid = String(memberUid || "").trim();
        if (!uid) throw new Error("Membro inválido.");
        if (!["admin", "staff"].includes(role) || !["active", "suspended"].includes(status)) {
          throw new Error("Perfil ou estado de acesso inválido.");
        }
        return invoke("updateMemberAccess", { tenantId: id, memberUid: uid, role, status });
      },
      async getCatalog({ tenantId } = {}) {
        return invoke("getTenantCatalog", { tenantId: await requireSelectedTenant(tenantId) });
      },
      async getSchedule({ tenantId, startDate, endDate } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const validDate = (value) => typeof value === "string" &&
          /^\\d{4}-\\d{2}-\\d{2}$/.test(value) &&
          Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
          new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
        if (!validDate(startDate) || !validDate(endDate) || endDate < startDate ||
            Date.parse(endDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z") > 90 * 86400000) {
          throw new Error("Informe um período válido de até 90 dias para os horários.");
        }
        return invoke("getTenantSchedule", { tenantId: id, startDate, endDate });
      },
      async getAgenda({ tenantId, startAtMs, endAtMs, professionalId = "" } = {}) {
        const id = await requireSelectedTenant(tenantId);
        if (!Number.isSafeInteger(startAtMs) || !Number.isSafeInteger(endAtMs) ||
            endAtMs <= startAtMs) {
          throw new Error("Informe um intervalo válido para a agenda.");
        }
        return invoke("getAgendaAppointments", {
          tenantId: id, startAtMs, endAtMs, ...(professionalId ? { professionalId } : {})
        });
      }
    });
  }

  window.BookingFirebaseWorkspace = Object.freeze({ createFirebaseWorkspaceAdapter });
})();
