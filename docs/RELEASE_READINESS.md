# Release readiness — 2026-10-31

## Verified source state

Branch: `firebase-emulator-bootstrap`  
Commit: `54b8d7039f4895b0028a36caff1215759d3b145b`  
Production branch and production services remain untouched.

## Automated validation

The GitHub Actions checks for the commit above completed successfully:
- Cloudflare Pages preview deployment.
- Firebase Functions TypeScript compilation.
- Firestore security rules emulator tests.
- Firebase Auth + callable Functions integration tests.
- Frontend/configuration validation.
- Local-only emulator bootstrap validation.

These checks validate source and local emulator behavior. They do not prove that a real Firebase project is configured or that live bookings work.

## What is implemented in source

- Portuguese (Brazil) responsive dashboard and local demo data adapter.
- Browser-only demo persistence and availability simulation.
- Firebase Auth adapter and Firebase workspace adapter.
- Firebase SDK bootstrap with explicit emulator mode restricted to localhost.
- A separate opt-in development mode restricted to the named preview host and a remote development config endpoint.
- Trusted Functions for tenant onboarding/session, member invitations and access, catalog reads/writes, schedule administration, agenda reads and appointment operations.
- Firestore rules and emulator tests for tenant isolation and role boundaries.
- Firebase dashboard adapter source for translating catalog, schedule and agenda reads.

## Important integration boundary

The main dashboard entry point `public/app.js` still initializes the demo data and demo workspace adapters directly. The customer booking page `public/book.html` and `public/book.js` use the local demo booking engine. Therefore the Firebase adapters and backend functions are not yet the active data path for the dashboard or public booking journey.

The sign-in/onboarding UI and emulator scaffolding must be validated end-to-end in a browser against the local emulators. A green CI run is not a substitute for that manual browser acceptance test.

## Not ready for real customers

- No dedicated Firebase development project is connected or verified.
- No real Firebase Auth/Firestore/Functions end-to-end run has been performed.
- No live dashboard CRUD flow has been accepted end-to-end.
- Public booking is still a fictitious local demo; no public booking backend/availability journey is ready.
- Email invitation delivery is not configured; invitation delivery is manual.
- App Check is not enforced by the callable functions (`enforceAppCheck: false`).
- Rate limiting/abuse controls, operational monitoring, backup/retention and deployment runbooks need final review.
- No production release or real customer data.

## Safe next steps

1. Finish the local browser acceptance flow with Auth, Firestore and Functions emulators: register, verify email, sign in, create tenant, restore session, select tenant, invite/accept a member, and test role restrictions.
2. Wire the dashboard shell to select the Firebase adapters only when the explicit development/emulator mode is active; keep demo as default and fail closed on Firebase errors.
3. Connect catalog, schedule, team and agenda screens to the existing trusted Functions one domain at a time, with UI-level tests.
4. Implement the public booking backend and customer journey separately, including abuse protection and idempotency.
5. Configure invitation email delivery using an approved provider.
6. Configure a dedicated Firebase development project, App Check, secrets and monitoring only after explicit authorization.
7. Run full end-to-end acceptance and a security review before any controlled pilot.

## Guardrails

- Do not merge to `main`, deploy production, create billable resources, configure real domains, or connect real customer data without explicit approval.
- Never describe demo records as real bookings or browser-local persistence as cloud persistence.
- Never ask users to enter real credentials into a demo-only form.
