# Task and plan — fillable form

Rules: [lifecycle](../method/02-lifecycle.md),
[planning](../method/03-planning.md), [tasks](../method/04-task-management.md).
For a small task, keep a short card. The other blocks are switched on by risk
and the accepted route.

## Card

- ID / owner / status / version: `{{WORK_IDENTITY}}`.
- Exact assignment and authority: `{{REQUEST_AND_AUTHORITY}}`.
- Sources and readiness: `{{SOURCE_LOCATORS}}`.
- Result / invariant preserved / consumer: `{{OUTCOME}}`.
- Scope / non-goals / permitted mutations: `{{SCOPE}}`.
- Original baseline and scope delta with its basis: `{{BASELINE_DELTA}}`.
- Risk and independent triggers: `{{RISK_AND_TRIGGERS}}`.
- Languages of the text being changed: `{{LANGUAGE_MODE}}`.
- Blocker, owner, and removal condition, or none: `{{BLOCKERS}}`.
- Check for Done and the limit of the claim: `{{ACCEPTANCE_BOUNDARY}}`.

## End-to-end contribution — where applicable

- Actor / trigger / entry state / exit state: `{{JOURNEY}}`.
- Canonical object, ID, and downstream consumer: `{{HANDOFF}}`.
- Where the records, settings, and required files come from: `{{PRECONDITIONS_ORIGIN}}`.
- Unverified part, next owner, and blocker: `{{UNFINISHED_JOURNEY}}`.

## Steps and checkpoints — for a plan

| Step | Owner / competence | Verifiable output | Dependency | Check / evidence | Permitted transition |
| --- | --- | --- | --- | --- | --- |
| `{{STEP}}` | `{{OWNER}}` | `{{OUTPUT}}` | `{{EDGE}}` | `{{CHECK}}` | `{{NEXT_OR_HARD_STOP}}` |

- Simplest sufficient path and the bases for the necessary complexity: `{{DESIGN_BASIS}}`.
- Early scenario, assumptions, budget, and the attempt limit: `{{EARLY_VALIDATION}}`.
- Review route and independence: `{{REVIEW_ROUTE}}`.
- Environment/access and rollback/recovery: `{{ENVIRONMENT_RECOVERY}}`.
- Post-integration checks and the specific facts still unknown: `{{POST_CHECKS}}`.
- New dependencies/processes and the exact decision, or none: `{{NEW_BOUNDARIES}}`.

## Typed dependency — one record per material link

| Source → target | start / merge / acceptance / future-owner | Gate/evidence | Owner | Unblock / evidence-return route | Reverse link |
| --- | --- | --- | --- | --- | --- |
| `{{EDGE}}` | `{{TYPE}}` | `{{GATE}}` | `{{OWNER}}` | `{{RETURN_ROUTE}}` | `{{REVERSE_LINK}}` |

For future-owner, additionally: the increment being accepted, the exact
obligation, the activation trigger, and the acceptance criterion. These fields
do not replace the current task and do not declare the downstream capability
delivered.
