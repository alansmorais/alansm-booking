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
- Firebase Auth and workspace adapter modules and callable Functions exist, but the primary frontend startup path still uses demo adapters.
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
1. Keep demo mode intact and make the emulator path explicit and fail-closed.
2. Connect Firebase SDK initialization to local Auth, Firestore and Functions emulators only.
3. Wire registration, login, email verification and session restoration.
4. Wire tenant creation and workspace selection.
5. Connect catalog and agenda reads.
6. Implement schedule, team, client and appointment operations one domain at a time, with server-side validation and emulator integration tests.
7. Keep public booking disabled until its customer-facing flow and abuse protections are implemented and tested.
8. Perform a security and operational review before any controlled pilot with real users.

## Local Firebase Emulator development

The browser SDK is initialized only when both conditions are true:
- The app is served from `localhost`, `127.0.0.1` or `::1`.
- The URL includes `?firebaseEmulator=1`.

Example local workflow (run the commands in separate terminals):

```bash
# Terminal 1 — start local Firebase services; never point this command at a real project.
firebase emulators:start --only auth,firestore,functions --project demo-alansm-booking

# Terminal 2 — serve the static frontend.
python -m http.server 4173 --directory public
```

Open `http://localhost:4173/?firebaseEmulator=1` to load the local Firebase SDK and connect
Auth (9099), Firestore (8080) and Functions (5001) to loopback only. Open
`http://localhost:4173/` for the normal demo experience.

The emulator bootstrap uses a fixed demo project ID and placeholder API key. It refuses
to initialize on preview or production hostnames, and does not read Firebase configuration
from query parameters, browser storage, or remote runtime settings. The bootstrap does not
switch the current login or dashboard adapters to Firebase; that wiring is a later development
phase. Until then, the demo remains the only user-facing application mode.

Automated bootstrap checks: `npm run test:firebase-init`.

## Online preview
The current static preview is available at:

https://preview.alansm-booking-preview.pages.dev

It is deployed from the `preview` branch. The preview is not a production service and does not process real bookings.
