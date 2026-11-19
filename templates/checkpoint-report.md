# Checkpoint and closure report

Rules: [checkpoints](../method/03-planning.md),
[agents and recovery](../method/12-agents.md), [closure](../method/04-task-management.md),
[documentation](../method/13-artifacts-and-communication.md).
Keep this report in the task or PR for the operator and next owner.

## Result

- Short result and the scope completed: `{{RESULT}}`.
- `accepted now`: `{{WHAT_AND_EVIDENCE}}`.
- `not accepted`: `{{UNVERIFIED_BLOCKED_OR_OUT_OF_SCOPE}}`.
- `blocking decision`: `{{NONE_OR_OWNER_LOCATOR_UNBLOCK_CONDITION}}`.
- `next autonomous action`: `{{EXACT_ALLOWED_ACTION_OR_NONE}}`.
- Key decisions, their bases, and downstream consequences: `{{DECISIONS_OR_NONE}}`.
- Changed boundaries and agreed deviations: `{{DELTA_OR_NONE}}`.
- Checks, their results, omissions, and limits: `{{CHECKS}}`.
- Artifacts created or changed: ID, status, who accepts: `{{ARTIFACTS_OR_NONE}}`.
- Living documentation: updated (what), or reviewed, not affected: `{{LIVING_DOCS}}`.
- Skills used, and their version where relevant: `{{SKILLS_OR_NONE}}`.

If the result could be mistaken for a broader capability, explicitly separate
the observed behavior, the supporting artifacts, and the impermissible
conclusions.

## Final reconciliation — on closure

- Last permitted external mutation: `{{LAST_MUTATION}}`.
- Joint readback after it: issue/parent, tracker, dependencies, evidence, and
  the next owner: `{{JOINT_READBACK}}`.
- Commit/PR/remote/deployed revision, where applicable: `{{FINAL_REVISION}}`.
- Unclosed obligations and the evidence-return route: `{{REMAINDER}}`.

For a hard stop, end with these explicit lines:

```text
Stop: waiting for the named owner decision
Next autonomous action: none
```
