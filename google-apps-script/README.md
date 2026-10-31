# Google Sheets + Apps Script backend (development)

This is the planned first shared-data backend for AlanSM Booking. It is deliberately
not active by default and has not been deployed or connected to a real spreadsheet.

## Data flow

Browser -> same-origin Cloudflare Pages Function `/api/booking` -> Apps Script Web App -> dedicated Google Spreadsheet.

The browser never receives the Apps Script API token. Administrative snapshot operations
are additionally restricted by the Cloudflare Access identity email configured in
`BOOKING_ADMIN_EMAIL`. Keep the preview protected by Cloudflare Access.

## Development setup (only when ready)

1. Create a NEW Google Spreadsheet used only for AlanSM Booking development. Do not
   reuse a personal/business production spreadsheet.
2. Create a standalone Google Apps Script project and paste `Code.gs` from this folder.
3. In Apps Script > Project Settings > Script Properties, set:
   - `SPREADSHEET_ID`: the development spreadsheet ID.
   - `API_TOKEN`: a long random secret (at least 32 random bytes).
4. Deploy as a Web App, execute as the script owner. The Web App endpoint is stored
   only in Cloudflare Pages **Preview** variables.
5. Set Cloudflare Pages Preview variables:
   - `GAS_WEB_APP_URL`: deployed Apps Script /exec URL.
   - `GAS_API_TOKEN`: same secret as Script Property API_TOKEN.
   - `BOOKING_ADMIN_EMAIL`: the single authorized Cloudflare Access email.
6. Keep Production variables empty. Do not remove Cloudflare Access from the preview.
7. Call `POST /api/booking` with `{"action":"health"}` after deployment.

## API actions

- `health`: checks configuration and creates the expected tabs.
- `get_snapshot`: returns all company collections; admin only through the proxy.
- `save_snapshot`: replaces one company's collection rows; admin only through the proxy.
- `public_catalog`: returns the public service/professional/schedule data for a company.
- `create_booking`: validates service, professional, schedule, breaks, blocks and
  overlapping reservations under Apps Script LockService, then stores appointment
  and upserts the client.

Collections/tabs: companies, users, services, professionals, schedules, clients,
appointments, blocks, exceptions, subscriptions.

Every record is stored with `id`, `companyId`, JSON `payload`, and `updatedAt`.
The first iteration uses a row-per-record JSON payload to preserve flexible fields.
For a small pilot (10–15 companies), this keeps the schema manageable; quotas and
latency must be monitored.

## Current limitations / integration still required

- The existing dashboard and booking page still run in browser-local demo mode.
- Existing demo catalog rows are arrays; the API's persisted records use objects with
  stable IDs. An explicit migration/adapter is required before switching modes.
- Schedule records must use `{ professionalId, days: { "1": [{start,end,breaks:[]}] } }`.
- Service records must include `{id,name,duration,price,active}`; professional records
  must include `{id,name,active}`.
- Company identity and admin session must be wired to the SaaS authentication flow.
  The preview Access email check is a development guard, not a substitute for
  production user authentication or tenant membership authorization.
- Public booking rate limiting, bot protection (Turnstile), consent/retention rules,
  backup/export, and error monitoring are required before public launch.
- Images should be stored in Drive or another object store; Sheets should keep only
  a file ID / public delivery URL, not large base64 image strings.

Do not claim cross-device synchronization until the API is deployed, configured,
integrated into both browser experiences, and tested from separate devices/browsers.
