# Work routes

Three typical step-by-step routes. Each step links to the chapter that
describes its conditions and constraints. The risk level is chosen according
to [chapter 01](method/01-authority-and-scope.md#materiality-and-rigor);
risk triggers can move a task to a stricter route at any time.

## Small change — low risk

1. Name the assignment, result, scope, and non-goals.
   [01](method/01-authority-and-scope.md#outcome-and-authority)
2. Make sure the low-risk criteria are met and the task qualifies for the
   shortened route. [01](method/01-authority-and-scope.md#materiality-and-rigor)
3. Create a task worktree. [07](method/07-integration.md#isolation-and-preparation)
4. Make the change in the most direct way. [05](method/05-implementation.md#minimal-sufficient-complexity)
5. Run the narrow check and the mandatory repository gates.
   [06](method/06-verification.md#run-composition)
6. Do the self-check, including living documentation.
   [06](method/06-verification.md#self-check-and-independent-review),
   [13](method/13-artifacts-and-communication.md#living-documentation)
7. Commit and integrate according to the profile. [07](method/07-integration.md)
8. Leave a handoff: result, checks, limitations.
   [template](templates/handoff-and-recovery.md)

No stage documents are created.

## Feature — medium or high risk

1. **Intake.** Assignment, sources, authority, unknowns, risk level.
   [01](method/01-authority-and-scope.md), [02](method/02-lifecycle.md#stages-and-readiness)
2. **Product.** Edit the current PRD, or a new PRD for a new area;
   acceptance by the product owner. [02](method/02-lifecycle.md#product-and-architecture),
   [13](method/13-artifacts-and-communication.md#documents-by-stage)
3. **Architecture** — when boundaries, contracts, data, trust, or release
   change. An architecture delta or a decision record; an accepted delta is
   carried into the architecture brief. [02](method/02-lifecycle.md#product-and-architecture),
   [13](method/13-artifacts-and-communication.md#descriptions-and-records)
4. **Delivery.** Delivery plan: slices, tasks, typed dependencies, order,
   evidence. [02](method/02-lifecycle.md#vertical-slice-and-specification),
   [04](method/04-task-management.md)
5. **Specification.** Edit the current SPEC, or a new SPEC for a new area of
   behavior; verification map. [02](method/02-lifecycle.md#vertical-slice-and-specification)
6. **Execution plan** — if formal planning is switched on by the profile;
   independent review of the plan. [03](method/03-planning.md)
7. **Negative acceptance before code** — for high risk.
   [06](method/06-verification.md#end-to-end-and-negative-acceptance)
8. **Implementation** in a task worktree, tests, living documentation.
   [05](method/05-implementation.md), [07](method/07-integration.md#isolation-and-preparation)
9. **Checks and review**: fast checks, self-check, review by risk subjects,
   then expensive runs. [06](method/06-verification.md)
10. **Integration**: PR, candidate freshness, merge, readback.
    [07](method/07-integration.md)
11. **Acceptance** in the target environment, if it is part of the task.
    [06](method/06-verification.md#target-environment-acceptance), [08](method/08-environments-and-operations.md)
12. **Closure**: reconciliation of tasks and dependencies, a validation record
    if needed, archiving the completed plan, updating the module index.
    [04](method/04-task-management.md#closure-reconciliation),
    [13](method/13-artifacts-and-communication.md#statuses-and-acceptance)

Steps 2–5 are performed only to the extent that the task changes their area.
A change that stays within an accepted SPEC starts at step 6 or 8.

## Document or research

1. Name the assignment, reader, result, and the completeness boundary of the
   sources. [01](method/01-authority-and-scope.md#completeness-and-semantic-traceability)
2. Decide whether a persistent document is needed, its kind, location, and ID.
   [13](method/13-artifacts-and-communication.md#steps)
3. Write the draft using the stage's skill, in the profile's language.
   [13](method/13-artifacts-and-communication.md#language-and-text), [15](method/15-skills.md)
4. Check the document against its purpose and sources; independent review if
   the document changes authority or acceptance rules.
   [06](method/06-verification.md#self-check-and-independent-review)
5. Hand it over for acceptance to the owner of its class.
   [13](method/13-artifacts-and-communication.md#statuses-and-acceptance)
6. Update the module index and links; integrate according to the profile.
   [07](method/07-integration.md)

A document is not declared a working feature. Runtime and deploy checks are
added only when a corresponding claim is made.
