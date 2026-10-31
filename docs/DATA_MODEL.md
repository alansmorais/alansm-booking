# AlanSM Booking — pilot data model

## Tenant boundary
Every business-owned record must carry a `tenantId`. Backend handlers must derive tenant identity from a verified session, never trust a tenant ID supplied by the browser. Queries and writes must always be scoped to the verified tenant.

## Tables
- **Tenants** — business account, plan, trial, timezone and currency.
- **Users** — login identity and tenant role.
- **Professionals** — staff members who provide services.
- **Services** — duration and price in minor currency units (for example, centavos).
- **Clients** — customer contact details.
- **Appointments** — booking lifecycle, service snapshot reference, time interval and idempotency key.
- **AuditLog** — security-relevant actions without passwords, tokens or unnecessary personal data.
- **IdempotencyKeys** — prevents duplicate processing of retried requests.
- **RevokedTokens** — session revocation records.

## Invariants to enforce server-side
1. A user may access only records in the tenant bound to their verified session.
2. Service, professional, client and appointment IDs must belong to the same tenant.
3. Appointment duration and price must be loaded from the tenant's service record; never trust client-submitted price/duration.
4. Appointment intervals must not overlap for the same professional.
5. Appointment creation must use a lock and idempotency key.
6. Cancellation and status transitions require authorization and must be audited.
7. User-facing errors must not reveal whether another tenant's IDs exist.
8. Spreadsheet formula injection must be neutralized for untrusted text.
9. Missing secrets or invalid configuration must fail closed.
10. Store money as integer minor units, not floating point.

## Status
This is a design contract, not proof that the handlers have been implemented or tested.
