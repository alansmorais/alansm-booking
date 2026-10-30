# AlanSM Booking — implementation status

## Current branch
Development work is on `preview`. The `main` branch remains untouched after repository initialization.

## Implemented in this first slice
- Responsive Portuguese (Brazil) dashboard shell.
- Navigation for overview, appointments, professionals, services, clients, public booking page, and settings.
- Demonstration metrics and clearly labelled fictitious sample records.
- Client-side demonstration appointment form.
- Search in appointments and clients.
- Mobile navigation.
- No external API calls, payment processing, authentication, or real booking writes.

## Important limitations
All records are in-memory demo data and reset when the page reloads. The dashboard is not connected to Google Sheets, Apps Script, or Firebase. The public booking URL is illustrative only. No production deployment or external service activation has occurred.

## Next implementation phases
1. Confirm/reconstruct the data model and tenant boundaries.
2. Build Apps Script backend modules and spreadsheet schema.
3. Implement standalone authentication and role-based access.
4. Connect frontend through a storage/API adapter with local mock as the default.
5. Add server-side booking validation, locking, idempotency, cancellation authorization, and audit logging.
6. Run tests and security review before any pilot deployment.

## Previous project decisions to preserve
- Google Sheets + Google Apps Script is the selected pilot direction.
- Firebase prototype remains a reference/rollback option; do not silently switch production architecture.
- Keep local mock/demo mode as the default until external configuration is explicitly approved.
