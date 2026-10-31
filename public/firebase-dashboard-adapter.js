(() => {
  "use strict";

  const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
  const clock = (ms, timeZone) => {
    const date = new Date(ms);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return { date: get("year") + "-" + get("month") + "-" + get("day"), time: get("hour") + ":" + get("minute") };
  };

  function createFirebaseDashboardAdapter({ workspace, timeZone = "UTC" } = {}) {
    if (!workspace || workspace.mode !== "firebase") {
      throw new TypeError("O workspace Firebase é obrigatório.");
    }
    let activeTimeZone = text(timeZone, "UTC");
    const professionalNames = new Map();
    const serviceNames = new Map();
    const professionalName = (id) => professionalNames.get(id) || id || "";
    const serviceName = (id) => serviceNames.get(id) || id || "";

    async function loadCatalog(options = {}) {
      const result = await workspace.getCatalog(options);
      professionalNames.clear();
      serviceNames.clear();
      (result.professionals || []).forEach((item) => professionalNames.set(item.id, text(item.name, "Profissional")));
      (result.services || []).forEach((item) => serviceNames.set(item.id, text(item.name, "Serviço")));
      return {
        professionals: (result.professionals || []).map((item) => [
          text(item.name, "Profissional"), "", "", text(item.status) === "active" ? "Ativo" : "Inativo", item.id
        ]),
        services: (result.services || []).map((item) => [
          text(item.name, "Serviço"), Number.isInteger(item.durationMinutes) ? item.durationMinutes : 0,
          Number.isSafeInteger(item.priceMinor) && item.currency
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: item.currency }).format(item.priceMinor / 100)
            : "—",
          text(item.status) === "active" ? "Ativo" : "Inativo", "", item.id
        ]),
        raw: result
      };
    }

    async function loadSchedule({ startDate, endDate, ...options } = {}) {
      if (!professionalNames.size) await loadCatalog(options);
      const result = await workspace.getSchedule({ ...options, startDate, endDate });
      activeTimeZone = text(result.timezone, activeTimeZone);
      return {
        companySchedule: result.companySchedule || {},
        professionalSchedules: Object.fromEntries(Object.entries(result.professionalSchedules || {}).map(([id, days]) => [professionalName(id), days])),
        blocks: (result.blocks || []).map((item) => ({
          id: item.id, date: item.date, start: item.start, end: item.end,
          professionalId: professionalName(item.professionalId), label: text(item.reason, "Bloqueio")
        })),
        exceptions: (result.exceptions || []).map((item) => ({
          id: item.id, date: item.date, label: text(item.reason || item.kind, "Empresa fechada")
        })),
        professionalExceptions: (result.professionalExceptions || []).map((item) => ({
          id: item.id, date: item.date, professionalId: professionalName(item.professionalId),
          label: text(item.reason || item.kind, "Ausência")
        })),
        timezone: text(result.timezone, timeZone),
        truncated: result.truncated === true,
        raw: result
      };
    }

    async function loadAgenda({ startAtMs, endAtMs, ...options } = {}) {
      if (!professionalNames.size || !serviceNames.size) await loadCatalog(options);
      const result = await workspace.getAgenda({ ...options, startAtMs, endAtMs });
      const clientsResult = typeof workspace.getClients === "function"
        ? await workspace.getClients(options) : { clients: [] };
      const clientNames = new Map((clientsResult.clients || []).map((client) => [client.id, text(client.name, "Cliente")]));
      const zone = activeTimeZone;
      return {
        appointments: (result.appointments || []).map((item) => {
          const start = clock(item.startAtMs, zone);
          const end = clock(item.endAtMs, zone);
          const duration = Math.max(0, Math.round((item.endAtMs - item.startAtMs) / 60000));
          const statuses = {
            pending: "Pendente", booked: "Confirmado", confirmed: "Confirmado",
            cancelled: "Cancelado", completed: "Concluído", no_show: "Não compareceu"
          };
          return {
            id: item.id, date: start.date, time: start.time, endTime: end.time, duration,
            name: clientNames.get(item.clientId) || "Cliente", clientId: item.clientId || "",
            serviceId: item.serviceId || "", professionalId: item.professionalId || "",
            service: serviceName(item.serviceId), professional: professionalName(item.professionalId),
            status: statuses[item.status] || "Pendente",
            priceMinor: item.priceMinor ?? null, currency: item.currency || null
          };
        }),
        truncated: result.truncated === true,
        raw: result
      };
    }

    return Object.freeze({ mode: "firebase", loadCatalog, loadSchedule, loadAgenda });
  }

  const api = Object.freeze({ createFirebaseDashboardAdapter });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.BookingFirebaseDashboard = api;
})();
