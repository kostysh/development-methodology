# Lifecycle: from request to delivery

This section defines the inputs and outputs of stages. A separate document is
needed only when it preserves a decision or prevents a wrong implementation.
A short entry in an existing owner may be sufficient. Which artifact a stage
produces, where it is stored, and how it is accepted is in
[documents by stage](13-artifacts-and-communication.md#documents-by-stage);
the skill for each stage is in the [defaults](../defaults/skills.md#stages-and-skills).

## Stages and readiness

| Stage and owner | Input | Sufficient output | What stops dependent work |
| --- | --- | --- | --- |
| Intake: coordinator | Assignment, current system, and rules | Result, scope, authority, sources, unknowns, and route | Unclear goal or missing permission |
| Product: requirements owner | Accepted primary materials | Users, scenarios, non-goals, success, constraints, and decisions | A question that changes the meaning or acceptance of the product |
| Architecture: technical owner | Product basis and existing boundaries | Decisions, qualities, risks, contracts, and handoff | An unknown material system boundary |
| Delivery: planner | Accepted product/architecture basis | Vertical slices, tasks, dependencies, order, and evidence | An unachievable dependency or unclear responsibility |
| Specification: behavior owner | Task and inherited decisions | Verifiable behavior, states, errors, acceptance, and verification map | The executor would have to invent material behavior |
| Implementation: executor | A ready contract and an authorized stage | Implementation, the necessary tests, updated [living documentation](13-artifacts-and-communication.md#living-documentation), and a development log | A material gap, a failed gate, or going beyond scope |
| Review: independent reviewer when required | A stable result and a self-check | Findings, or a verdict limited to the reviewed area | An unresolved mandatory finding or an unverified boundary |
| Integration: integrator | Permission, candidate, gates, and review | A verified final state of the repository/release | Stale evidence, a conflict, a missing mandatory result |
| Acceptance and closure: acceptance owner | The real result in the required environment | Evidence, consistent statuses, remaining obligations, and cleanup | The result is not confirmed or a downstream owner is lost |

One person may perform several roles. Self-review by the author does not
replace a required independent check. Skills and tools are chosen by the
aspect of the work. The default set is described in [skills](15-skills.md);
the mandatory result of a role is preserved when the tool is replaced.

## Product and architecture

A product brief describes the problem, the value, the actors, scenarios,
constraints, non-goals, and the success and acceptance criteria. It does not
prescribe a technical platform unless a source or an accepted architecture
decision requires it.

Architecture work is switched on when component boundaries, public/data
contracts, trust, integrations, deployment, quality, cost, or recovery change.
A small change may need a single delta entry instead of a full package.

A decision compares the simplest sufficient option with the real alternatives
and names the consequences, owner, verification, and review event. Test
critical assumptions with a short experiment before expanding the
implementation. An experiment has a question, a budget, an observable
PASS/FAIL, and a decision on the fate of the code: delete it, keep it as a
test, or accept it as part of the implementation.

## Vertical slice and specification

A slice delivers a bounded useful result through the necessary layers. A list
of components is not a slice by itself. For a feature that is switched on,
explicitly define its lifecycle: creation, reading, modification, completion,
deletion, or an acceptable domain equivalent. A truncated lifecycle requires
an accepted boundary and a further owner; a universal CRUD is not imposed.

A specification records the actors, preconditions, state transitions, inputs
and outputs, permissions, validation, errors, concurrency/idempotency where
applicable, compatibility, and acceptance. A material new identifier gets an
exact name, meaning, format/constraints, and forbidden aliases. Terms are not
invented for implementation convenience.

For each criterion state the check, environment, observation, and evidence
owner. If a criterion passes with a stub in place of the promised action, it
is insufficient.

## Reachable end-to-end path

Trace one canonical record or other durable result object:
requirement source → scenario step → slice → task → observable outcome.
Record the trigger, actor, entry/exit state, ID, handoff to the next consumer,
and the applicable failures/retry/recovery.

Check the start of the path: who creates the necessary data through a normal
action. Fixture preparation must not perform the accepted action on the
user's behalf. If there is no start, limit the claim to an integration check
or obtain a decision to extend the scope. Do not call such a test a full user
journey.

Before delivery, establish that the source records, settings, and required
files are fit for use in the chosen environment. Check the actual bytes, the
link to the record, and the role's access if the scenario depends on a
document. Do not treat future preparation as done.

Task acceptance confirms one task; slice acceptance confirms the slice's
capability; journey acceptance confirms a connected path; project acceptance
confirms the accepted aggregate scenarios. A narrow result may finish before
the whole path if its exit state is proven and the unfinished part is
explicitly handed to an owner with acceptance conditions.

## Feeding information back

A new fact returns to the narrowest owner: product meaning to the product,
a boundary to the architecture, behavior to the SPEC, order to delivery, a
defect to code and tests, a change to the system's current structure to
living documentation. The tracker remains navigation. An accepted document is
changed according to the [status rules](13-artifacts-and-communication.md#statuses-and-acceptance).
Revisit an already accepted decision when there is material new evidence, not
for the sake of another round of formatting.
