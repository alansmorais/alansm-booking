# Google Apps Script pilot backend

This directory contains the first, deliberately limited backend foundation.

## Included
- Versioned spreadsheet schema for tenants, users, professionals, services, appointments, clients, audit events, idempotency keys and revoked tokens.
- A manual, non-destructive schema initializer.
- A schema diagnostic that reports tab/header presence only.
- A fail-closed HTTP API shell. It does not read or write tenant data.

## Not included yet
Authentication, password hashing, token issuance/verification, tenant-scoped repositories, public availability, appointment creation/cancellation, rate limiting, locking and audit event handlers. Do not deploy this as a booking API.

## Safe setup sequence (later, after approval)
1. Create a dedicated, empty Google Spreadsheet for the pilot.
2. Create a standalone Apps Script project owned by the platform operator.
3. Copy the files from this directory into the Apps Script project.
4. In Project Settings > Script Properties, set `SPREADSHEET_ID` to the spreadsheet ID. Do not commit the ID.
5. Run `inspectDatabaseSchema()` first and inspect the result.
6. Run `setupDatabase()` manually only after confirming the target spreadsheet is correct.
7. Do not deploy a web app until authentication and authorization are implemented and independently tested.

The initializer creates missing tabs and headers. It does not clear tabs, delete rows or overwrite existing headers. A header mismatch stops setup for that tab.
