(() => {
  "use strict";

  // Explicitly demo-only adapter. It never performs network requests or writes
  // outside the browser's existing demo state. A Firebase adapter can implement
  // this same contract only after a dedicated test project is approved.
  function createDemoAdapter(state) {
    if (!state || !Array.isArray(state.professionals) ||
        !Array.isArray(state.services) || !Array.isArray(state.appointments)) {
      throw new TypeError("Estado de demonstração inválido.");
    }
    return Object.freeze({
      mode: "demo",
      async getCatalog() {
        return {
          professionals: state.professionals.map((item) => [...item]),
          services: state.services.map((item) => [...item])
        };
      },
      async getAppointments({ dateFrom = "", dateTo = "", professionalId = "" } = {}) {
        return state.appointments
          .filter((item) => (!dateFrom || item.date >= dateFrom) &&
            (!dateTo || item.date <= dateTo) &&
            (!professionalId || item.professional === professionalId))
          .map((item) => ({ ...item }));
      }
    });
  }
  window.BookingData = Object.freeze({ createDemoAdapter });
})();
