# Tasks, dependencies, and closure

The tracker shows the work and its state. Requirements stay with the owner of
the product, architecture, specification, or plan. The concrete service and
fields are chosen in the [profile](../PROJECT-PROFILE.md).

## Steps

1. Check the task's basis: an accepted plan, a SPEC, an accepted finding, or
   a direct assignment.
2. Fill in the card: source, outcome, owner, scope, risk, dependencies,
   review route, and evidence for Done.
3. Move the task to Ready when the executor does not need to invent material
   behavior.
4. Maintain the status according to the [state model](#state-model); record a
   block with an owner and a removal condition.
5. Before Done, reconcile requirements, evidence, dependencies, and the next owner.
6. Make the tracker changes, then re-read them together and resolve
   discrepancies.
7. Close a parent task by its own acceptance, not by the number of closed
   children.

## Creation and readiness

A task originates from an accepted plan, a specification, an accepted
finding, or a direct assignment. Discovering an improvement does not by itself
authorize implementing it. A one-off low-risk correction may need only the
assignment and a handoff without an issue, if the project rules do not
require an issue.

Separate decisions of the requirements owner from engineering execution.
Unknown credentials, endpoints, quotas, or runtime configuration are not
automatically questions for the customer: first the technical side and its
owner are investigated.

A working card contains the source, a short outcome, the owner, type, scope,
risk, dependencies, review route, and evidence for completion. For an
end-to-end scenario, add the entry/exit state, the canonical record, the
handoff to the next consumer, and the not-yet-verified part of the path. The
normative contract is not copied into the card in full.

Do not move work to ready-to-start if the executor would have to invent
material behavior. For a support task, name which result it supports and
which verifiable output its consumer needs.

## State model

| State | Meaning and transition condition |
| --- | --- |
| Backlog | The work is known; inputs or priority are not yet ready. |
| Ready | Scope, owner, start dependencies, sources, and acceptance are sufficient. |
| In progress | The owner is doing the permitted work. |
| In review | The result is stable and submitted with the author's check. |
| Blocked | The blocker, its owner, the dependent transition, and the removal condition are named. |
| Done | The result is accepted at the stated boundary; mandatory evidence and reconciliation are complete. |

The profile may use other names with the same meaning. Work can become blocked
from any state. Returning to Ready requires fresh confirmation that the
blocker has been removed. A pause must not hide under active execution.

## Typed dependencies

| Type | What it blocks | What may continue |
| --- | --- | --- |
| `start` | Start of the dependent implementation | Research and preparation |
| `merge` | Integration and Done | Permitted implementation and review |
| `acceptance` | Separate acceptance of linked results | Parallel implementation and permitted integration |
| `future-owner` | Loss of a deferred obligation | Closing the current result after a complete handoff |

Each material link names both tasks, the type, the gate/evidence, the owner,
the condition for unblocking or for the return of evidence, and the reverse
link. A plain `blockedBy` link in the service may not convey the type; the
description is kept with the owner.

A `future-owner` link needs the receiving owner, the module/increment, the
activation trigger, the exact obligation, and the expected acceptance. An
incomplete handoff leaves the work without an owner and blocks closing the
handing-over task. Independence of implementation does not prove independence
of acceptance for a shared race or a single record.

## What Done means

- Document: saved, traceable to sources, checked against its purpose;
  not declared a working feature.
- Experiment: the question received a proven answer or an honest limitation;
  the code and conclusions have an explicit further fate.
- Implementation: the behavior or invariant is verified; integration, review,
  cleanup, and the target environment are closed within the assignment.
- Slice: its lifecycle, reachable entry, exit, and canonical handoff are
  verified; the remainder of the overall scenario has an owner.
- External publication: the published result has been read, not just a local
  file or a successful command run.

A document PASS, closed children, and a green standalone test do not replace
the parent's acceptance. Automatic closure on merge is not allowed if
mandatory acceptance is still ahead; check the actual closing references.

## Closure reconciliation

Before closing a task, check its accepted requirements, evidence,
dependencies, next owner, and status consistency. Before closing a slice, a
journey, or a parent result, additionally reconcile its whole graph and the
current set of blocked tasks in the accepted delivery area. Classify blockers
as related or unrelated. An unrelated, properly recorded blocker does not
prevent the current completion; a lost owner or false readiness requires
correction.

First perform the exact permitted set of changes to the issue, parent,
statuses, and links. After the last external mutation, re-read them together:
final states, dependency types, evidence, and the next step must be
consistent. Fixing a discrepancy requires a new final read. Do not present a
successful command or an old snapshot as a completed reconciliation.

If the last child is closed, separately check the parent and its own
acceptance. Do not close it automatically by the number of children.
Unblocked tasks get Ready only after all their conditions are checked.

## Decisions and external statuses

Before closing a question for the requirements owner, save the decision in the
canonical artifact/code or hand the exact obligation to a properly recorded
future-owner. A comment without such a handoff does not reliably preserve the
obligation.

If an external progress snapshot depends on the tracker, first publish the
confirmed materials while the status is still incomplete, then change the
tracking consistently and publish the final status. Check the publication
after the last affecting change. Even the same commit can have a stale
snapshot. An ordinary task without such publication does not get this
additional route.
