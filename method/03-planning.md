# Planning and checkpoints

Applies when a formal plan is requested or the accepted profile requires one.
It is not activated automatically for every edit. The accepted constraints of
a plan persist during execution and after a change of mode, agent, or session.

## A sufficient solution first

Name the result, the permitted scope, the non-goals, the consumer, and the
contribution to the overall scenario. Choose the most direct path with
existing means and a check that can refute the expected result.

Every new abstraction, dependency, queue, state, service, harness, workflow,
or process document requires two answers: which current requirement demands
it, and why the existing path is insufficient. Convenience of verification
does not by itself authorize a new runtime or workflow. A necessary boundary
change gets the owner's decision before dependent actions.

A plan cannot authorize its own expansion. On a material delta, repeat the
check of sources, simplicity, and consequences; do not use an earlier
agreement for different behavior.

## Contents

The [task and plan template](../templates/work-item-and-plan.md) records:

- the expected result and the limit of what is proven;
- the original scope and the comparison `unchanged`, `narrowed`, `expanded`, or `mixed`;
- sources, readiness, accepted decisions, and material unknowns;
- steps with owner, output, dependencies, check, and the required competence;
- risk, independent triggers, review route, and the budget for critical checks;
- the chosen environment, the origin of the source data, and the recovery method;
- checkpoint boundaries and the exact actions permitted after each;
- local, CI, and post-release checks without substituting one for another;
- an explicitly deferred obligation, its owner, and the return event.

A separate local rerun after integration must establish a new fact: changed
code/conditions, a new defect, or missing mandatory evidence. A new SHA by
itself does not require repeating an unchanged local check. This does not
cancel mandatory CI for the final revision or acceptance in the target
environment.

## Independent review of a formal plan

When the full planning route is adopted, apply an independent review of the
stable version on two subjects. For a shortened low-risk task without a formal
plan, this procedure creates no additional audits.

The stable version of the plan is reviewed on two subjects:

1. Simplicity and sufficiency of all decisions: unnecessary complexity and a
   more direct alternative, if it preserves the requirements. Incomplete
   reading does not yield `PASS`.
2. Mandatory work, scope/authority, the necessary layers, integration, and
   reachability of the result. The reviewer reads the original requirements,
   not only the author's retelling.

For a high-risk plan, the subjects are reviewed by two different reviewers in
parallel on the same version. For other plans, one reviewer gives a separate
verdict for each subject.

Reviewers work without the author's reasoning history and without the right
to edit. The package contains the full assignment, constraints, primary
sources, decisions, unknowns, and the exact version of the plan. For a
human-only team, independence is ensured by another participant; an AI model
is not a condition of the process.

A verdict names the version, subject, coverage, findings, limits, and `PASS`,
`FAIL`, or `BLOCKED`. Remarks about form are not mixed with questions of
meaning unless the form creates a real gap. Unavailability of a mandatory
reviewer leaves this gate incomplete.

After a material edit, only the affected decisions are re-reviewed, on both
subjects at once. Each subject keeps only its own evidence for the unchanged
reviewed parts. A remainder not yet reviewed requires review. A typo or a link
fix that does not change meaning does not reset the previous review. Repeated
FAILs are subject to the [cycle limit](14-learning-and-recovery.md).

## Checkpoint execution

In an accepted plan, each checkpoint is explicitly marked as informational or
as requiring a stop. By default a checkpoint is informational: the executor
saves the report and continues. A hard stop is set in three cases: before a
hard-to-reverse action (publication, merge, migration of a shared environment,
an external effect), before a material unresolved choice, and where the owner
has explicitly required it.
Do not add new stops for optional questions.

Before a hard stop, finish the permitted scope, self-check, applicable checks,
saving the work, and cleanup. If a local commit without push was agreed, make
exactly that. Preparing a result does not authorize publishing it. Approval of
one stage does not cancel later stops.

The [checkpoint report](../templates/handoff-and-recovery.md) contains the
result, `accepted now`, `not accepted`, `blocking decision`,
`next autonomous action`, key decisions and consequences, evidence, and the
state needed to continue. For a hard stop the next autonomous action is `none`
until the named decision.

The recovery summary names the task/source, time, repository/worktree/branch,
HEAD/base, dirty state, external IDs/statuses, the last accepted stage, and
the next step. It is a snapshot: after an interruption, mutable values are
re-read. The operator must not replace the author's own check of the result.
