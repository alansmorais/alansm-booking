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

## Authentication adapter boundary (2026-10-30)
- Added `public/auth-adapter.js` with an explicit demo-only authentication adapter.
- Login and registration UI now call the adapter contract. In demo mode both operations fail closed with a clear message; no credentials are sent, persisted or logged.
- The adapter exposes the future interface (`signIn`, `register`, `signOut`, `getCurrentUser`) but does not import Firebase, contain Firebase configuration or create a live session.
- Added automated tests proving login/registration remain unavailable and the adapter reports no authenticated user.
- CI checks the new file's syntax and runs both data/auth adapter tests.
- A Firebase-backed implementation remains a separate future step and requires an approved dedicated Firebase test project before connecting credentials or real authentication.

## Workspace and tenant adapter boundary (2026-10-30)
- Added `public/workspace-adapter.js` as the frontend boundary for session lookup, tenant creation, catalog reads, agenda reads and schedule reads.
- The demo implementation exposes only a clearly fictitious sample tenant and delegates catalog/agenda/schedule reads to the demo data adapter.
- Tenant creation deliberately fails closed in demo mode. No tenant, user or business data is created in Firebase.
- Dashboard agenda, catalog and availability reads now pass through the workspace adapter, preparing one replacement point for a future authenticated Firebase implementation.
- Added tests for demo tenant isolation, delegated reads and refusal to operate with non-demo dependencies.
- GitHub Actions now validates the workspace adapter syntax and runs its contract tests alongside the existing adapter tests.
- This is an interface boundary, not a live tenant system. Firebase authentication, tenant onboarding and workspace reads remain disconnected from the frontend.

## Tenant onboarding flow preparation (2026-10-30)
- Added `public/onboarding-flow.js` to define the ordered future registration flow: create auth account, send email verification, reload the verified user, create tenant, then load session.
- The flow refuses to create a tenant until the authenticated user is confirmed as email-verified.
- Added slug normalization for accents, punctuation and length. Registration UI now suggests a public slug from the business name while allowing manual edits.
- Added tests for slug normalization, invalid input, unverified-email blocking and the successful verified sequence.
- The flow is an injectable orchestration contract only. The current demo auth/workspace adapters do not provide Firebase operations, so no live registration or tenant creation is possible.
- CI checks the onboarding module and runs its tests. Firebase Auth SDK integration and live confirmation-email handling remain pending an approved Firebase test project.

## Firebase client adapter preparation (2026-10-30)
- Added injectable Firebase Authentication adapter factory in `public/firebase-auth-adapter.js`. It wraps account creation, sign-in, profile display name, email verification, user reload and sign-out using SDK functions supplied by the host.
- Added callable Functions workspace adapter in `public/firebase-workspace-adapter.js` for `createTenant`, `getSession`, `getTenantCatalog` and `getAgendaAppointments`.
- The workspace adapter checks for an authenticated user and verified email before tenant creation, and validates tenant selection and agenda intervals before calling backend functions.
- Both Firebase adapter factories are loaded as dormant definitions, but are not instantiated or selected by the app. The demo auth and demo workspace remain the only active adapters.
- Added mocked contract tests for Firebase auth and workspace adapters. Tests do not contact Firebase or use credentials.
- No Firebase SDK initialization, project configuration, API keys, Auth provider, Firestore database, App Check or Functions deployment has been created. A dedicated test Firebase project and explicit approval are still required before activation.

## Email verification continuation (2026-10-30)
- Onboarding now exposes `completeAfterVerification()` so a user can return after clicking the Firebase verification link, refresh the current Firebase user, and create the tenant only after `emailVerified === true`.
- Business name, slug, timezone and currency are held only in the in-memory onboarding flow while the page remains open. Passwords are passed to Firebase Auth for account creation and are not retained by the onboarding flow.
- If the page was refreshed or reopened, the user can supply the business details again to `completeAfterVerification(input)`; no password is needed for that step because Firebase Auth maintains the authenticated session.
- Added tests for delayed verification, no premature tenant creation, and continuation after a fresh flow instance.
- The current demo UI remains unchanged and does not expose this Firebase flow; no live Firebase configuration has been added.

## Multi-tenant workspace selection (2026-10-30)
- The Firebase workspace adapter now loads the authenticated user's active tenant memberships from `getSession`, selects a tenant explicitly when multiple memberships exist, and exposes the selected tenant ID.
- If exactly one active tenant is returned, it is selected automatically. If multiple tenants exist, the user must choose one before reading workspace data.
- Before each catalog or agenda read, the adapter refreshes the session and confirms the selected tenant is still an active membership. A requested tenant outside the membership list is rejected; changing to another tenant requires the explicit `selectTenant` operation.
- After tenant creation, the new tenant becomes the selected workspace. Session refresh validates that membership before any data read.
- The demo workspace adapter implements the same selection contract and still exposes only the single fictitious Barbearia Modelo tenant.
- Added a sidebar workspace selector and active workspace label to the demo dashboard. This demonstrates the interaction, but does not create additional demo businesses or connect Firebase.
- Added contract tests for explicit multi-tenant selection, unauthorized tenant rejection, stale selection protection and demo adapter behavior.
- No tenant creation, switching or data access has been enabled against a live Firebase project.

## Tenant members and access control (2026-10-30)
- Added trusted callable Functions: `createMemberInvitation`, `acceptMemberInvitation`, `getTenantMembers`, and `updateMemberAccess`.
- Only tenant owners/admins can list members or create invitations. Invitations are limited to `admin` or `staff`; only owners may promote another member to admin.
- Invitation tokens are generated with cryptographically secure randomness. Only the SHA-256 hash is stored. The raw token is returned once to the authorized inviter for manual sharing; automatic email delivery is not configured.
- Invitations expire after seven days, are single-use, and can only be accepted by a signed-in, email-verified Firebase user whose email exactly matches the invited address.
- Acceptance creates the tenant membership and audit event in one Firestore transaction. Replays, expired invitations, wrong e-mail addresses and unavailable tenants are rejected.
- Member access can be set to active or suspended. The owner membership cannot be changed through this endpoint. Admins cannot modify another admin.
- Added integration tests for invitation, acceptance, replay prevention, member listing, suspension and staff authorization.
- This backend is not connected to the demo UI and no live Firebase project or email provider is configured. Manual invitation-token sharing is a development-stage mechanism, not the final customer-facing invitation experience.

 
## Firebase workspace member adapter (2026-10-30)
- Extended the dormant Firebase workspace adapter with tenant-scoped methods for listing members, creating invitations and updating member access.
- Every operation refreshes the authenticated session and resolves the selected tenant from current memberships before invoking a callable Function. The backend remains authoritative for owner/admin authorization.
- The adapter normalizes invitation e-mail addresses and validates allowed roles/statuses before making calls. It does not expose member-management operations through the demo adapter.
- Added mocked tests for tenant scoping, e-mail normalization and rejection of invalid roles/statuses before any mutation call.
- These methods are not instantiated by the demo app. No invitation token is generated and no live Firebase call is made in the preview.


## Firebase invitation acceptance adapter (2026-10-30)
- Added a dormant frontend adapter method for accepting a tenant invitation using the tenant locator and one-time invitation token.
- Acceptance does not require existing tenant membership; it does require a signed-in user with a verified email before the callable Function is invoked.
- The backend remains authoritative: it checks the token hash, invited email, expiry, pending status and tenant availability transactionally, then creates membership and audit records.
- Mocked tests cover successful invocation, missing authentication, unverified email and invalid tokens. No real invitation token or Firebase account is used, and the demo application remains unchanged.


## Invitation acceptance flow contract (2026-10-30)
- Added an injectable invitation flow that validates the invitation link inputs, checks for a signed-in user, refreshes the Firebase user and requires verified email before accepting.
- After the backend confirms acceptance, the flow reloads the workspace session so the newly granted tenant membership can be selected.
- Added automated tests for successful acceptance ordering, unauthenticated users, unverified email and malformed invitation links. The contract is loaded as a dormant browser module but is not instantiated by the demo app.
- The previous invitation-adapter test exposed a cross-realm assertion issue in the test harness, not a product behavior issue; the assertion was narrowed to compare the actual scalar fields. The follow-up CI run must confirm the correction.
- No invitation links are currently generated or distributed by the preview, and no Firebase credentials or live services are configured.


## Invitation entry page (2026-10-30)
- Added a tablet/mobile-friendly invitation entry panel for links containing `tenantId` and `invite` query parameters.
- The page distinguishes ordinary access, complete invitation links and malformed links. It does not display the raw invitation token.
- Invitees can choose the existing sign-in or registration tab. The page clearly states that real acceptance is not enabled in this demo until Firebase authentication is approved and configured.
- Added parser tests and included the new page module in frontend syntax checks and CI tests.
- The panel is presentation-only in demo mode: it does not authenticate, accept an invitation, call Firebase or grant access. No production routing or Firebase configuration was changed.


## Team management frontend adapter boundary (2026-10-30)
- Extended the team screen with an explicitly injected Firebase workspace mode for listing tenant members and pending invitations, creating invitations, and suspending/reactivating non-owner memberships.
- The existing local demonstration remains the default. Firebase mode can only be selected by an explicit configureLive({ workspaceAdapter, tenantId }) call using an adapter marked firebase; the current app does not make that call.
- The team route invokes the module mount hook, which is a no-op in demo mode and loads members only after live mode has been explicitly configured.
- The raw invitation token is not persisted; if a live adapter returns one, the UI displays it once for manual private sharing. No email provider is configured.
- The frontend wiring is still dormant. No Firebase SDK initialization, live credentials, customer data, Functions deployment or App Check configuration has been added. Do not treat this as an activated production team workflow.

## Team screen contract tests (2026-10-30)
- Added automated tests for the team screen's safe default (local demo), refusal to enable live mode without an explicitly marked Firebase adapter and tenant ID, and explicit live-mode member/invitation loading.
- Added the team contract test to the preview CI workflow.
- These tests use mocked adapters only; they do not initialize Firebase, authenticate users or contact a live backend.

## Current verified snapshot (2026-10-30 — preview)
- Latest observed GitHub Actions run: **41114424858**, commit `c65869d`, completed successfully.
- Passing jobs: frontend/configuration validation (including adapter, onboarding, invitation and team contract tests); Firestore security rules emulator tests; Firebase Auth/Functions emulator integration tests; Firebase Functions TypeScript compilation.
- Team management screen is present in the preview. Its default mode is local demonstration data only. A separately injected Firebase mode can list members, create invitations and suspend/reactivate non-owner memberships, but the application does not instantiate that mode.
- Invitation acceptance entry screen and the invitation-flow contract are present, but they are not connected to the sign-in/register UI.
- The Firebase auth/workspace adapters are dormant factories. There is no Firebase client initialization or configured project.
- No live Firebase project, billing, secrets, deployed Functions, email delivery provider, production domain or real customer records are connected.
- The CI success proves the automated checks in the listed jobs passed; it does not prove a production deployment or end-to-end behavior against a real Firebase project.

## Next implementation gate
1. Complete a focused security review of tenant authorization, member roles, invitation lifecycle, client data access, schedule mutations and booking transactions. Track each finding and add emulator tests for any uncovered behavior.
2. Review and tighten Firestore client read rules, especially client/contact records, so access follows least privilege. Keep all mutations behind trusted callable Functions.
3. Add end-to-end emulator tests for booking idempotency/replay, concurrent overlapping booking attempts, cancellation transitions, schedule/exception/block authorization, invitation expiry/wrong-email/replay, owner protection and cross-tenant denial.
4. Add explicit App Check enforcement and browser Firebase initialization only after a dedicated test Firebase project is approved and its configuration is supplied. Until then, keep all Firebase factories dormant.
5. After approval, connect preview to the dedicated test project only, run manual tablet verification, and document rollback steps. Production remains out of scope and requires separate explicit approval.
