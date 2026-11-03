# AlanSM Booking API Worker

This is the separate backend planned for the Preview environment. It does not alter the static Pages project, Firebase Authentication, Firestore security rules, or production branch.

## Current status

- Firebase ID-token signature and claim verification.
- Firebase Identity Toolkit account lookup for email verification and disabled-account checks.
- Google service-account OAuth exchange foundation for Firestore REST access.
- Firestore REST transaction abstraction with explicit begin/read/write/commit/rollback phases, value encoding, and read-before-write enforcement.
- CORS allow-list restricted to the Preview site.
- Health endpoint at `/health`.
- Migrated operations:
  - `POST /api/createTenant`: validates onboarding data and atomically creates the tenant, slug reservation, and owner membership.
  - `POST /api/getSession`: returns the authenticated user's active memberships and active tenant summaries.
- Other business API routes still return HTTP 501 until migrated.

**Do not connect the website to this Worker yet.** These two operations have unit-level validation coverage, but have not been tested end-to-end against a deployed Worker and the live Firestore project. The remaining 19 callable operations still need to be ported with their authorization, validation, data shaping, and Firestore transaction semantics.

## Required Cloudflare configuration (not configured yet)

- Secret `GOOGLE_SERVICE_ACCOUNT_JSON`: complete service-account JSON. Never commit this JSON to GitHub or paste it into chat.
- Variable `FIREBASE_WEB_API_KEY`: the Firebase project's existing web API key. This is a public Firebase client configuration value, not a private service-account credential.
- Variable `ALLOWED_ORIGINS`: exact Preview site origins only.

The service account should have only the minimum Firestore permissions needed. Keep Firebase Authentication and Firestore security rules unchanged.

## Local checks

From this directory, use Wrangler to validate the configuration and run the Worker locally. Deployment is deliberately disabled until the remaining operations and security tests are complete.
