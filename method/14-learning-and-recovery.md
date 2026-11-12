# Diagnostics, repeated failures, and process improvement

This section limits fix cycles and separates an established cause from a
plausible hypothesis. It does not extend the scope or the authority of
remediation.

## Early verifiable path

Before non-trivial implementation, set a minimal end-to-end scenario, a
success criterion, and a budget for work and checks without waiting for the
owner. Verify the real components, permissions, and applicable
failure/recovery conditions before expanding the solution.

For a defect, first try to reproduce the symptom and establish the violated
contract. If the original environment is unavailable, name the reason and the
limit of the available evidence. A confirmed local defect may be fixed within
its boundary; this does not prove that the unavailable external environment
has recovered.

Each fix tests a hypothesis and repeats the original actor/path/observable. A
changed error text does not mean the original scenario has been restored.

## Limit on a chain of fixes

The prototype's base rule: stop new dependent fixes and expensive runs at the
first of these events:

- two "fix → check" cycles have not confirmed the original scenario;
- the next workaround requires a new coordination/state/recovery mechanism;
- the agreed budget is exhausted.

Expected negative tests do not count as failed attempts. A change of error,
SHA, agent, context, or auxiliary PR does not reset the overall count for one
scenario. Independent tasks are not part of this count. Splitting the
scenario or changing the criterion to get around the limit is not allowed.

Revisit the whole path: a targeted fix, simplification, return to a working
variant. Compare the requirements and the overall complexity. Effort already
spent is not a reason to continue.

Within the existing authority, one bounded attempt with a revised approach is
permitted, with a basis, hypothesis, falsifier, and deadline. Success confirms
continuing; failure or inability to verify requires the owner's decision. Do
not extend the budget yourself. Independent permitted work continues.

Keep one entry in the current log: scenario, assumptions, results, attempts,
time/budget, decision, and the next permitted step. Before each next fix,
state what is established, what is unknown, why the step is needed, and what
its check will not prove. A separate tracking platform is not needed.

## CI and resource failures

The first red mandatory job requires keeping its exact identity and the
material chain of errors. Compare the causes and run a safe probe that
distinguishes them, or name a verified blocker. A first reading of the log
and waiting are not an established RCA.

For a transient hypothesis, name a falsifier. Without a code change, at most
one rerun of the same check is permitted; PASS means "the failure did not
reproduce", not "fixed". A code defect is confirmed by a replacement run of
the fixed SHA. The whole chain keeps the overall limit above.

A hang, runaway retry, abnormal memory, and leftover processes require a
separate resource readback and RCA before a new heavy run. An ordinary
assertion failure does not turn into a resource incident. A cleanup failure
is kept separate from the primary error and does not mask it.

## Repeated review FAILs

After the first FAIL, read the whole material set of findings, fix the
permitted area, and stabilize the result. After two FAILs with the same root
cause, a new full patch/audit cycle is forbidden until an RCA and a
disposition: a rule, a test, an owner, a scope boundary, or an explicitly
accepted permissible residual risk.

After the disposition, one bounded re-review of this cause and its direct
consequences is permitted. A repeated same-root FAIL leaves the gate blocked
until the owner decides. A change of auditor does not reset findings; residual
risk does not replace a mandatory red technical gate.

Regardless of causes, at most three rounds per review subject per task are
allowed, unless the accepted plan set a different limit. The next round
requires the owner's decision: narrow the scope, revise the approach, or
accept the residual risk where that is permissible. A change of auditor and a
new root cause do not reset the count.

## Retrospective

Choose the depth by the question: targeted — one incident or class of
failure; full evidence-based — a project, a large session, or a systemic
problem. Define the time slice, the source universe, the events, and the
exclusions.

Reconcile the primary messages/logs, decisions, commits, checks, all related
FAILs, and the actual earlier fixes. Separate observation, a causal hypothesis,
and confirmed causality. A search analyzer helps find an event, but does not
automatically count semantic defects and does not prove completeness.

Deduplicate one problem across repeated observations. For each
recommendation, state the persisting defect, the minimal change, the owner,
acceptance, the activation condition, and the status: active, already
implemented, rejected, superseded, or not applicable. Check an accepted
earlier measure in its actual owner.

A full retrospective needs a consistent "source → event → cause → earlier fix
→ remaining measure" matrix and an independent check of completeness,
causality, and deduplication. A targeted incident does not require a
project-wide registry. The template is [here](../templates/review-and-retrospective.md).

Accepting a report does not authorize creating tasks or implementing the
recommendations. After separate permission, each active, independently
assignable step gets exactly one task with back-links. Do not create tasks for
already-implemented/rejected/not-applicable measures. If the outcome of a
create is unknown, first look for the object by its exact identity; a
repeated create may produce a duplicate.

## Effectiveness check

Separate three levels: a rule is written; a control actually works; the
development outcome has improved. The third requires comparable tasks and
metrics chosen in advance: lead time, rework, escaped defects, incidents,
coordination cost, or another important outcome. Take into account risk,
size, and changes in the composition of tasks.

A new document, script, task, or audit PASS does not prove a speed-up or
quality. On the next comparable work, check whether the measure prevented the
original failure. If not, revisit the hypothesis and the narrowest rule. Do
not grow the process for every incident and do not introduce a metrics
platform without a separate need.
