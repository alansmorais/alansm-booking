# AlanSM Booking — implementation status

## Current branch
Development work is on `preview`. Keep `main` stable and production untouched.

## Official architecture decision
- Firebase Authentication for identity.
- Cloud Firestore as the official operational database.
- Cloud Functions 2nd gen or Cloud Run for trusted mutations and booking logic.
- Cloudflare Pages for static frontend hosting.
- Google Sheets may later support explicit exports/reports, not transactional source of truth.
- See `docs/FIREBASE_ARCHITECTURE.md` for schema, security and API design.

## Implemented preview features
- Responsive Portuguese (Brazil) dashboard.
- Weekly calendar and professional/company schedules with split shifts.
- Date exceptions and professional leave ranges.
- Demo appointment availability validation.
- Versioned localStorage persistence for fictitious demo data only.
- Initial Apps Script pilot scaffolding retained as reference; not the selected official backend.

## Current limitations
- No Firebase project connected.
- No Firebase Authentication flow or live Firestore access.
- No deployed Cloud Functions/Cloud Run API.
- No real customer data, payment processing or public booking.
- Demo localStorage is browser-specific and must never be used for real customer data.
- The public booking page remains unpublished.

## Next implementation phases
1. Add frontend API adapter contract, with demo adapter as the only active mode.
2. Build Firebase backend handlers and Firestore data access in an isolated server directory.
3. Add Firebase Emulator Suite tests for security rules and tenant isolation.
4. Implement Auth UI and tenant onboarding.
5. Implement transactional booking creation, idempotency, cancellation and audit.
6. Connect preview to a dedicated Firebase test project only after explicit approval.
7. Security review and controlled pilot before any production use.

## Guardrails
- Work only on `preview`; do not merge to `main`.
- Do not create/connect a Firebase project, enable billing, deploy functions, set secrets, connect real users or configure production domains without explicit approval.
- Never claim authentication, persistence, bookings or billing are live until end-to-end tests prove them.

## Authentication / onboarding UI scaffold (2026-10-30)
- Added a sign-in and create-account screen to the static preview.
- The forms are explicitly non-functional placeholders and do not send or persist credentials.
- A clear warning instructs users not to enter real passwords.
- A separate action enters the existing local demo dashboard.
- Firebase callable Functions `createTenant`, `getSession`, `cancelAppointment` and `createAppointment` exist as source scaffolding, but are not confirmed compiled, emulator-tested or deployed.
- `cancelAppointment` currently restricts cancellation to active owners/admins and atomically writes appointment status plus an audit event. It is not connected to the UI and must not be exposed before role, tenant-isolation, idempotency and audit tests pass.
- `createAppointment` checks company/professional schedules, breaks, company closure dates, professional absence dates and date-specific blocks in the tenant timezone, in addition to transaction-based overlap guards and idempotency. Appointments crossing local midnight are rejected.
- Trusted schedule administration callables now exist: `saveScheduleSettings`, `saveScheduleException` and `saveScheduleBlock`. They enforce active owner/admin membership, validate inputs, write tenant-scoped records and append audit events. Absence/closure ranges are expanded to per-date records, capped at 90 days per operation.
- These callables and booking flows are still not connected to the frontend or emulator-verified; do not use for real bookings.
- Concurrent booking behavior, idempotency replay, cancellation and audit behavior still require emulator integration tests. Public booking is not implemented.
- Do not describe login, registration or tenant creation as live.

## Tablet-friendly automated validation (2026-10-30)
- Added GitHub Actions workflow `.github/workflows/preview-ci.yml` for preview pushes, pull requests and manual runs.
- CI validates frontend JavaScript syntax and JSON configuration.
- Firestore Rules are tested against the local Firestore Emulator.
- Firebase Functions are compiled with Node.js 22.
- Auth + callable Functions integration tests use only local Auth, Firestore and Functions emulators.
- Integration coverage includes unauthenticated tenant creation, verified-user tenant creation, duplicate slug rejection and session membership retrieval.
- The Firestore rules test project ID is aligned with the emulator project, and coverage also checks that a user cannot read another member's membership document.
- Auth integration coverage also verifies that an account with an unverified email cannot create a tenant.
- No production Firebase project, secrets, billing or live user data are used by these tests.
- Workflow files and tests have been committed, but a successful GitHub Actions run has not yet been observed; do not mark CI green until the run is checked.


## Trusted schedule administration (2026-10-30)
- Added server-side weekly schedule save for company and professionals. Each day supports up to two ordered work periods and bounded, non-overlapping breaks.
- Added company closure and professional absence date ranges, stored per local date in the tenant timezone; each request is limited to 90 days.
- Added create/update/remove operations for professional-specific or company-wide time blocks.
- All three endpoints require an active owner/admin membership, use tenant-scoped document paths, and create audit records. They are backend scaffolds only; emulator tests and frontend wiring remain outstanding.

## Schedule administration integration coverage (2026-10-30)
- Added emulator integration cases for valid weekly company hours, invalid overlapping periods, company closure date ranges, the 90-day limit, block creation/removal and invalid block time ranges.
- These tests run only against the local Firebase Emulator Suite in GitHub Actions. Results must be observed before treating the endpoints as validated.


## Tenant-scoped read APIs (2026-10-30)
- Added `getTenantCatalog` for safe active professional/service display fields and `getAgendaAppointments` for a bounded (maximum 31 days), optional-professional-filter agenda query.
- Both require authenticated active owner/admin/staff membership. Tenant IDs are locators only, not authorization.
- Agenda response omits free-text notes and client contact data, caps results at 500 and reports truncation.
- Emulator integration coverage checks safe catalog shape, cross-tenant denial and date-window validation. These APIs remain disconnected from the demo frontend and no live Firebase project is configured.

## Frontend data adapter — schedule coverage (2026-10-30)
- Extended the demo adapter with detached read snapshots for company hours, professional hours, breaks, time blocks, company exceptions and professional absence ranges.
- Weekly calendar and appointment availability calculations now read their schedule inputs through the adapter. Schedule editing still writes only to the local demo state.
- Added automated adapter tests confirming returned schedule data is detached from the original demo state and invalid demo state is rejected.
- GitHub Actions runs the adapter tests alongside frontend syntax checks and Firebase emulator/build tests.
- This remains a browser-local demo adapter. No Firebase client, network API or live data has been connected.
