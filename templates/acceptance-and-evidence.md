# Acceptance and evidence — fillable form

Rules: [verification](../method/06-verification.md),
[environments](../method/08-environments-and-operations.md).
This is the plan and record of a check inside an existing task/spec/validation
document.

## Result being verified

- Claim and its exact boundary: `{{CLAIM}}`.
- Requirement source / criterion: `{{SOURCE_AND_CRITERION}}`.
- Outcome that refutes success: `{{FALSIFIER}}`.
- Candidate / base / tree / runtime artifact: `{{REVISION_BINDING}}`.
- Environment and confirmation of its actual revision: `{{ENVIRONMENT_IDENTITY}}`.
- Unverified areas and impermissible conclusions: `{{LIMITS}}`.

## Access and preconditions

| Gate | Environment / target | Permitted data | Exact access path and read/write semantics | Credential/session owner | Existing authority | Forbidden actions |
| --- | --- | --- | --- | --- | --- | --- |
| `{{GATE}}` | `{{TARGET}}` | `{{DATA}}` | `{{ACCESS}}` | `{{OWNER_NO_VALUES}}` | `{{AUTHORITY}}` | `{{FORBIDDEN}}` |

- Actor / session / record ID / entry state: `{{INITIAL_STATE}}`.
- How the data and the required files were prepared through the normal
  permitted path: `{{SETUP_ORIGIN}}`.
- Which setup steps have no right to perform actions on behalf of the scenario
  under test: `{{SETUP_LIMITS}}`.
- Resource budget, result storage, and cleanup owner: `{{LIFECYCLE}}`.

## Scenarios and actual result

| ID | Actions and conditions | Expected observable | Command / interface | Actual / status | Evidence locator and time |
| --- | --- | --- | --- | --- | --- |
| `{{CASE}}` | `{{STEPS}}` | `{{EXPECTED}}` | `{{PROCEDURE}}` | `{{ACTUAL}}` | `{{EVIDENCE}}` |

Keep the same object and an authoritative reload where an end-to-end handoff
is claimed. Separate unit, intercepted UI, real integration, CI, and deployed
evidence. `not_run` or `unknown` is not PASS.

## High-risk adversarial contract — before implementation

| Scenario | applicable / not_applicable and basis | Actor/session/record preconditions | Forbidden outcome | Failure signal / environment / owner |
| --- | --- | --- | --- | --- |
| Same-record path | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |
| Independent session | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |
| Concurrent loser | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |
| Stale cache/context | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |
| Commit/readback loss | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |
| Deliberate evidence failure | `{{DISPOSITION}}` | `{{PRECONDITIONS}}` | `{{FORBIDDEN}}` | `{{OBSERVATION}}` |

- Sensitivity test, the introduced violation, and the expected reason for
  FAIL: `{{SENSITIVITY_CASE}}`.
- The actual failing result before happy-path coding:
  `{{PRE_CODE_EVIDENCE}}`.

## Completion

- Mandatory gates and their terminal results: `{{GATES}}`.
- Cleanup and a fresh readback: `{{CLEANUP}}`.
- What is proven / not proven: `{{VERDICT_BOUNDARY}}`.
- Blocker, owner, and the next permitted step, or none: `{{NEXT}}`.
