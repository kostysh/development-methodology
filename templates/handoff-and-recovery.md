# Handoff and recovery — fillable form

Rules: [checkpoints](../method/03-planning.md),
[agents and recovery](../method/12-agents.md), [closure](../method/04-task-management.md),
[documentation](../method/13-artifacts-and-communication.md).
Do not turn the report into a log of every command; keep the facts needed for
a decision and for continuing safely.

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

## Recovery snapshot

| Field | Observed value |
| --- | --- |
| Time, task/source locator, and the last accepted checkpoint | `{{IDENTITY}}` |
| Repository / workspace / worktree / branch | `{{WORKSPACE}}` |
| Exact HEAD / base / upstream / ahead-behind | `{{REFS}}` |
| Staged / unstaged / untracked and other people's preserved state | `{{GIT_STATE}}` |
| PR/MR, issue, parent, tracker, run/attempt, deployment IDs | `{{EXTERNAL_IDS}}` |
| Publication / CI / acceptance / dependency states | `{{STATES}}` |
| Evidence locators and the limit of their currency | `{{EVIDENCE}}` |
| Own active operations/resources and cleanup/readback | `{{RESOURCES}}` |
| Record of the scenario, attempts, and budget, where applicable | `{{REPAIR_CHAIN}}` |
| Next owner and the next permitted step | `{{NEXT_OWNER_ACTION}}` |

After recovery, re-read the mutable fields. A match permits continuing the
established step; a discrepancy requires local reconciliation. This snapshot
is not a new permission.

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
