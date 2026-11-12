# Data, migrations, and compatibility

Applies when persistent state, the schema, data access permissions, reference
data, imports, or a legacy transition change. The concrete DBMS, generator,
transactional capabilities, and commands belong to the profile and the
architecture.

## Canonical path

Identify the owner of the schema/data, the permitted application path,
validation, authorization, transaction boundaries, and history/audit. Success
over a privileged connection does not prove behavior under the identity of a
real user.

A schema/data change is kept as a reproducible versioned transformation. Do
not replace it with a manual edit of a running database. Direct diagnostic
access is permitted only within the permitted boundary, after naming the
question and the reason why the standard means are insufficient. If
diagnostics changed the state, earlier acceptance evidence is invalid until
the standard state is reproduced.

The migration generator and a descriptive name are used according to the
project's rules. A successful apply or the existence of a table does not prove
correct behavior, preservation of data, or reproducibility of the whole
transition.

## History and parallel changes

Migrations applied to a shared environment keep an immutable identity and
content; a correction is made with a new forward change. Shared history does
not become private because a branch has not been merged yet. Unknown history
does not mean never-applied.

A private migration may be adapted only when it is established that it has not
been applied to shared environments and has no other consumers, with a
reproducible reset/replay of your own disposable environment. The profile may
set a stricter prohibition.

After a neighboring change has been integrated:

1. Obtain a fresh integration base and a trusted data baseline.
2. Check whether the versions of the full candidate are applied, unique, and
   in order.
3. Preserve the shared history and the behavior of the already accepted change.
4. Adapt only the permissible private part, or add a forward fix.
5. Update the environment's source and repeat the affected data/application checks.

Do not get around a history conflict by rename, repair, force apply, or
editing markers. If the correct order cannot be established safely, the data
owner decides. Integration of conflicting migrations is serialized.

## Two different proofs

**Clean replay:** empty database → the entire versioned history → standard
schema/data/permissions tests → applicable API/UI checks.

**Upgrade with data:** the exact previous state → synthetic records realistic
in structure → saved IDs/values/invariants → only the new migrations →
re-reading the same records and behavior.

The second path preserves the history, relations, snapshots, and meaning of
the data, and also verifies the new behavior. A reset between preparing the
records and the upgrade destroys the subject of the check. A clean replay does
not replace an upgrade; an upgrade on an arbitrary local state does not
replace a replay.

For both paths record the base/candidate, version order, initial state,
commands, assertions, roles, and cleanup. After a material change to the
schema, permissions, migrations, or dependencies, repeat the affected paths.
Re-binding an old report to a SHA without analyzing the delta does not make
it current.

## Invariants and failure

Verify the necessary constraints: conservation of sum/quantity/identity,
uniqueness, references, lifecycle, ownership, allow/deny, history, and absence
of leakage. A concurrent loser and a stale context must produce the
prescribed outcome. Retry is limited to the accepted class of errors and the
number of attempts; a successful outcome without checking the attempt count
may hide a retry storm.

For a cross-layer claim, trace input → normalization → persistence → public
projection → consumer → authoritative reload. A standalone mapper or a
prepared middle of the chain does not prove a round trip.

Import and backfill preserve provenance, transformation rules, error handling,
re-running, and reconciliation of the result with the accepted input.
Historical and newly created records do not substitute for each other for the
sake of green acceptance.

Rollback of schema/data is not considered available automatically. Before a
dangerous transition, define a verified restore or forward recovery, the
data-loss boundary, and the owner. SQL that has already been applied remains a
fact even if deploy or merge fails afterwards.
