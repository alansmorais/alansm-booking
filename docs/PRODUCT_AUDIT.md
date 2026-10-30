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
- New appointment modal adds records only to in-memory browser state.
- Search filters demo appointment/client lists.
- Several actions are placeholders that only show toast messages.
- No account registration/login screens, tenant onboarding flow, real calendar availability, persistence, or live public booking flow.

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
2. **No real onboarding or authentication UI.** There is no path for a new business to create an account, enter its workspace, or recover access.
3. **No functional public booking journey.** The public-page screen displays a placeholder URL on the AlanSM Solutions domain; this is not a working booking page and must not be shared with customers.
4. **No persistence.** Demo records disappear on reload because they live only in JavaScript memory.
5. **No real availability engine.** There is no schedule, working-hours, breaks, holidays, booking-window or overlap calculation in the frontend/API.
6. **Backend is not an API yet.** `doPost` deliberately returns `API_NOT_ENABLED`; the service functions are not wired to HTTP routes.
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
