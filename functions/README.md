# Firebase Functions — onboarding foundation

This directory contains the first trusted backend endpoints for AlanSM Booking.

## Implemented
- `createTenant`: authenticated and email-verified user creates a tenant; slug reservation and owner membership are written in one Firestore transaction.
- `getSession`: returns the authenticated user's active tenant memberships and safe tenant summaries.
- `cancelAppointment`: owner/admin-only cancellation scaffold; validates active membership and tenant state, applies an allowed status transition and writes the audit event in the same Firestore transaction.

`createAppointment`: authenticated booking creation; reads duration and price from the service record, checks active membership and referenced records, serializes booking attempts with per-professional/per-UTC-day transaction guards, checks overlapping appointments, and stores an idempotency record plus audit event atomically.

`createAppointment` is not ready for real bookings: working hours, breaks, leave, date exceptions, professional schedules and timezone-aware availability are not yet validated. Booking endpoints are not connected to the frontend and require emulator integration tests before use.

## Schedule data contract for `createAppointment`

Before this callable can be used, trusted setup code must create these tenant-scoped documents:

- `scheduleSettings/company` and `scheduleSettings/professional_{professionalId}` with `{ days: { "0": [], "1": [{ start: "09:00", end: "18:00", breaks: [{ start: "12:00", end: "13:00" }] }] } }`. Day keys follow JavaScript weekday numbering: Sunday `0` through Saturday `6`.
- `scheduleExceptions/{YYYY-MM-DD}` to mark a company closure.
- `professionalExceptions/{professionalId}_{YYYY-MM-DD}` to mark a professional absence for that date. Multi-day absences must create one document per affected local date.
- `blocks` documents with `{ date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", professionalId?: "..." }`. Omit `professionalId` for a company-wide block.

Dates and clock times are interpreted in the tenant's IANA timezone. The current callable rejects appointments crossing local midnight. These records must be written by trusted backend setup handlers, not by browser clients.

## Security notes
- These functions use Firebase Admin SDK, which bypasses Firestore Security Rules. Every handler must validate identity, membership, role, tenant ownership and input independently.
- The browser must never send a trusted tenant identity for authorization.
- `createTenant` requires Firebase Authentication and a verified email.
- App Check is not enforced yet because no Firebase client/project is configured. Enable and enforce it before public launch.
- No password is handled by these functions. Firebase Authentication owns credentials.
- Never log auth tokens, passwords, client records or unnecessary personal data.

## Local development
1. Install Node.js 20.
2. Run `npm install` inside this directory.
3. From the repository root, run `firebase emulators:start --only auth,firestore,functions`.
4. Create a test Auth user in the Auth Emulator and mark its email verified.
5. Call the functions through the Functions Emulator.
6. Add automated tests for duplicate slugs, unverified/disabled users, tenant isolation, role checks and transaction retries before integration.

No Firebase project, billing account, credentials, or production deployment is configured by this repository change.
