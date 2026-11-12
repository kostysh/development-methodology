# PLANS — entry-point template

Formal planning is switched on when: `{{PLAN_ACTIVATION_RULE}}`.
It follows `{{METHOD_PATH}}/method/03-planning.md` and the accepted profile.
The section is read in full before preparing a plan.

When the full route is active, the following are mandatory: a check of
sources and simplicity, a plan with outcome/evidence, an independent review on
the two subjects from the canonical section, and the stated checkpoints. For a
small task outside formal mode, this file does not switch on an audit
automatically.

Owners and available means of review: `{{PLAN_REVIEW_OWNERS}}`.
Accepted exceptions: `{{PLAN_EXCEPTIONS_OR_NONE}}`.

Once accepted, a plan keeps its constraints during execution and across
session changes. Each checkpoint explicitly sets continuation or a hard stop;
by default it is informational. Permission for one checkpoint does not lift
the others. The report and recovery ledger follow
`{{METHOD_PATH}}/templates/handoff-and-recovery.md`.

This entry point does not duplicate normative text and does not authorize a
commit, push, merge, external mutation, or new dependency without an existing
basis.
