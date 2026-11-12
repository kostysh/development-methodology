# Glossary

Terms the methodology uses without explanation in the chapter text.

| Term | Meaning | More |
| --- | --- | --- |
| Acceptance | Confirmation that the result meets the accepted criteria at the stated boundary: task, slice, user journey, or project | [Lifecycle](method/02-lifecycle.md#reachable-end-to-end-path) |
| Anti-claim | An explicit statement of what the result does not prove, when it could be mistaken for a broader capability | [Tasks](method/04-task-management.md#what-done-means) |
| Authority | The basis for making a decision or performing an action: assignment, accepted document, owner's decision | [Sources](method/01-authority-and-scope.md) |
| Authoritative reload | Re-reading state from the owning system after a change, rather than from a cache or a client response | [Verification](method/06-verification.md#end-to-end-and-negative-acceptance) |
| Baseline | Accepted primary obligations: contract, initiator's requirements. Changed only by a separate decision | [Sources](method/01-authority-and-scope.md#owners-of-truth) |
| Blocker | A named obstacle with an owner and a removal condition | [Tasks](method/04-task-management.md#state-model) |
| Canonical owner (of a rule) | The single document where a rule or decision is written in substance; all others link to it | [Documentation](method/13-artifacts-and-communication.md) |
| Checkpoint | A plan point with a report; informational or a hard stop | [Planning](method/03-planning.md#checkpoint-execution) |
| Cleanup | Finishing one's own processes, resources, branches, and worktrees, followed by a readback | [Environments](method/08-environments-and-operations.md#run-lifecycle) |
| Core and extended set | Seven document types by default; the other types are switched on in the profile | [Documentation](method/13-artifacts-and-communication.md#documents-by-stage) |
| Default | A concrete choice from `defaults/` that applies until the profile says otherwise | [README](README.md#how-to-read-the-requirements) |
| Description of the current state | A document kind: PRD, architecture brief, SPEC. One current document per area, edited together with the change to the system | [Documentation](method/13-artifacts-and-communication.md#descriptions-and-records) |
| Disposition | The decision on each statement or finding: accepted, rejected, deferred with an owner, not applicable | [Sources](method/01-authority-and-scope.md#completeness-and-semantic-traceability) |
| Done | The result is accepted at the stated boundary; mandatory evidence and reconciliation are complete | [Tasks](method/04-task-management.md#what-done-means) |
| Evidence | A stored observable result of a check: command, environment, revision, outcome, locator | [Verification](method/06-verification.md#limits-of-evidence) |
| Falsifier | A check or condition that will refute a claim if the claim is wrong | [Verification](method/06-verification.md) |
| Finding | A review remark: locator, violated contract, impact, evidence, required fix | [Verification](method/06-verification.md#self-check-and-independent-review) |
| Future-owner | A dependency type: an obligation handed over to the next owner with acceptance conditions | [Tasks](method/04-task-management.md#typed-dependencies) |
| Gate | A mandatory check or decision; without its positive result the dependent transition is forbidden | [Verification](method/06-verification.md#run-composition) |
| Handoff | A record for passing work on: result, what is and is not accepted, decisions, evidence, next step | [Template](templates/handoff-and-recovery.md) |
| Hard stop | A checkpoint at which the executor stops until the owner decides | [Planning](method/03-planning.md#checkpoint-execution) |
| Living documentation | Documentation of the system's current state: READMEs, runbooks, API reference, user documentation | [Documentation](method/13-artifacts-and-communication.md#living-documentation) |
| Material delta | A change to behavior, contract, permissions, data, provider, release, or acceptance boundary | [Sources](method/01-authority-and-scope.md#materiality-and-rigor) |
| Mode `solo` / `team` | The team composition that determines the rules for acceptance, deputies, and disputes | [Agents](method/12-agents.md#team-composition) |
| Non-goals | What is explicitly excluded from scope so that it is not added by default | [Sources](method/01-authority-and-scope.md#outcome-and-authority) |
| `not_applicable` | A deliberate non-application with a basis. An empty field is not this | [README](README.md#how-to-read-the-requirements) |
| Point-in-time record | A document kind: decision, delta, plan, validation. Not edited after acceptance; replaced by a new record | [Documentation](method/13-artifacts-and-communication.md#descriptions-and-records) |
| Provenance | The origin of a statement or material: source, date, author, how it was obtained | [Documentation](method/13-artifacts-and-communication.md#document-classes) |
| RCA | Establishing the cause of a failure with verifiable confirmation rather than a plausible guess | [Diagnostics](method/14-learning-and-recovery.md) |
| Readback | Re-reading the actual state after an action: ref, status, resource, publication | [Integration](method/07-integration.md#confirming-the-result) |
| Readiness, Ready | The task's inputs are sufficient: the executor does not have to invent material behavior | [Tasks](method/04-task-management.md#creation-and-readiness) |
| Residual risk | A remaining risk accepted by the owner. It does not replace a mandatory red gate | [Diagnostics](method/14-learning-and-recovery.md#repeated-review-fails) |
| Scope | The permitted area of change and result | [Sources](method/01-authority-and-scope.md#outcome-and-authority) |
| Self-check | The author's check of their own result before review | [Verification](method/06-verification.md#self-check-and-independent-review) |
| Skill | A package of agent instructions and templates for a kind of work | [Skills](method/15-skills.md) |
| Slice (vertical slice) | A bounded useful result through all the necessary layers of the system | [Lifecycle](method/02-lifecycle.md#vertical-slice-and-specification) |
| Stable ID | An unchanging identifier of an artifact or requirement used for references. Until merged into the integration branch, a new document's ID is provisional | [Documentation](method/13-artifacts-and-communication.md#identifiers) |
| Supersession | Replacing an accepted document with a new one while keeping the `supersedes` / `superseded_by` link | [Documentation](method/13-artifacts-and-communication.md#statuses-and-acceptance) |
| `unknown` | An unknown value; blocks only the actions that depend on it and is not equal to a safe `no` | [Profile](PROJECT-PROFILE.md) |
| Verdict | The outcome of a review per subject: `PASS`, `FAIL`, or `BLOCKED`, with the version and coverage stated | [Planning](method/03-planning.md#independent-review-of-a-formal-plan) |
| Worktree | A separate Git working copy for one task | [Integration](method/07-integration.md#isolation-and-preparation) |
