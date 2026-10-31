/**
 * Run setupDatabase() manually from the Apps Script editor as the spreadsheet owner.
 * It creates missing tabs and headers; it does not delete or overwrite existing data.
 */
function setupDatabase() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(BOOKING_CONFIG.PROPERTY_SPREADSHEET_ID);
  if (!spreadsheetId) throw new Error("Missing Script Property SPREADSHEET_ID. Setup stopped.");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const schema = BOOKING_CONFIG.SHEETS;
  const report = [];

  Object.keys(schema).forEach(function(sheetName) {
    const headers = schema[sheetName];
    let sheet = spreadsheet.getSheetByName(sheetName);
    const created = !sheet;
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      report.push({ sheet: sheetName, result: created ? "created" : "headers_added" });
      return;
    }

    const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
      .getDisplayValues()[0].filter(function(value) { return value !== ""; });
    const missing = headers.filter(function(header) { return existing.indexOf(header) === -1; });
    if (missing.length) {
      throw new Error("Schema mismatch in " + sheetName + ". Missing columns: " + missing.join(", ") + ". No changes made to this sheet.");
    }
    sheet.setFrozenRows(1);
    report.push({ sheet: sheetName, result: "verified" });
  });

  return { ok: true, schemaVersion: BOOKING_CONFIG.SCHEMA_VERSION, spreadsheetName: spreadsheet.getName(), sheets: report };
}

/** Read-only schema diagnostic; does not expose spreadsheet rows. */
function inspectDatabaseSchema() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(BOOKING_CONFIG.PROPERTY_SPREADSHEET_ID);
  if (!spreadsheetId) return { ok: false, error: "SPREADSHEET_ID_NOT_CONFIGURED" };

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const result = {};
  Object.keys(BOOKING_CONFIG.SHEETS).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    result[name] = {
      exists: Boolean(sheet),
      headerMatches: Boolean(sheet && sheet.getLastRow() > 0 &&
        BOOKING_CONFIG.SHEETS[name].every(function(header) {
          return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
            .getDisplayValues()[0].indexOf(header) !== -1;
        }))
    };
  });
  return { ok: true, schemaVersion: BOOKING_CONFIG.SCHEMA_VERSION, sheets: result };
}
