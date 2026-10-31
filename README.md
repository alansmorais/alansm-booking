# AlanSM Booking

Standalone multi-tenant booking SaaS for barbershops, beauty salons, and independent beauty professionals.

## Repository workflow
- `main`: stable branch; kept untouched during current development.
- `preview`: development and validation branch.
- This repository is independent from the AlanSM Solutions marketing website.

## Architecture decision
**Firebase is the selected primary backend for the SaaS.**
- Firebase Authentication handles account identity and email verification.
- Cloud Firestore stores tenant-scoped application data.
- Firebase Cloud Functions enforce authorization and business rules for workspace and booking operations.
- Firebase Emulator Suite is the required environment for frontend/backend integration development and automated tests.
- The Google Apps Script + Google Sheets code under `apps-script/` is a legacy pilot prototype/reference only. It is not the selected production architecture and must not be wired into the primary application.

Do not introduce a second backend or migrate the primary architecture without an explicit architecture review.

## Current preview status
- Responsive static dashboard with overview, weekly calendar, appointments, professionals, services, clients, public booking page placeholder and settings.
- Demo availability engine intersects configurable company opening hours, each professional's individual weekly schedule, breaks, date exceptions, blocked time, service duration and appointment overlap checks.
- Demo data is fictitious and held locally in the browser; it is not synchronized to Firebase.
- On the isolated `firebase-emulator-bootstrap` branch, Auth Emulator login/registration, email verification and tenant onboarding are wired through Firebase Auth/Functions compat adapters. The successful Firebase session is shown separately; it does not expose demo dashboard data as real data.
- The operational dashboard, catalog/agenda reads and persistent mutations are not yet integrated. The default app remains demo mode.
- The public booking journey is not published or connected.
- Server-side booking validation and Firestore security rules have automated emulator tests. This does not mean the user-facing SaaS is connected or ready for real bookings.

## Safety and release rules
- Keep the demo as the default application mode.
- Firebase frontend integration must be explicitly opt-in and emulator-only during development.
- Never embed production credentials or enable a production Firebase project through a preview flag.
- No production deployment, real customer data, payment provider, DNS or public booking domain may be connected without explicit approval.
- Do not put credentials, tokens, project secrets or personal customer data in Git.
- Do not accept real bookings until authentication, tenant authorization, availability validation, idempotency, concurrency handling, audit controls and end-to-end tests are complete.
- Develop only in `preview`; keep `main` stable.

## Development sequence
1. Keep demo mode intact and make the emulator path explicit and fail-closed. **Complete on the isolated emulator branch.**
2. Connect Firebase SDK initialization to local Auth, Firestore and Functions emulators only. **Complete on the isolated emulator branch.**
3. Wire registration, login, email verification and session restoration. **Implemented; requires local end-to-end confirmation.**
4. Wire tenant creation and workspace selection. **Tenant creation/session read implemented; workspace UI selection remains.**
5. Connect catalog and agenda reads.
6. Implement schedule, team, client and appointment operations one domain at a time, with server-side validation and emulator integration tests.
7. Keep public booking disabled until its customer-facing flow and abuse protections are implemented and tested.
8. Perform a security and operational review before any controlled pilot with real users.

## Online preview
The current static preview is available at:

https://preview.alansm-booking-preview.pages.dev

It is deployed from the `preview` branch. The preview is not a production service and does not process real bookings.
