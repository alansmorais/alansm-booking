# Product audit — preview branch

Review date: 2026-10-31  
Scope: static frontend, Firebase backend foundation and emulator test setup. No production Firebase project, customer data, secrets or production routing were accessed.

## Product goal

AlanSM Booking is a standalone, multi-tenant appointment-booking SaaS for barbershops, beauty salons and independent beauty professionals. Each business must be able to manage its own workspace, staff, services, availability, clients and appointments. Customers should eventually be able to book through a public booking page.

The product is not the AlanSM Solutions marketing website and must remain in its own repository.

## Architecture decision

**Firebase is the selected primary backend.**

- Firebase Authentication is the account identity and email-verification layer.
- Cloud Firestore is the tenant-scoped application data store.
- Firebase Cloud Functions are the authoritative boundary for tenant authorization, business rules and booking operations.
- Firebase Emulator Suite is the required environment for frontend/backend integration development and automated integration tests.
- The Google Apps Script + Google Sheets code under `apps-script/` is a legacy pilot prototype/reference only. It is not the selected SaaS backend and must not be wired into the primary application.

No second backend should be introduced without an explicit architecture review.

## What currently exists

### Frontend

- Responsive static dashboard in `public/`.
- Navigation for overview, appointments, professionals, services, clients, public booking page and settings.
- Hard-coded Portuguese demo workspace and fictitious records.
- Demo availability calculations for working hours, breaks, exceptions, blocks and overlapping appointments.
- Demo changes are persisted locally in the browser; they are not synchronized to Firestore or other devices.
- Login and registration screens exist, but `public/auth.js` currently instantiates only the demo auth adapter. The forms do not authenticate or create Firebase accounts.
- `public/firebase-auth-adapter.js` and `public/firebase-workspace-adapter.js` expose Firebase-capable factories, but the main startup path does not initialize Firebase SDKs or select those adapters.
- `public/app.js` creates demo data/workspace adapters; the main dashboard remains a local prototype.
- `public/team.js` has a Firebase-capable path, but the main app does not configure it with a live workspace adapter.
- The public booking page is explicitly unpublished. The appointment modal is demo-only.

### Firebase backend foundation

- Callable Functions include tenant creation/session retrieval, appointment creation/cancellation, schedule settings/exceptions/blocks, tenant catalog and agenda reads, and team invitation/member access operations.
- Firestore rules and indexes are present.
- Firebase Emulator Suite configuration includes Auth, Firestore and Functions emulators.
- Automated tests cover Firestore rules, callable Functions and Firebase adapter behavior.
- CI compiles Functions and runs the emulator-backed integration/security test jobs.
- Passing backend tests does not mean the frontend is connected or that real bookings are enabled.

### Legacy Apps Script prototype

- `apps-script/` contains an earlier Google Sheets/Apps Script pilot foundation.
- It is retained for reference only and is not part of the selected Firebase application flow.
- Do not create or connect a live spreadsheet or Apps Script deployment as part of the Firebase integration.

### Hosting

- Static preview is deployed from branch `preview` to Cloudflare Pages.
- Preview URL: https://preview.alansm-booking-preview.pages.dev
- `main` remains the stable branch. No production deployment is authorized by this work.

## Gaps and risks

1. **Frontend/backend separation:** the dashboard is still demo-only; Firebase adapters are not initialized or selected by the main page.
2. **Authentication:** login, registration, email verification and session restoration are not connected end-to-end.
3. **Tenant onboarding:** the callable Functions and workspace adapter exist, but the registration UI does not yet create a Firebase user and tenant.
4. **Catalog and agenda:** the backend read functions exist, but the dashboard still renders local demo data.
5. **Mutations:** dashboard appointment, schedule, professional, service and client actions are local/demo operations. They must not be presented as persisted Firebase changes.
6. **Public booking:** no customer-facing live booking journey is enabled.
7. **Untrusted input:** parts of the UI construct HTML strings and use `innerHTML`. Dynamic values must be escaped or rendered with safe DOM APIs before real user data is displayed.
8. **Commercial readiness:** subscription lifecycle, billing, plan limits and operational monitoring are not complete.
9. **Localization:** the current UI is fixed to Brazilian Portuguese, BRL and São Paulo timezone. Business-level locale, timezone and currency need explicit configuration before broader rollout.

## Implementation sequence

### Phase 1 — Safe Firebase preview foundation

- Preserve demo mode as the default.
- Add an explicit opt-in mode for local Firebase emulators only.
- Require explicit local emulator configuration; fail closed if any emulator endpoint is missing or malformed.
- Do not include production Firebase configuration or silently fall back from emulator to production.
- Add automated tests proving that default startup remains demo-only and that Firebase mode cannot initialize without emulator-only configuration.

### Phase 2 — Authentication and tenant onboarding

- Initialize Firebase Auth against the Auth emulator.
- Connect registration, login, email verification, reload and sign-out.
- Restore authenticated sessions and handle unverified accounts safely.
- Connect tenant creation and workspace selection to the existing callable Functions emulator.
- Add browser-level integration tests with synthetic accounts and tenants.

### Phase 3 — Read-only workspace integration

- Connect tenant catalog and agenda reads through callable Functions.
- Render professionals and services from the selected tenant.
- Keep demo data and Firebase data clearly separated.
- Test empty states, authorization failures, expired sessions and tenant switching.

### Phase 4 — Controlled mutations

- Connect team, schedule, client and appointment changes one domain at a time.
- Use callable Functions as the authoritative validation and persistence boundary.
- Add tests for duplicate submissions, appointment overlap, tenant isolation and rejected writes.
- Keep public booking disabled until its customer-facing flow and abuse protections are complete.

### Phase 5 — Release readiness

- Complete security review, monitoring, backup/recovery and billing decisions.
- Pilot only with synthetic data until explicit approval for a controlled real-user pilot.
- Do not enable production Firebase, real customer records, payments or public booking domains without explicit approval.

## Guardrails

- Develop only in `preview`; keep `main` unchanged.
- Keep the demo as the default and visibly label it as a demonstration.
- Firebase frontend integration must be emulator-only during this development phase.
- Never embed service-account credentials, private keys, tokens or secrets in Git or browser code.
- Do not connect the legacy Apps Script prototype to the primary application.
- Do not claim authentication, synchronization or booking persistence is live until end-to-end tests prove it.
- Do not invite real businesses to use the current preview for operational bookings.
