# AlanSM Booking

Standalone multi-tenant booking SaaS for barbershops, beauty salons, and nail professionals.

## Repository workflow
- `main`: stable branch; kept untouched during current development.
- `preview`: development and validation branch.
- This repository is independent from the AlanSM Solutions marketing website.

## Current preview status
- Responsive dashboard UI with overview, appointments, professionals, services, clients, public booking page placeholder and settings.
- Demo data is fictitious and held in browser memory only.
- Initial Google Apps Script pilot foundation and spreadsheet schema are in `apps-script/`.
- Data model and server-side invariants are documented in `docs/DATA_MODEL.md`.
- HTTP API intentionally remains disabled/fail-closed.

## Pilot architecture decision
Google Sheets + Google Apps Script is the selected pilot direction. The earlier Firebase prototype remains a reference/rollback option and is not silently substituted.

## Safety
- No production deployment has been performed.
- No external spreadsheet, Apps Script project, payment provider, DNS or live customer data has been connected.
- Do not put credentials, tokens, spreadsheet IDs or personal customer data in Git.
- Do not enable booking endpoints before authentication, tenant authorization, locking, idempotency, validation and security tests are implemented.

## Development plan
1. Complete the backend authentication and authorization design.
2. Implement tenant-scoped repositories and validated booking operations.
3. Add a frontend adapter with local mock as the default.
4. Test concurrency, duplicate submissions, cross-tenant access, token expiry/revocation and input sanitization.
5. Only then prepare a controlled pilot deployment.
