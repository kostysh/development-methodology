# Security, privacy, and external effects

Applies according to the real boundary of the change. This document does not
set legal policy and does not confirm compliance. The owners of the product,
security, data, and applicable legal obligations are named in the profile.

## Separation of authority

For an actor/resource/action, define the identity, allow/deny, context,
tenancy, privileges, and audit expectation. Verify the real data path under a
production identity, including available bypass interfaces. A control hidden
in the UI and a mock store are not proof of a prohibition.

A privileged path is limited to a named internal duty. Its convenience does
not permit using it for ordinary user operations. Long sessions and streams
must take revocation of a role, account, or context into account according to
the accepted policy; one permission at connection opening does not prove
continued access.

Do not widen permissions or create a hidden bypass for the sake of a test.
Diagnostics, review, and remediation have separate action boundaries. A
scanning tool does not automatically get authority to edit or make external
calls.

## Data control

Define what the system collects, derives, stores, transmits, and deletes; for
what purpose, who has access, and how long the data is needed. Check
derived/inferred data, exports, caches, logs, backups, and external
processors when they are affected. Retention, legal hold, deletion, and data
subject rights are determined by the accepted policy and a competent owner,
not by the executor's guess.

Use synthetic or permitted masked data in evidence. Do not store passwords,
tokens, OTPs, cookies, private keys, full emails, raw payloads, or unnecessary
personal snapshots. Error messages and telemetry contain safe codes, bounded
outcomes, and minimal references. Forbidden-data checks must check the actual
outputs if the change could expose data.

A secret inventory confirms that a name exists, not that the value is
correct. Credentials are limited to an environment, a recipient, and an
action. Having them does not permit reading/exporting or changing the
authorization configuration.

## Providers and side effects

For an external integration, before implementation name the accepted
contract, activation condition, credential owner, permitted payload/data,
timeout, retry, rate/cost bounds, and observable outcomes. An unknown response
does not turn into success. When a mandatory provider is absent, the runtime
returns an explicit unavailable/blocked/degraded outcome according to the
accepted contract.

Test doubles verify the system's reaction inside an isolated test. They do
not prove a sending, a payment, a document check, or any other external
effect. A local substitute must not silently switch on in the target
environment.

Before caching, determine whether a result may be reused: what freshness
means, the key, TTL/invalidation, the privacy/storage boundary, and the
permitted outcomes. A mutating provider and the obligation to make a new
external attempt may forbid caching. The existence of a cache does not by
itself grant the right to store the payload.

Losing the response after a side effect does not mean the effect did not
happen. Use the accepted idempotency/reconciliation, reading of facts, and a
durable identity. Do not blindly retry a non-idempotent action. Checks of the
domain commit, the provider receipt, and the user readback must distinguish
these states.

## Security review

Agree a bounded scope: assets, actors, trust boundaries, inputs, protected
operations, and unknowns. The reviewer establishes a reachable impact path,
preconditions, consequences, and confidence. A pattern match or scanner
output is not a proven vulnerability; the absence of findings does not prove
the whole system.

Required security, code, and spec reviews keep separate conclusions. The
profile sets the permitted tools and specialist routing without tying the
prototype to one vendor. Do not run additional external scanners just because
they are available.

On an incident, a suspected leak, corruption, or loss of evidence
reliability, stop the affected path, keep the minimal safe facts, and pass the
decision to the owner. Remediation does not automatically extend the scope of
the original task.
