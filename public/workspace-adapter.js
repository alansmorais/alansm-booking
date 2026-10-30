(() => {
  "use strict";

  const NOT_CONNECTED =
    "A criação de empresas e o espaço de trabalho Firebase ainda não estão ligados.";

  function createDemoWorkspaceAdapter({ authAdapter, dataAdapter } = {}) {
    if (!authAdapter || authAdapter.mode !== "demo" ||
        !dataAdapter || dataAdapter.mode !== "demo") {
      throw new TypeError("Os adaptadores de demonstração são obrigatórios.");
    }

    return Object.freeze({
      mode: "demo",
      getSession() {
        return {
          mode: "demo",
          user: null,
          tenants: [{
            id: "demo-tenant",
            name: "Barbearia Modelo",
            slug: "barbearia-modelo",
            role: "owner",
            timezone: "America/Sao_Paulo",
            currency: "BRL"
          }]
        };
      },
      createTenant() {
        throw new Error(NOT_CONNECTED);
      },
      getCatalog() {
        return dataAdapter.getCatalog();
      },
      getAgenda({ dateFrom = "", dateTo = "", professionalId = "" } = {}) {
        return dataAdapter.getAppointments({ dateFrom, dateTo, professionalId });
      },
      getSchedule() {
        return dataAdapter.getScheduleData();
      }
    });
  }

  window.BookingWorkspace = Object.freeze({ createDemoWorkspaceAdapter });
})();
