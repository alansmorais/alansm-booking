/** Tenant-scoped spreadsheet primitives. Keep all access behind authenticated services. */
function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(BOOKING_CONFIG.PROPERTY_SPREADSHEET_ID);
  if (!id) throw new Error("SPREADSHEET_ID_NOT_CONFIGURED");
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error("DATABASE_SCHEMA_NOT_READY");
  return sheet;
}
function rowsAsObjects_(name) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(function(row){return row.some(function(v){return v !== "" && v !== null;});})
    .map(function(row) { const item={}; headers.forEach(function(h,i){item[h]=row[i];}); return item; });
}
function appendObject_(name, item) {
  const sheet = sheet_(name);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const row = headers.map(function(header){return item[header] === undefined ? "" : item[header];});
  sheet.appendRow(row);
}
function findUserByEmail_(email) {
  const normalized = normalizeEmail_(email);
  return rowsAsObjects_("Users").filter(function(user){return normalizeEmail_(user.email) === normalized;})[0] || null;
}
function findUserById_(userId) {
  return rowsAsObjects_("Users").filter(function(user){return String(user.userId) === String(userId);})[0] || null;
}
function isTokenRevoked_(tokenId) {
  return rowsAsObjects_("RevokedTokens").some(function(row){return String(row.tokenId) === String(tokenId);});
}
function writeAudit_(tenantId, actorUserId, action, resourceType, resourceId) {
  appendObject_("AuditLog", {
    eventId:newId_(), tenantId:tenantId, actorUserId:actorUserId || "",
    action:action, resourceType:resourceType || "", resourceId:resourceId || "",
    metadataJson:"{}", createdAt:nowIso_()
  });
}
