/**
 * AlanSM Booking — pilot backend configuration.
 * Set SPREADSHEET_ID in Apps Script Script Properties before setup.
 * Never put secrets or real customer data in source control.
 */
const BOOKING_CONFIG = Object.freeze({
  PROPERTY_SPREADSHEET_ID: "SPREADSHEET_ID",
  PROPERTY_AUTH_SECRET: "AUTH_SECRET_KEY",
  SCHEMA_VERSION: "1",
  SHEETS: Object.freeze({
    Tenants: ["tenantId","name","slug","status","planId","trialEndsAt","timezone","currency","createdAt","updatedAt"],
    Users: ["userId","tenantId","email","passwordHash","passwordSalt","role","status","createdAt","updatedAt","lastLoginAt"],
    Professionals: ["professionalId","tenantId","name","email","phone","status","createdAt","updatedAt"],
    Services: ["serviceId","tenantId","name","description","durationMinutes","priceMinor","currency","status","createdAt","updatedAt"],
    Appointments: ["appointmentId","tenantId","clientId","professionalId","serviceId","startAt","endAt","status","priceMinor","currency","notes","idempotencyKey","createdAt","updatedAt","cancelledAt"],
    Clients: ["clientId","tenantId","name","email","phone","createdAt","updatedAt"],
    AuditLog: ["eventId","tenantId","actorUserId","action","resourceType","resourceId","metadataJson","createdAt"],
    IdempotencyKeys: ["key","tenantId","requestHash","resourceId","createdAt","expiresAt"],
    RevokedTokens: ["tokenId","tenantId","userId","revokedAt","expiresAt"]
  })
});
