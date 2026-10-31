/**
 * AlanSM Booking — Google Apps Script API (development bootstrap)
 *
 * Deploy as a Web App only after configuring Script Properties:
 *   SPREADSHEET_ID = ID of a dedicated DEVELOPMENT spreadsheet
 *   API_TOKEN      = long random secret shared only with Cloudflare Pages Function
 *
 * Execute as: Me. Access: Anyone (the Cloudflare same-origin proxy is the public
 * entry point; it must never expose API_TOKEN to the browser).
 * Do not use a production spreadsheet during development.
 */
const COLLECTIONS = [
  "companies", "users", "services", "professionals", "schedules",
  "clients", "appointments", "blocks", "exceptions", "professionalExceptions", "subscriptions"
];
const HEADERS = ["id", "companyId", "payload", "updatedAt"];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty("API_TOKEN");
    if (!expected || !body.token || !constantTimeEqual_(String(body.token), expected)) {
      return json_({ ok: false, error: "unauthorized" });
    }
    const spreadsheetId = props.getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) return json_({ ok: false, error: "not_configured" });
    const action = String(body.action || "");
    const result = withLock_(function () {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      ensureSchema_(ss);
      if (action === "health") return { status: "ready", collections: COLLECTIONS };
      if (action === "save_snapshot") return saveSnapshot_(ss, body);
      if (action === "get_snapshot") return getSnapshot_(ss, body);
      if (action === "public_catalog") return publicCatalog_(ss, body);
      if (action === "create_booking") return createBooking_(ss, body);
      throw new Error("unsupported_action");
    });
    return json_({ ok: true, result: result });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || "server_error") });
  }
}

function ensureSchema_(ss) {
  COLLECTIONS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    else {
      var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
      if (HEADERS.some(function (h, i) { return current[i] !== h; })) {
        throw new Error("invalid_schema_" + name);
      }
    }
  });
}

function saveSnapshot_(ss, body) {
  var companyId = safeId_(body.companyId);
  var data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_data");
  var mapping = {
    companies: data.company === undefined ? undefined : [data.company],
    users: data.users, services: data.services, professionals: data.professionals,
    schedules: data.schedules, clients: data.clients, appointments: data.appointments,
    blocks: data.blocks, exceptions: data.exceptions,
    professionalExceptions: data.professionalExceptions,
    subscriptions: data.subscriptions
  };
  COLLECTIONS.forEach(function (name) {
    if (mapping[name] === undefined) return;
    if (!Array.isArray(mapping[name])) throw new Error("invalid_collection_" + name);
    var sheet = ss.getSheetByName(name);
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
    var kept = rows.filter(function (r) { return String(r[1]) !== companyId; });
    var incoming = mapping[name].map(function (item, index) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_record_" + name);
      var id = safeId_(item.id || name + "-" + index);
      if (item.companyId && String(item.companyId) !== companyId) throw new Error("tenant_mismatch");
      var record = Object.assign({}, item, { id: id, companyId: companyId });
      return [id, companyId, JSON.stringify(record), new Date().toISOString()];
    });
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
    var combined = kept.concat(incoming);
    if (combined.length) sheet.getRange(2, 1, combined.length, 4).setValues(combined);
  });
  return { saved: true, companyId: companyId };
}
function getSnapshot_(ss, body) {
  var companyId = safeId_(body.companyId), output = {};
  COLLECTIONS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
    output[name] = rows.filter(function (r) { return String(r[1]) === companyId; })
      .map(function (r) { return JSON.parse(String(r[2])); });
  });
  return output;
}

function publicCatalog_(ss, body) {
  var companyId = safeId_(body.companyId);
  var data = getSnapshot_(ss, { companyId: companyId });
  var company = data.companies[0] || {};
  return {
    company: { id: companyId, name: company.name || "Empresa" },
    services: data.services.filter(function (x) { return x.active !== false; }),
    professionals: data.professionals.filter(function (x) { return x.active !== false; }),
    schedules: data.schedules,
    appointments: data.appointments.filter(function (x) { return x.status !== "Cancelado" && x.status !== "cancelled"; }),
    blocks: data.blocks,
    exceptions: data.exceptions
  };
}

function createBooking_(ss, body) {
  var companyId = safeId_(body.companyId), booking = body.booking || {};
  ["name", "email", "phone", "serviceId", "professionalId", "date", "time"].forEach(function (key) {
    if (!String(booking[key] || "").trim()) throw new Error("missing_" + key);
  });
  var data = getSnapshot_(ss, { companyId: companyId });
  var service = data.services.find(function (x) { return String(x.id) === String(booking.serviceId) && x.active !== false; });
  var professional = data.professionals.find(function (x) { return String(x.id) === String(booking.professionalId) && x.active !== false; });
  if (!service || !professional) throw new Error("invalid_service_or_professional");
  var duration = Number(service.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error("invalid_duration");
  var schedule = data.schedules.find(function (x) { return String(x.professionalId) === String(professional.id); });
  if (!schedule || !isSlotAvailable_(booking, duration, schedule, data)) throw new Error("slot_unavailable");
  var id = Utilities.getUuid();
  var appointment = {
    id: id, companyId: companyId, name: String(booking.name).trim(),
    email: String(booking.email).trim().toLowerCase(), phone: String(booking.phone).trim(),
    serviceId: service.id, service: service.name, professionalId: professional.id,
    professional: professional.name, date: booking.date, time: booking.time,
    duration: duration, status: "Pendente", source: "online", createdAt: new Date().toISOString()
  };
  appendRecord_(ss.getSheetByName("appointments"), appointment, companyId);
  upsertClient_(ss.getSheetByName("clients"), companyId, appointment);
  return { appointment: appointment };
}

function isSlotAvailable_(booking, duration, schedule, data) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(booking.date || "")) ||
      !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(booking.time || ""))) return false;
  var day = new Date(booking.date + "T12:00:00").getDay();
  var periods = (schedule.days && schedule.days[day]) || [];
  var start = timeMinutes_(booking.time), end = start + duration;
  if (!periods.some(function (p) {
    return start >= timeMinutes_(p.start) && end <= timeMinutes_(p.end) &&
      !(p.breaks || []).some(function (b) { return start < timeMinutes_(b.end) && timeMinutes_(b.start) < end; });
  })) return false;
  var exceptions = (data.exceptions || []).concat(data.professionalExceptions || []);
  if (exceptions.some(function (x) {
    var dateMatches = x.date ? x.date === booking.date :
      x.startDate && x.endDate && booking.date >= x.startDate && booking.date <= x.endDate;
    var professionalMatches = !x.professionalId ||
      String(x.professionalId) === String(booking.professionalId);
    var professionalListMatches = !Array.isArray(x.professionalIds) ||
      x.professionalIds.map(String).indexOf(String(booking.professionalId)) >= 0;
    return dateMatches && professionalMatches && professionalListMatches && x.closed !== false;
  })) return false;
  if ((data.blocks || []).some(function (x) {
    return x.date === booking.date && (!x.professionalId || String(x.professionalId) === String(booking.professionalId)) &&
      start < timeMinutes_(x.end) && timeMinutes_(x.start) < end;
  })) return false;
  return !(data.appointments || []).some(function (x) {
    return String(x.professionalId) === String(booking.professionalId) && x.date === booking.date &&
      x.status !== "Cancelado" && x.status !== "cancelled" &&
      start < timeMinutes_(x.time) + Number(x.duration) && timeMinutes_(x.time) < end;
  });
}
function appendRecord_(sheet, item, companyId) {
  sheet.appendRow([safeId_(item.id), companyId, JSON.stringify(item), new Date().toISOString()]);
}
function upsertClient_(sheet, companyId, booking) {
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
  var found = rows.findIndex(function (r) {
    if (String(r[1]) !== companyId) return false;
    var item = JSON.parse(String(r[2]));
    return item.email && item.email === booking.email;
  });
  var client = { id: found >= 0 ? rows[found][0] : Utilities.getUuid(), name: booking.name, email: booking.email, phone: booking.phone, companyId: companyId, updatedAt: new Date().toISOString() };
  var row = [client.id, companyId, JSON.stringify(client), new Date().toISOString()];
  if (found >= 0) sheet.getRange(found + 2, 1, 1, 4).setValues([row]); else sheet.appendRow(row);
}
function timeMinutes_(value) { var p = String(value || "").split(":").map(Number); return p[0] * 60 + p[1]; }
function safeId_(value) {
  var id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("invalid_id");
  return id;
}
function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0; for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
