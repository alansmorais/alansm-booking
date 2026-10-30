# AlanSM Booking

Standalone multi-tenant booking SaaS for barbershops, beauty salons, and nail professionals.

## Repository workflow
- `main`: stable branch; kept untouched during current development.
- `preview`: development and validation branch.
- This repository is independent from the AlanSM Solutions marketing website.

## Current preview status
- Responsive static dashboard UI with overview, appointments, professionals, services, clients, public booking page placeholder and settings.
- Demo data is fictitious and held in browser memory only.
- Initial Google Apps Script pilot foundation and spreadsheet schema are in `apps-script/`.
- Data model and server-side invariants are documented in `docs/DATA_MODEL.md`.
- Product audit and recommended implementation sequence are documented in `docs/PRODUCT_AUDIT.md`.
- HTTP API intentionally remains disabled/fail-closed; real authentication, booking and persistence are not connected.

## Pilot architecture decision
Google Sheets + Google Apps Script is the selected pilot direction. The earlier Firebase prototype remains a reference/rollback option and is not silently substituted.

## Safety
- No production deployment has been performed.
- No external spreadsheet, Apps Script project, payment provider, DNS or live customer data has been connected.
- Do not put credentials, tokens, spreadsheet IDs or personal customer data in Git.
- Do not enable booking endpoints before authentication, tenant authorization, locking, idempotency, validation and security tests are implemented.

## Development plan
1. Make the demo frontend honest, secure and coherent, including availability/calendar behavior.
2. Validate authentication in a real Apps Script runtime.
3. Implement tenant-scoped repositories and validated booking operations.
4. Add a frontend adapter with local mock as the default.
5. Test concurrency, duplicate submissions, cross-tenant access, token expiry/revocation and input sanitization.
6. Only then prepare a controlled pilot deployment.

## Online preview
The current static preview is available at:

https://preview.alansm-booking-preview.pages.dev

It is deployed from the `preview` branch. The `main` branch remains the stable branch and production deployments are disabled. The preview contains fictitious browser-only data; no real bookings are processed.
