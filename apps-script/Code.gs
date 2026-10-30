/**
 * Deliberately fail-closed API shell.
 * No data endpoint is exposed until authentication, tenant authorization,
 * validation, locking and idempotency handlers are implemented and tested.
 */
function doGet() {
  return jsonOutput({
    ok: true,
    service: "AlanSM Booking API",
    state: "BOOTSTRAP_ONLY",
    message: "API is not enabled. No customer or tenant data endpoints are available."
  });
}

function doPost(event) {
  return jsonOutput({
    ok: false,
    code: "API_NOT_ENABLED",
    message: "The booking API is not enabled yet."
  });
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
