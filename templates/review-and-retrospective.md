# Review and retrospective — two forms

Use only the corresponding form. A review of the current result and a
retrospective of the causes in completed work solve different tasks.
Rules: [verification](../method/06-verification.md),
[learning](../method/14-learning-and-recovery.md).

## Review form

- Scope, subject, and stable version: `{{SNAPSHOT_AND_LENS}}`.
- Reviewer and independence: `{{REVIEWER}}`.
- Owning sources read: `{{SOURCES}}`.
- Coverage actually checked: `{{COVERAGE}}`.
- Limitations and unknowns: `{{LIMITS}}`.

| ID / severity | Locator | Violated contract | Observation and impact | Required fix | Evidence / status |
| --- | --- | --- | --- | --- | --- |
| `{{FINDING}}` | `{{LOCATION}}` | `{{CONTRACT}}` | `{{IMPACT}}` | `{{ACTION}}` | `{{EVIDENCE}}` |

Verdict: `{{PASS_FAIL_BLOCKED_WITH_BOUNDARY}}`.

A primary review requires the full claimed coverage. For a delta review, name
the unchanged, previously checked evidence of exactly this subject and the new
area. A PASS on another subject does not replace this subject's own check.
For a formal plan, give a separate verdict for each subject from the
[planning rules](../method/03-planning.md).

## Retrospective form

- Question, time slice, and targeted/full mode: `{{SCOPE}}`.
- Source universe, availability, exclusions: `{{SOURCES}}`.
- Established sequence of material events: `{{TIMELINE}}`.
- What is an observation, a hypothesis, and a proven cause: `{{CAUSALITY}}`.
- Earlier measures and their actual state with the owner: `{{PRIOR_FIXES}}`.

| Problem ID | Primary events/evidence | Cause and confidence | Measure already taken | Remaining recommendation / disposition | Owner / acceptance / trigger |
| --- | --- | --- | --- | --- | --- |
| `{{PROBLEM}}` | `{{EVENTS}}` | `{{CAUSE}}` | `{{PRIOR_ACTION}}` | `{{RECOMMENDATION}}` | `{{OWNERSHIP}}` |

For full mode, provide an equivalent machine-readable matrix and an
independent check of completeness, causality, and deduplication. For a
targeted case, a separate JSON/registry is not required.

- Active, independently assignable steps: `{{ACTIVE_STEPS}}`.
- Acceptance of the report: `{{REPORT_DECISION}}`.
- Separate permission to create tasks / implement measures: `{{ACTION_AUTHORITY}}`.
- Check for duplicates and the final readback: `{{TRACKING_RECONCILIATION}}`.
- Next comparable work and the effectiveness criterion: `{{EFFECTIVENESS_CHECK}}`.

An accepted report does not mean permission for external mutations and does
not prove the effectiveness of the proposed measure.
