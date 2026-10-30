# Google Apps Script pilot backend

This is a bootstrap foundation, not a production-ready API.

## Included
- Versioned spreadsheet schema and non-destructive setup.
- PBKDF2-HMAC-SHA256 password hashing (12,000 iterations; benchmark and tune in GAS before pilot).
- HS256 signed sessions with an 8-hour expiry and revocation list.
- First-tenant registration, login, current-user lookup and logout service functions.
- Tenant identifiers embedded in verified session claims.
- Fail-closed HTTP API shell until the remaining business handlers are implemented.

## Configure only in a private Apps Script project
Script Properties:
- `SPREADSHEET_ID`: ID of the dedicated pilot spreadsheet.
- `AUTH_SECRET_KEY`: random secret with at least 32 characters. Generate/store privately; never commit it.

## Frontend preview persistence

The browser preview currently saves fictitious workspace data in versioned `localStorage` under `alansm-booking-demo-v1`. This preserves demo appointments, schedules, professionals, services, clients, blocks and date exceptions across reloads in the same browser profile. It is **not** a database, is not encrypted, is not shared across devices or users, and must never be used for real customer data. Clearing browser storage removes it. This is a temporary UX bridge while the authenticated Sheets API is implemented and reviewed.

## Important
The HTTP API is deliberately not wired to registration/login yet. The service functions require a configured spreadsheet schema and secret. Do not deploy or use with real customer data until runtime benchmarks, endpoint validation, abuse controls, tenant-isolation tests, CSRF/origin strategy for browser use, and independent security review are complete.

## Safe setup
1. Create a dedicated spreadsheet.
2. Create a standalone Apps Script project.
3. Copy all `.gs` files from this directory.
4. Set the two Script Properties above.
5. Run `inspectDatabaseSchema()` and inspect the result.
6. Run `setupDatabase()` only after confirming the spreadsheet.
7. Benchmark password hashing and verify JWT test vectors in the GAS runtime.
8. Keep the web app undeployed until API hardening is complete.
