(() => {
  "use strict";

  const NOT_CONNECTED =
    "A criação de empresas e o espaço de trabalho Firebase ainda não estão ligados.";

  function createDemoWorkspaceAdapter({ authAdapter, dataAdapter } = {}) {
    if (!authAdapter || authAdapter.mode !== "demo" ||
        !dataAdapter || dataAdapter.mode !== "demo") {
      throw new TypeError("Os adaptadores de demonstração são obrigatórios.");
    }

    const tenants = [{
      id: "demo-tenant",
      name: "Barbearia Modelo",
      slug: "barbearia-modelo",
      role: "owner",
      timezone: "America/Sao_Paulo",
      currency: "BRL"
    }];
    let selectedTenantId = tenants[0].id;

    function selectedTenant() {
      return tenants.find((tenant) => tenant.id === selectedTenantId) || null;
    }

    return Object.freeze({
      mode: "demo",
      getSession() {
        return {
          mode: "demo",
          user: null,
          selectedTenantId,
          tenants: tenants.map((tenant) => ({ ...tenant }))
        };
      },
      selectTenant(tenantId) {
        const tenant = tenants.find((item) => item.id === String(tenantId || ""));
        if (!tenant) throw new Error("Não tem acesso a esta empresa.");
        selectedTenantId = tenant.id;
        return { ...tenant };
      },
      getSelectedTenant() {
        const tenant = selectedTenant();
        return tenant ? { ...tenant } : null;
      },
      createTenant() {
        throw new Error(NOT_CONNECTED);
      },
      getCatalog() {
        if (!selectedTenant()) throw new Error("Selecione uma empresa.");
        return dataAdapter.getCatalog();
      },
      getAgenda({ dateFrom = "", dateTo = "", professionalId = "" } = {}) {
        if (!selectedTenant()) throw new Error("Selecione uma empresa.");
        return dataAdapter.getAppointments({ dateFrom, dateTo, professionalId });
      },
      getSchedule() {
        if (!selectedTenant()) throw new Error("Selecione uma empresa.");
        return dataAdapter.getScheduleData();
      }
    });
  }

  window.BookingWorkspace = Object.freeze({ createDemoWorkspaceAdapter });
})();
