# Firebase Functions — onboarding foundation

This directory contains the first trusted backend endpoints for AlanSM Booking.

## Implemented
- `createTenant`: authenticated and email-verified user creates a tenant; slug reservation and owner membership are written in one Firestore transaction.
- `getSession`: returns the authenticated user's active tenant memberships and safe tenant summaries.
- `cancelAppointment`: owner/admin-only cancellation; validates active membership and tenant state, applies an allowed status transition and writes the audit event in the same Firestore transaction.
- `saveScheduleSettings`: owner/admin-only company or professional weekly schedule updates, with validation of up to two daily periods and bounded breaks.
- `saveScheduleException`: owner/admin-only company closures and professional absences, expanded into tenant-local date records (maximum 90 days per operation).
- `saveScheduleBlock`: owner/admin-only create, update and removal of company-wide or professional-specific time blocks.

`createAppointment`: authenticated booking creation; reads duration and price from the service record, checks active membership and referenced records, serializes booking attempts with per-professional/per-UTC-day transaction guards, checks overlapping appointments, and stores an idempotency record plus audit event atomically.

`createAppointment` now checks company/professional schedules, breaks, company closures, professional absences and date-specific blocks using the tenant timezone. The authenticated Firebase dashboard now exposes owner/admin controls for company and professional weekly hours, closures, absences and date-specific blocks. These controls call the trusted schedule administration callables. Booking endpoints are not ready for public/real bookings and require a separate customer-facing backend flow and abuse protection before use.

## Schedule data contract for `createAppointment`

Before this callable can be used, trusted setup code must create these tenant-scoped documents:

- `scheduleSettings/company` and `scheduleSettings/professional_{professionalId}` with `{ days: { "0": [], "1": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }] } }`. Day keys follow JavaScript weekday numbering: Sunday `0` through Saturday `6`.
- `scheduleExceptions/{YYYY-MM-DD}` to mark a company closure.
- `professionalExceptions/{professionalId}_{YYYY-MM-DD}` to mark a professional absence for that date. Multi-day absences must create one document per affected local date.
- `blocks` documents with `{ date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", professionalId?: "..." }`. Omit `professionalId` for a company-wide block.

Dates and clock times are interpreted in the tenant's IANA timezone. The current callable rejects appointments crossing local midnight. These records are written through the owner/admin-only schedule callables. The browser never writes schedule documents directly.

## Security notes
- These functions use Firebase Admin SDK, which bypasses Firestore Security Rules. Every handler must validate identity, membership, role, tenant ownership and input independently.
- The browser must never send a trusted tenant identity for authorization.
- `createTenant` requires Firebase Authentication and a verified email.
- App Check is not enforced yet because no Firebase client/project is configured. Enable and enforce it before public launch.
- No password is handled by these functions. Firebase Authentication owns credentials.
- Never log auth tokens, passwords, client records or unnecessary personal data.

## Local development
1. Install Node.js 20.
2. Run `npm install` inside this directory.
3. From the repository root, run `firebase emulators:start --only auth,firestore,functions`.
4. Create a test Auth user in the Auth Emulator and mark its email verified.
5. Call the functions through the Functions Emulator.
6. Add automated tests for duplicate slugs, unverified/disabled users, tenant isolation, role checks and transaction retries before integration.

No Firebase project, billing account, credentials, or production deployment is configured by this repository change.


## Tenant-scoped read APIs

- `getTenantCatalog`: requires an authenticated active tenant member with owner/admin/staff role; returns only active professional and service display fields, never client records or contact details.
- `getAgendaAppointments`: requires the same membership and role check; accepts an epoch-millisecond interval of at most 31 days, optional professional filter, returns appointments intersecting the requested interval and omits free-text notes and client PII. Results are capped at 500 and expose a truncation flag.
- `tenantId` is a locator only. Authorization is always derived from the verified caller UID and active membership document.
- The authenticated Firebase preview view reads the tenant catalog, schedule and agenda. Owner/admin catalog and schedule forms call trusted workspace functions. The main demo dashboard remains separate and is still the default entry path.
- No live Firebase project is connected. Client date boundaries must be calculated using the tenant timezone before calling the agenda endpoint.

## Tenant catalog administration

- `getTenantCatalogForManagement`: owner/admin-only bounded listing of active and inactive services and professionals.
- `saveTenantCatalogItem`: owner/admin-only create, update and soft-deactivate operation for services and professionals. Service duration, integer minor-unit price and ISO currency are validated server-side; professional color is restricted to six-digit hex.
- IDs are generated by Firestore for new records. Deactivation sets `status: inactive`; it never deletes referenced catalog records. Every successful mutation writes an audit event in the same transaction.
- Browser access is exposed through the Firebase workspace adapter only. The authenticated Firebase view includes catalog and schedule management for owners/admins; staff retain read-only access.
