# AlanSM Booking — Firebase architecture decision

Date: 2026-10-30  
Status: **Selected for the official product; implementation scaffold only.**  
Scope: development branch `preview`. No Firebase project has been connected or deployed.

## Decision

Use **Firebase Authentication + Cloud Firestore**, with trusted server-side booking operations implemented using **Cloud Functions (2nd gen) or Cloud Run**. Cloudflare Pages remains the static frontend host.

Google Sheets is not the transactional database. It may later be used for owner-initiated reports/exports, never as a second source of truth.

This decision follows the recommended Firebase direction accepted by continuing with the proposed architecture. The existing Apps Script work is retained as an archived pilot/learning reference and must not be treated as the official backend.

## Components

- Cloudflare Pages: static frontend and preview hosting.
- Firebase Authentication: user identity and session token issuance.
- Cloud Functions 2nd gen or Cloud Run: trusted API for onboarding, tenant administration, appointment creation/cancellation and public booking.
- Cloud Firestore: tenant-scoped operational data.
- Firebase App Check: add after supported client integration and before public launch.
- Cloud Logging / Error Reporting: operational diagnostics, with personal data excluded from logs.

The frontend must never hold service-account credentials or Admin SDK credentials. Admin SDK is server-only and bypasses Firestore Security Rules, so every backend handler must independently validate authentication, tenant membership, role, input and ownership.

## Firestore data layout

```text
tenants/{tenantId}
  members/{uid}
  professionals/{professionalId}
  services/{serviceId}
  clients/{clientId}
  appointments/{appointmentId}
  blocks/{blockId}
  scheduleSettings/{settingId}
  auditLog/{eventId}

publicBookingPages/{slug}
```

Every business-owned record includes `tenantId`, even when nested beneath a tenant document. Server handlers derive tenantId from the authenticated membership record, not from a trusted browser parameter.

### Core fields

- Tenant: name, slug, status, planId, timezone, currency, createdAt, updatedAt.
- Member: uid, tenantId, role (`owner`, `admin`, `staff`), status, createdAt.
- Professional: name, contact details, status, schedule reference/configuration.
- Service: name, durationMinutes, priceMinor (integer), currency, status.
- Client: name, email, phone, createdAt, updatedAt.
- Appointment: tenantId, clientId, professionalId, serviceId, startAt, endAt, status, priceMinor, currency, notes, idempotencyKey, createdAt, updatedAt.
- Block/schedule settings: tenantId, date/day, periods, breaks, professionalId where applicable.
- Audit event: tenantId, actorUid, action, resourceType, resourceId, createdAt. Never store passwords, tokens or unnecessary personal data.

Store timestamps as Firestore Timestamps in UTC and retain the tenant's IANA timezone for display and business-hour calculations. Store money as integer minor units.

## Security model

1. Firebase Authentication establishes identity; it does not establish tenant access by itself.
2. A server-created membership record grants tenant membership and role.
3. Client-side writes are denied by default in Firestore rules. All mutations go through trusted backend handlers.
4. The backend derives tenantId from verified identity + active membership; never trust a submitted tenantId.
5. Each referenced service, professional and client is loaded and verified as belonging to the same tenant.
6. Booking duration and price are read from the service record, not supplied by the browser.
7. Appointment overlap prevention uses a Firestore transaction or a dedicated per-professional/day lock document with a deterministic slot strategy. The exact algorithm must be load-tested; a query alone is not a concurrency lock.
8. Appointment creation requires an idempotency key and stores its request hash/result atomically.
9. Cancellation/status transitions require role and ownership checks and append audit events.
10. Public booking reads expose only a separate, explicitly public document; never expose tenant collections or private client data.
11. Apply App Check, rate limits, abuse controls, input bounds, safe output encoding and retention/deletion policies before launch.
12. Test cross-tenant reads/writes, disabled members, role escalation, overlapping simultaneous requests, duplicate retries and public-page data leakage.

## Implemented backend scaffold (preview branch)

The Functions source contains four callable endpoints in `functions/src/index.ts`:

- `createTenant`: requires an authenticated, email-verified, non-disabled Firebase user; validates tenant name, normalized slug, IANA timezone and currency; atomically reserves the slug and creates the tenant plus the caller's `owner` membership.
- `getSession`: returns the caller's own identity and active memberships, with safe tenant summaries.
- `cancelAppointment`: owner/admin-only cancellation with an atomic audit event.
- `createAppointment`: authenticated booking creation with service-derived duration/price, per-professional/per-UTC-day transaction guards, overlap checks, idempotency and audit records.

`createAppointment` now checks company and professional schedules, breaks, company closure dates, professional absence dates and date-specific blocks using the tenant IANA timezone. Schedule documents use `scheduleSettings/company` and `scheduleSettings/professional_{professionalId}` with weekday keys `0`–`6` and arrays of `{start,end,breaks}` periods; closures use `scheduleExceptions/{YYYY-MM-DD}`; absences use `professionalExceptions/{professionalId}_{YYYY-MM-DD}`; blocks use a local date and `HH:MM` start/end. Multi-day absences must be expanded to one document per local date. Appointments crossing local midnight are currently rejected. These data documents still require trusted setup handlers. Booking endpoints are not connected to the frontend and are not ready for real bookings.

`firebase.json` points to the `functions/` source using Node.js 22. A collection-group index supports the membership lookup. These endpoints are source-code scaffolding only: they have not been compiled against installed dependencies, run in the Emulator Suite, or deployed. App Check is not enforced yet.

## API contract (initial)

Authenticated:
- `POST /v1/tenants` — create tenant + owner membership in one trusted operation.
- `GET /v1/session` — resolve current user and active tenant memberships.
- `GET /v1/tenants/{tenantId}/workspace` — authorized workspace bootstrap.
- `POST /v1/tenants/{tenantId}/appointments` — create with idempotency key; server computes duration/price and checks availability.
- `POST /v1/tenants/{tenantId}/appointments/{appointmentId}/cancel` — authorized cancellation.
- `PUT /v1/tenants/{tenantId}/schedule` — validate and save company/professional schedules.
- `PUT /v1/tenants/{tenantId}/services/{serviceId}` and professional/client management routes — role-checked mutations.

Public:
- `GET /v1/public/{slug}` — return safe public business/service data only.
- `GET /v1/public/{slug}/availability` — return available slots only.
- `POST /v1/public/{slug}/appointments` — validate public booking, abuse controls and idempotency.

The callable functions `createTenant`, `getSession`, `cancelAppointment` and `createAppointment` exist as source scaffolding. The booking endpoints are not wired to the frontend and must not be exposed until emulator tests cover authorization, concurrent overlap attempts, idempotency, state transitions and audit behavior. Working-hour validation and public booking remain unimplemented. The current UI must remain in demo mode until end-to-end implementation and tests exist.

## Local/demo persistence

The versioned browser localStorage adapter is demo-only. It must not become a fallback for real accounts or store real customer data. When Firebase mode is introduced, fail visibly if the API is unavailable; never silently save real records locally.

## Migration / current work

- Existing demo UI and availability engine remain reusable.
- Existing Apps Script schema/auth work is retained for reference only; do not deploy it.
- The Firebase prototype mentioned in project history was not present in the current `preview` tree at the time of this decision. No credentials/configuration were found or copied.
- No Firebase project, Authentication provider, Firestore database, billing plan, secrets, domain or production resource has been created/changed.
- Next: compile the Functions package, add Emulator Suite tests for onboarding and tenant isolation, then implement role-checked workspace/service/professional APIs and transactional booking operations. Only connect a Firebase project after explicit approval.
