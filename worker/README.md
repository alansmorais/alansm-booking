# AlanSM Booking API Worker

This is the separate backend planned for the Preview environment. It does not alter the static Pages project, Firebase Authentication, Firestore security rules, or production branch.

## Current status

- Firebase ID-token signature and claim verification foundation.
- Google service-account OAuth exchange foundation for Firestore REST access.
- CORS allow-list restricted to the Preview site.
- Health endpoint at `/health`.
- Business API routes intentionally return HTTP 501 until each operation is migrated and tested.

**Do not connect the website to this Worker yet.** The 21 callable operations still need to be ported with their authorization, validation, data shaping, and Firestore transaction semantics.

## Required secret (not configured yet)

Create a Cloudflare Worker secret named `GOOGLE_SERVICE_ACCOUNT_JSON` containing the complete service-account JSON. Never commit this JSON to GitHub or paste it into chat. The service account should have only the minimum Firestore permissions needed.

## Local checks

From this directory, use Wrangler to validate the configuration and run the Worker locally. Deployment is deliberately not part of this initial foundation commit.
