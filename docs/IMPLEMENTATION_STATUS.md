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
