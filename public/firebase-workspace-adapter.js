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
      async getCatalogForManagement({ tenantId } = {}) {
        return invoke("getTenantCatalogForManagement", {
          tenantId: await requireSelectedTenant(tenantId)
        });
      },
      async saveCatalogItem({ tenantId, kind, itemId, name, durationMinutes, priceMinor, currency, color, active } = {}) {
        const id = await requireSelectedTenant(tenantId);
        if (!["service", "professional"].includes(kind)) throw new Error("Tipo de cadastro inválido.");
        const payload = { tenantId: id, kind };
        if (itemId) payload.itemId = String(itemId).trim();
        if (active === false) {
          if (!payload.itemId) throw new Error("Selecione um cadastro para desativar.");
          payload.active = false;
        } else {
          const normalizedName = String(name || "").trim();
          if (normalizedName.length < 2 || normalizedName.length > 100) throw new Error("Informe um nome entre 2 e 100 caracteres.");
          payload.name = normalizedName;
          if (kind === "service") {
            if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || durationMinutes % 15 !== 0) {
              throw new Error("A duração deve ser múltipla de 15 minutos, entre 15 e 480.");
            }
            if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || !/^[A-Z]{3}$/.test(String(currency || ""))) {
              throw new Error("Informe preço em unidades mínimas e uma moeda válida.");
            }
            Object.assign(payload, { durationMinutes, priceMinor, currency });
          } else {
            const normalizedColor = String(color || "#2563EB");
            if (!/^#[0-9a-fA-F]{6}$/.test(normalizedColor)) throw new Error("Cor inválida.");
            payload.color = normalizedColor;
          }
        }
        return invoke("saveTenantCatalogItem", payload);
      },
      async getSchedule({ tenantId, startDate, endDate } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const validDate = (value) => typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
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
      },
      async saveScheduleSettings({ tenantId, scope = "company", professionalId = "", days } = {}) {
        const id = await requireSelectedTenant(tenantId);
        if (!["company", "professional"].includes(scope) ||
            (scope === "professional" && !String(professionalId).trim())) {
          throw new Error("Escopo ou profissional inválido.");
        }
        if (!days || typeof days !== "object" || Array.isArray(days) ||
            Object.keys(days).some(key => !/^[0-6]$/.test(key))) {
          throw new Error("Informe os horários da semana.");
        }
        const normalized = {};
        for (let day = 0; day <= 6; day++) {
          const periods = days[String(day)] ?? [];
          if (!Array.isArray(periods) || periods.length > 2) throw new Error("Máximo de dois períodos por dia.");
          let previousEnd = "";
          normalized[String(day)] = periods.map(period => {
            const start = String(period?.start || ""), end = String(period?.end || "");
            const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
            if (!validTime(start) || !validTime(end) || start >= end || (previousEnd && start < previousEnd)) {
              throw new Error("Horário de funcionamento inválido.");
            }
            previousEnd = end;
            const breaks = Array.isArray(period.breaks) ? period.breaks : [];
            if (breaks.length > 2) throw new Error("Máximo de dois intervalos por período.");
            return { start, end, breaks: breaks.map(item => {
              const bs = String(item?.start || ""), be = String(item?.end || "");
              if (!validTime(bs) || !validTime(be) || bs >= be || bs < start || be > end) {
                throw new Error("Intervalo inválido.");
              }
              return { start: bs, end: be };
            }) };
          });
        }
        return invoke("saveScheduleSettings", { tenantId: id, scope, ...(scope === "professional" ? { professionalId } : {}), days: normalized });
      },
      async saveScheduleException({ tenantId, kind, professionalId = "", startDate, endDate, reason = "" } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
          new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
        const last = endDate || startDate;
        if (!["companyClosure", "professionalAbsence"].includes(kind) ||
            (kind === "professionalAbsence" && !String(professionalId).trim()) ||
            !validDate(startDate) || !validDate(last) || last < startDate ||
            Date.parse(last + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z") > 89 * 86400000) {
          throw new Error("Período de indisponibilidade inválido (máximo de 90 dias).");
        }
        return invoke("saveScheduleException", { tenantId: id, kind, ...(professionalId ? { professionalId } : {}), startDate, endDate: last, reason: String(reason).trim().slice(0, 240) });
      },
      async saveScheduleBlock({ tenantId, blockId = "", date, start, end, professionalId = "", reason = "", remove = false } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
          new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
        if (remove) {
          if (!String(blockId).trim()) throw new Error("Identificador do bloqueio inválido.");
          return invoke("saveScheduleBlock", { tenantId: id, blockId, date, remove: true });
        }
        const validTime = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
        if (!validDate(date) || !validTime(start) || !validTime(end) || start >= end) {
          throw new Error("Data ou horário do bloqueio inválido.");
        }
        return invoke("saveScheduleBlock", { tenantId: id, ...(blockId ? { blockId } : {}), date, start, end, ...(professionalId ? { professionalId } : {}), reason: String(reason).trim().slice(0, 240) });
      },
      async getClients({ tenantId } = {}) {
        const id = await requireSelectedTenant(tenantId);
        return invoke("getTenantClients", { tenantId: id });
      },
      async saveClient({ tenantId, clientId = "", name, email = "", phone = "", notes = "", active = true } = {}) {
        const id = await requireSelectedTenant(tenantId);
        const normalizedName = String(name || "").trim();
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedPhone = String(phone || "").trim();
        const normalizedNotes = String(notes || "").trim();
        if (normalizedName.length < 2 || normalizedName.length > 100) throw new Error("Informe um nome entre 2 e 100 caracteres.");
        if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Informe um e-mail válido.");
        if (normalizedPhone.length > 40 || normalizedNotes.length > 500) throw new Error("Contacto ou observações demasiado longos.");
        if (typeof active !== "boolean") throw new Error("Estado do cliente inválido.");
        return invoke("saveTenantClient", {
          tenantId: id, ...(clientId ? { clientId: String(clientId).trim() } : {}),
          name: normalizedName, email: normalizedEmail, phone: normalizedPhone,
          notes: normalizedNotes, active
        });
      }
    });
  }

  window.BookingFirebaseWorkspace = Object.freeze({ createFirebaseWorkspaceAdapter });
})();
