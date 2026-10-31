# AlanSM Booking — security review gate

This checklist is a pre-activation review for the isolated `preview` branch. It is not a security certification. No production project or live customer data is in scope.

## Tenant isolation and identity
- [ ] Every callable derives the caller identity from verified Firebase Auth context; never trust a browser-supplied UID.
- [ ] Every tenant operation checks active membership in the requested tenant on the server.
- [ ] Suspended memberships and disabled users are denied on every protected operation.
- [ ] Tenant IDs are treated only as resource locators, never as authorization.
- [ ] Multi-tenant selection cannot leak data when membership is removed between requests.

## Roles and member lifecycle
- [ ] Owner-only actions cannot be performed by admins or staff.
- [ ] Admin cannot modify another admin or the owner.
- [ ] Staff cannot list members, create invitations, or change access.
- [ ] Owner membership cannot be suspended, demoted or removed by member-management callables.
- [ ] Role changes and suspension take effect on the next protected request.

## Invitations
- [ ] Tokens are generated with cryptographically secure randomness; only hashes are stored.
- [ ] Raw tokens are returned once and are not logged or persisted by the browser.
- [ ] Invitations are bound to tenant, exact normalized email, allowed role, expiry and pending status.
- [ ] Expired, replayed, wrong-email and already-used tokens are rejected transactionally.
- [ ] Invitation acceptance requires an authenticated, email-verified, non-disabled account.
- [ ] Manual token sharing is clearly identified as temporary until an email provider is approved.

## Customer and scheduling data
- [ ] Firestore rules deny client-side writes to operational records.
- [ ] Client/contact records have least-privilege read rules; staff access is explicitly justified or denied.
- [ ] Agenda responses omit unnecessary personal data and free-text notes.
- [ ] Schedule, exception and block mutations enforce owner/admin authorization and validate tenant scope.
- [ ] Audit events are written atomically with privileged mutations and cannot be edited by clients.

## Booking integrity
- [ ] Concurrent requests for the same professional/time cannot create overlapping appointments.
- [ ] Idempotency keys return the original result for an identical retry and reject altered payload reuse.
- [ ] Cancellation enforces allowed state transitions and records an audit event.
- [ ] Timezone, daylight-saving transitions, local midnight, breaks, absences and blocks are covered by tests.
- [ ] Public booking cannot bypass server-side availability and validation.

## Runtime and release
- [ ] App Check is enforced before any live customer-facing launch.
- [ ] Secrets are stored only in approved secret management; none are committed to Git.
- [ ] Emulator tests pass before a dedicated test Firebase project is connected.
- [ ] Manual tablet verification is completed against the preview environment.
- [ ] Rollback and incident-response steps are documented.
- [ ] Production activation receives separate explicit approval.

## Current known release blockers
- No Firebase project is connected and no Functions are deployed.
- App Check is not enforced because there is no approved client configuration.
- Invitation email delivery is not configured; live UI currently exposes a one-time token for private manual sharing.
- Public booking and payment processing are not live.
- Firestore client read permissions for customer/contact data require a least-privilege review before live use.
