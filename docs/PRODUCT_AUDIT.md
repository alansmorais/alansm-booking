# Product audit — preview branch

Review date: 2026-10-30  
Scope: current static frontend and Apps Script pilot foundation. No production systems or customer data were accessed.

## Product goal

AlanSM Booking is a standalone, multi-tenant appointment-booking SaaS for barbershops, beauty salons and independent beauty professionals. Each business must be able to manage its own workspace, staff, services, availability, clients and appointments. Customers should eventually be able to book through a public booking page.

The product is not the AlanSM Solutions marketing website and must remain in its own repository.

## What currently exists

### Frontend
- Responsive static dashboard in `public/`.
- Navigation for overview, appointments, professionals, services, clients, public booking page and settings.
- Hard-coded Portuguese demo workspace and fictitious records.
- New appointment modal adds records only to the local demonstration state.
- Demo data is persisted in this browser with `localStorage`; it is not synchronized to a backend or other devices.
- The demo includes client-side availability calculations for working hours, breaks, exceptions, blocks and overlapping appointments.
- Login and registration screens exist, but `public/auth.js` instantiates only the demo auth adapter, whose sign-in and registration methods deliberately reject requests.
- Firebase Auth and Firebase workspace adapters exist as modules, but the main app does not initialize or connect them.
- The dashboard (`public/app.js`) always creates demo data/workspace adapters; appointment, schedule, professional, service and client operations remain local demo operations.
- The team module contains a Firebase-capable rendering path, but the main app does not configure it with a Firebase workspace adapter.
- The public booking page is explicitly marked as not published; there is no live public booking journey.

### Backend foundation
- Apps Script spreadsheet schema for tenants, users, professionals, services, appointments, clients, audit events, idempotency keys and revoked tokens.
- Non-destructive schema setup and read-only schema inspection.
- Initial password hashing, signed session and authentication service functions.
- HTTP handlers intentionally remain disabled and return a bootstrap/fail-closed response.
- No live spreadsheet or Apps Script deployment is connected.
- Authentication functions have not yet been validated in a real Apps Script runtime.

### Hosting
- Static preview deployed to Cloudflare Pages from branch `preview`.
- Preview deployment URL: https://preview.alansm-booking-preview.pages.dev
- Production branch remains `main`; production deployments are disabled.

## Gaps and risks found

1. **Demo vs real operation is easy to confuse.** The dashboard has explicit demo labels, but its primary actions resemble real business workflows.
2. **Authentication and onboarding are not connected.** The screens exist, but the entry point still uses the demo adapter; users cannot register or sign in through the product UI.
3. **Firebase adapters are not wired into the main dashboard.** Backend callable functions and client adapters exist, but the main dashboard still creates demo-only adapters and does not read or write live tenant data.
4. **No functional public booking journey.** The public-page screen correctly states that it is not published; there is no customer-facing booking flow.
5. **Demo persistence is browser-local only.** `localStorage` preserves fictitious demo state in one browser, but it is not a server database, cross-device sync, or customer-data persistence.
6. **Availability is demo-only on the frontend.** The local calculator handles schedules, breaks, exceptions, blocks and overlaps, while the authoritative booking validation is in Firebase Functions; the UI is not yet calling those functions for bookings.
7. **The older Apps Script API remains disabled.** Its `doPost` deliberately returns `API_NOT_ENABLED`; it is a separate pilot foundation and is not the current Firebase Functions API.
7. **Security/runtime validation remains incomplete.** PBKDF2 cost needs Apps Script benchmarking; JWT test vectors, token revocation, tenant isolation, abuse controls, origin/CSRF strategy, formula injection protection and concurrency tests remain required.
8. **Frontend rendering needs hardening before accepting untrusted input.** The UI builds HTML strings and inserts them with `innerHTML`; user-provided values must be safely escaped or rendered with DOM text APIs before any real user data is displayed.
9. **Business model and plan enforcement are only placeholders.** A trial is represented in registration logic, but subscription lifecycle, limits and billing are not implemented.
10. **Localization is currently fixed to Brazilian Portuguese, BRL and São Paulo timezone.** These are reasonable pilot defaults, but business-level locale/timezone/currency behavior needs explicit product decisions before broad rollout.

## Recommended implementation order

### Phase 1 — Make the frontend a coherent, honest prototype
- Add an explicit demo-only onboarding entry point and sign-in/register screen designs, without pretending authentication is live.
- Remove the fake `booking.alansmsolutions.com` address and label the public booking page as not yet published.
- Make the demo state and all placeholder actions unmistakable.
- Add safe rendering/escaping for every dynamic value before user-entered data is supported.
- Add an actual weekly availability/calendar model to the demo, including working hours and blocked time.

### Phase 2 — Finish and validate the pilot backend
- Create a private dedicated Apps Script project and spreadsheet only after explicit approval.
- Benchmark password hashing and test JWT signing/verification in GAS.
- Complete tenant-scoped repository methods and server-side validators.
- Implement API routing only after authentication, authorization, origin strategy, locking, idempotency and audit controls are ready.
- Test tenant boundaries, appointment overlap, duplicate requests, expiry/revocation and spreadsheet formula injection.

### Phase 3 — Connect the frontend safely
- Introduce a frontend API adapter with a local mock adapter as the default.
- Keep mock and live modes visibly distinct.
- Add registration/login, workspace setup, staff/service setup and real appointment flows.
- Connect the public booking page only after availability and booking endpoints pass tests.

### Phase 4 — Controlled pilot and commercial readiness
- Pilot with one test business and synthetic data.
- Add plan limits, trial expiry behavior, billing integration and operational monitoring.
- Perform a security review before accepting real customer information or payments.

## Guardrails

- Develop only in `preview`; keep `main` stable.
- Keep this repository separate from AlanSM Solutions website repositories.
- Do not connect real customer data, external spreadsheet IDs, secrets, payment providers or production domains without explicit approval.
- Do not claim bookings, authentication or billing are live until end-to-end tests prove them.


## Follow-up review — 2026-10-31

Scope: static review of the current `preview` branch at commit `9c36a78d3e330be553c7c6a4735d7821c5e28b73`. No Firebase production project, customer data, secrets or production routing were accessed.

### Confirmed frontend wiring status

- `public/auth.js` calls `BookingAuth.createDemoAdapter()`; the login and registration forms therefore cannot authenticate or create accounts.
- `public/app.js` calls `BookingData.createDemoAdapter(state)` and `BookingWorkspace.createDemoWorkspaceAdapter(...)`; the primary dashboard remains in demo mode.
- `public/firebase-auth-adapter.js` and `public/firebase-workspace-adapter.js` expose Firebase-capable adapter factories, but no Firebase SDK initialization or adapter selection is present in the current main-page startup path.
- `public/team.js` supports a live Firebase mode only after explicit `configureLive()`; the main dashboard currently does not call it.
- Demo changes are saved to browser `localStorage`, not Firestore.
- The booking page is marked unpublished, and the appointment modal labels its writes as demonstration-only.

### Next implementation sequence

1. Keep the demo as the default and preserve the explicit demo warning.
2. Add a separate, opt-in Firebase preview configuration path using emulator-only settings first; do not embed production credentials or silently switch modes.
3. Connect authentication and tenant onboarding to the existing Firebase adapters and callable functions, then add emulator integration tests for the browser flow.
4. Connect catalog and agenda reads before enabling any real writes.
5. Connect schedule, team, client and appointment mutations one domain at a time, with server-side validation and integration tests.
6. Keep public booking disabled until a customer-facing endpoint and abuse protections are implemented and tested.

### Release decision

The frontend is a functional local prototype, not yet a connected SaaS workspace. Do not invite real businesses to use it for operational bookings. Keep `main` unchanged and do not connect production Firebase, real customer records, payment providers or public booking domains without explicit approval.
