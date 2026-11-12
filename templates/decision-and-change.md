# Decision and material change — fillable form

Rule: [sources and authority](../method/01-authority-and-scope.md).
Place the record in the current owner if a new artifact is not needed.

## Decision

- ID / owner / status / date / version: `{{DECISION_IDENTITY}}`.
- Question and the exact source statements: `{{QUESTION_AND_SOURCES}}`.
- What the current assignment permits: `{{AUTHORITY}}`.
- Simplest sufficient option: `{{SIMPLE_OPTION}}`.
- Material alternatives and the reasons for the choice: `{{ALTERNATIVES}}`.
- Accepted decision and evidence of its acceptance: `{{DECISION}}`.
- Consequences for behavior, data, security, operations: `{{IMPACT}}`.
- Verification of the decision, rollback/removal, and revisit trigger: `{{VALIDATION_REVISIT}}`.

## Semantic traceability — for a new material requirement

| Requirement / decision | Exact source statement or accepted non-product authority | explicit / derived | Applicability and necessity | What breaks if it is removed |
| --- | --- | --- | --- | --- |
| `{{REQUIREMENT}}` | `{{SOURCE_STATEMENT}}` | `{{DERIVATION}}` | `{{RATIONALE}}` | `{{REMOVAL_FALSIFIER}}` |

## Source coverage — when completeness is claimed

| Material and material block | Date / currentness | Authority / conflict / supersession | Read / excluded with reason | Statement → owner / disposition |
| --- | --- | --- | --- | --- |
| `{{SOURCE_BLOCK}}` | `{{CURRENTNESS}}` | `{{AUTHORITY}}` | `{{READ_STATUS}}` | `{{DISPOSITION}}` |

## Affected surfaces — on a material delta

| Class | Owner/locator or proven absence | Impact | changed / verified_unaffected / blocked | Evidence / reason / blocker |
| --- | --- | --- | --- | --- |
| Product authority | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Architecture / decisions | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Specification / contracts | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Delivery / tasks | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Design / UI contract | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Code / schema / migrations | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Tests / validation / runtime evidence | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Living documentation: README, runbook, API reference, user docs | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Tracker / dependencies / status | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |
| Published status / external tracking | `{{OWNER}}` | `{{IMPACT}}` | `{{STATUS}}` | `{{EVIDENCE}}` |

For a cross-layer value, extend the existing table with the transitions
input → normalization → persistence → projection → consumer → authoritative
reload, with owners, falsifiers, and significant dimensions. The manifest by
itself does not prove behavior and does not replace the required tests/review.
