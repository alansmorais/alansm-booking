# Firebase Functions — onboarding foundation

This directory contains the first trusted backend endpoints for AlanSM Booking.

## Implemented
- `createTenant`: authenticated and email-verified user creates a tenant; slug reservation and owner membership are written in one Firestore transaction.
- `getSession`: returns the authenticated user's active tenant memberships and safe tenant summaries.

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
