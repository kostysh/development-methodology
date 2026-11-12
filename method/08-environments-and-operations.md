# Environments, resources, and operations

Applies to work that runs the system, uses data/credentials, or changes
external state. For a document without a runtime check, no application
environment is created. Commands and numeric limits are set by the project
profile.

## Access and preconditions

Before a dependent gate, state the exact environment/target, the permitted
data, the interface and its read/write semantics, the owner of the
credential/session, prohibitions, and the existing basis of authority. The
form is in the
[evidence template](../templates/acceptance-and-evidence.md#access-and-preconditions).
The matrix describes the boundary but does not by itself grant access.

Having a credential or a dashboard grants no additional rights. A
browser/read-only route must not be silently replaced with privileged
database access. Unavailability of a future production environment does not
block an independent permitted local/synthetic check unless a direct
dependency is established.

Before declaring a blocker, check that the exact permitted interface is
available. A sandbox/network refusal does not prove absence of authorization.
Do not start searching for tokens, reconfiguring credentials, or signing in
without the corresponding permission.

If sign-in has several independent levels, check them separately. Permission
to request an OTP does not mean permission to read mail, keep the session, or
act in the application. Codes and secret values are not part of the report. A
working local sign-in method does not prove email delivery.

## Configuration and secrets

An environment has one contract owner: names, types, whether required, safe
defaults, storage location, and consumers. Separate public config, runtime
secrets, CI credentials, and values that the pipeline generates.

Do not store real values in Git, examples, chat, or evidence. An inventory of
names does not prove that the values are usable. A preflight confirms the
right target and the sufficiency of the configuration in a safe way. When a
parameter changes, all consumers and drift checks are updated consistently.

Host credentials are not carried into an isolated environment by default. Do
not change the machine's global settings for a local task without a separate
need and authority. Treat access to host mounts, sockets, and shared caches as
separate trust boundaries.

## Runtime isolation

A task owns its processes, ports, database, storage, browser session, and
temporary resources. The isolation method — VM, container, namespace, separate
database, or another accepted mechanism — is chosen by risk. A worktree does
not replace it.

Before using an existing resource, establish its owner and state. Do not stop
or reset someone else's or an unknown stack. Parallelism is permitted
according to real resources and isolation, not only different task names. A
check of free memory/CPU/disk is an admission snapshot, not a guarantee of
future load.

If base images or caches are used, check their identity, provenance,
compatibility, and the necessary hashes. Do not promote a provisional image to
verified by hand-editing metadata. Distinguish the tool's baseline from the
current candidate's sources; a source sync does not prove a data migration.

## Run lifecycle

```text
preflight ownership/target/resources → standard start → deterministic setup
→ check → cleanup on any outcome → fresh readback
```

Before a long run, set the wall time, the memory/process limit, retries, the
path for non-secret stdout/stderr, the real exit status, and the cleanup
result. The result must be stored independently of the interactive handle.
Verify a new way of storing results with a short safe non-zero probe and a
re-read without a new process.

An arbitrary `sleep` and a number of workers do not replace a resource limit.
The first hang, runaway retry, abnormal memory, or leftover process stops
retries until an RCA and a new testable hypothesis. Do not hide a guard
failure.

Cleanup runs after success, error, and interruption. Stop your own child
processes, then your stack and temporary resources. Verify the absence of
listeners, processes, containers/VMs, disks, sessions, and reservations in the
applicable area. Ctrl+C or a successful stop does not replace a readback.

A running resource can be handed over only to a named owner with a further
command and a cleanup obligation. Unknown cleanup does not mean a free slot
and blocks the dependent acceptance/next run.

## Loss of control and recovery

Distinguish a known non-zero exit of a finished test from an unknown outcome
of an interrupted operation. In the second case, first re-read the identity
of the operation, the owner, the revision, and the resources; use the accepted
recovery/cleanup path. Do not edit the operation's history to obtain a
convenient status.

For a disposable environment, the route verified cleanup → new environment
from a verified source is acceptable. For durable external effects, first
establish what has already been applied. Resume/readback must not repeat a
mutation whose outcome is unknown. An observer's error does not prove that the
server-side operation stopped.

## Operational duties

For an accepted delivery, define the necessary health/readiness, safe
logs/metrics, alerts, cost and latency limits, backup/restore, rollback or
forward-fix, incident owner, and runbook. Switch them on according to risk and
sources, without automatically adding a new observability platform.

A runbook names the trigger, target, authority, preconditions, steps, expected
observations, stop conditions, recovery, and the final readback. A dated
operational snapshot does not count as a description of the current state of
the service.
