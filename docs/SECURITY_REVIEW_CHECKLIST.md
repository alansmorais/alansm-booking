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
- [x] Integration tests cover staff denial for member invitations/access, catalog mutation, schedule settings and schedule blocks.
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
- [x] Schedule, exception and block mutations enforce owner/admin authorization and validate tenant scope; block updates preserve original creation metadata.
- [x] Schedule read responses whitelist valid weekday periods and break fields, excluding unexpected stored fields.
- [ ] Audit events are written atomically with privileged mutations and cannot be edited by clients.

## Booking integrity
- [x] Integration test covers concurrent requests for the same professional/time; exactly one booking succeeds.
- [x] Integration test covers idempotent retries and rejects altered payload reuse.
- [x] Integration tests cover cancellation replay, simultaneous cancellation, one audit event, staff denial and invalid document IDs.
- [ ] Independently verify all appointment state transitions and cancellation ownership rules against product requirements.
- [ ] Timezone, daylight-saving transitions, local midnight, breaks, absences and blocks are covered by tests.
- [ ] Public booking cannot bypass server-side availability and validation.

## Runtime and release
- [ ] App Check is enforced before any live customer-facing launch. **Not currently actionable:** no Firebase project is connected and no approved web App Check provider/site key is configured. Do not turn on enforcement or add placeholder keys.
- [ ] Secrets are stored only in approved secret management; none are committed to Git.
- [ ] Emulator tests pass before a dedicated test Firebase project is connected.
- [ ] Manual tablet verification is completed against the preview environment.
- [ ] Rollback and incident-response steps are documented.
- [ ] Production activation receives separate explicit approval.

## Current known release blockers
- No Firebase project is connected and no Functions are deployed; integration tests use the emulator scaffold only.
- App Check is not enforced because there is no approved client configuration. Enabling it requires an approved development Firebase project, registered web app, selected provider (reCAPTCHA Enterprise or supported alternative), site key, frontend token integration and emulator/preview verification.
- Invitation email delivery is not configured; live UI currently exposes a one-time token for private manual sharing.
- Public booking and payment processing are not live.
- Firestore client read permissions for customer/contact data require a least-privilege review before live use.


## Review progress — 2026-10-31

The preview branch now includes integration coverage for:
- Staff denial when attempting catalog and company schedule mutations.
- Concurrent cancellation: only one state transition and one audit event.
- Invalid cancellation document identifiers.
- Concurrent booking conflict handling, booking idempotency, altered-key reuse, cross-tenant denial and closed-hours rejection.

These are automated test assertions in the repository, not evidence of a deployed Firebase backend. The Functions source is still not deployed. App Check remains a release blocker until a dedicated development Firebase project and client provider configuration exist. The public preview remains a UI/demo environment; do not treat it as a live booking service.


## Additional schedule hardening — 2026-10-31
- [x] Schedule block updates preserve original creation timestamp and creator; missing block IDs fail closed.
- [x] Schedule read API returns only valid weekday periods and approved break fields; malformed periods become empty and unknown weekday keys/extra fields are omitted.
- [x] Emulator integration tests cover both behaviors.
- [ ] Confirm the new CI run for the active `firebase-emulator-bootstrap` branch before marking this latest change set green.
