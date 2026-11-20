# Development plan for deterministic checks and process measurement

**Status — implementation in progress.** This is the maintainer plan on the
`v5` branch. The starting point is [methodology 0.4](../../README.md).
Read the [impact matrix and conclusions](impact-matrix.md) for the expected
cost of each stage and the [execution requirements](requirements.md) for the
build, test and acceptance obligations that apply across stages.
The [implementation status](status.md) links stage decisions and pilot evidence.
The [November 20 remediation plan](adoption-readiness.md) sets the current
delivery scope and same-day acceptance for adoption.

The goal is to shorten the time to an accepted task while preserving quality.
Move checks that can reach a reliable verdict without model judgment out of
LLM audits. Measure what each change does to delivery time and quality.

The plan applies to the portable methodology. Put general principles in
`method/`, conditional practices behind a named trigger, concrete defaults
in `defaults/`, and project values in the adopting project's profile.
Schedules, limits, resource types and actual check suites are project values.
The [stage-to-skill mapping](../../defaults/skills.md#stages-and-skills)
identifies the existing skills referred to by role below.

The source is the Russian working draft `development-methodology/refactor/plan.md`
in the research repository, dated 2026-11-19. Its SHA-256 is
`b96cb499140241f86cd3ea87419a2e0e6ae74b23bafe3f89647ed829ebfc8831`.
The eight stages retain the source's numbered actions and completion criteria.
The I1 retrospective provides calibration cases from one project with a partial
adoption. Maintainers can trace the study to `docs/research/retro-i1/README.md`
in the Passapure repository. The prototype comprises `sessions.ts`, `delivery.ts`
and `audits.ts` under `scripts/retro-i1/` in that repository. Its project
records, logs and scripts stay with their owner. The research draft gives
the numerical evidence at lines 20–27,
188–193, 338–340 and 419–424. Each adopter establishes its own process
baseline for comparison. This is a measurement of delivery. Stage 5 uses
baseline tests for specified behavior. The [glossary](../../GLOSSARY.md)
defines the requirements baseline as the accepted primary obligations.

## Stage 1. Process metrics

Deliver an approved event schema, a collector exercised on a real task, and a
baseline. The main gap in I1 was the interval before the PR opened. CI job and
step durations and the card-to-merge and PR-to-merge intervals could be measured
in full. A long calendar gap also contained nights, other tasks and manual
work. Message gaps alone could not establish operator wait. Shared chats,
forks, compactions, automated permission checks and cached input distorted
task and cost attribution. The existing retrospective scripts are a prototype.

1. Name the questions the metrics must answer. Start with where task time goes
   between execution starting and the PR opening.
2. Identify the event needed for each metric. Take inputs from agent hooks,
   session logs, Git, CI and the GitHub API. Use the following measurement rules.

   | Metric | Events and interpretation |
   | --- | --- |
   | Time to acceptance | Emit `task.started` and `task.accepted` with issue, worktree and execution start time. Card creation and first commit are insufficient proxies. Show calendar time, operator activity, agent activity, machine occupancy and unexplained time separately. Intervals may overlap. |
   | Operator wait and interventions | Pair `decision.requested` with `decision.resolved`. Record decision request, correction, assignment or status question, and whether it blocks dependent work. End the block as soon as that work can proceed. |
   | Audit rounds and duration | Use `audit.started` and `audit.finished` with attempt ID, base, head, subject, verdict and prior round. Count failed attempts, reviewed snapshots, finding occurrences, distinct observations and causes separately. |
   | Findings by type | Use the four types from stage 4. |
   | Test and end-to-end runs | Take start/end events from the runner with suite ID, attempt, checkout, duration and exit code. Shell-command parsing miscounts compound commands and background polling. |
   | CI runs and failures | Use job and step data. Add the first failing step's structured code, fixture version and `queued` and `assigned` events. |
   | Rewritten refs and resulting audits | Emit `ref.rewritten` with old and new SHA, operation type and the resulting audit ID. Distinguish an observed rewrite from a presumed rebase. |
   | Context compaction | Use a common event with session and turn IDs across clients. Record context transfer on fork. |
   | Tokens per accepted task | Keep stable task, session, parent and response IDs and the model. Distinguish input, cached input and output when reporting usage. |
   | Automated permission checks | Count guardian checks separately so that stage 3 can measure their reduction. |
   | Guard activations | Count the controls introduced by stage 3. |
   | Test disputes | Count disputes raised under stage 5. |
   | Seven-day rework | Record the follow-up change type and the delivery it corrects. Flag observation windows still open. A later touch of the same file can be routine development and is insufficient evidence of rework. |

3. Check the current hook documentation for Codex and Claude Code. Map available
   events to the common schema. For each harness in the defaults, document its
   event source and check it against real logs.
4. Obtain approval of the event schema.
5. Implement the collector. Record the task key at start and on a change of task
   in the chat (`task.started`, `task.switched`). Preserve attribution after
   worktree deletion. Collector failure allows task execution to continue.
   Read task, audit-report and development-log locations from the profile so a
   project can use a subset of the methodology. Write a local append-only log
   with an allowlist of task and operation IDs, actor role, time, outcome, SHA
   and numeric counters. Normalize command names to action types. Process
   source logs locally. Exclude full commands, user text, email, OTPs, invitation
   URLs, environment variables, request headers and file contents. Keep the
   resulting scores unavailable to agents as optimization targets.
6. Deliver the collector separately from the retrospective skill, as a skill
   or a set of scripts. Reuse the general parts of the prototype for harness
   logs, the GitHub API and audit records. Supply paths, branch conventions
   and work-item formats through the profile.
7. Describe in the [adoption guide](../../ADOPTION.md) how a project derives its
   baseline from existing logs, Git and CI **before** enabling the collector.
   I1 is the first check of this procedure.
8. Pilot the collector on a real task in an adopting project. Partial adoption
   is suitable. Reconstruct the task across issue, PR, worktree, child sessions,
   worktree deletion and a chat changing tasks. Compare active work, actual
   operator blocks and audit intervals, including a response arriving during
   independent work. Reconcile runner and Actions events across a HEAD change,
   cancellation, retry and parallel jobs without double counting. **Seven days
   after merge**, classify follow-ups by purpose and compare with a manual
   chronology. Report calendar time, each kind of activity and the unexplained
   remainder. The share of intervals with a known cause must improve over I1
   and the difference from the manual chronology must be explainable. The
   owner decides whether to retain the collector after this pilot.
9. Add collector setup to the adoption guide and put concrete commands in the
   defaults.

**Completion requires** an approved schema, a pilot meeting the criterion in
step 8 and the owner's decision, working collection in both harnesses, and
documented setup and baseline procedures.

## Stage 2. Evidence-based retrospectives

Use computed evidence to locate a problem in the layer that can correct it.

1. Make the collector summary a required input to the retrospective skill.
   Scripts compute the figures and the model interprets them. Verify each
   quotation verbatim against its log. Include a control row for a resolved
   problem expected to remain at zero. Keep findings, negative verdicts and
   causes as separate counts. Link repeats to their original observation.
   Give each observation a disposition and a control that closes it.
2. Attribute the cause to the environment and tools, harness configuration,
   portable methodology, project adaptation, skill, or requirements and
   specification. Attribute it to model behavior only after excluding those
   alternatives. Direct the remedy to its owner. In a partial adoption,
   compare the local rule with the actual package rule before proposing a
   change to the package.
3. Prioritize remedies by frequency and time lost. At equal cost, address
   environment and tooling problems first.
4. Assign a confirming metric to each remedy and look for a reduction, ideally
   to zero. For a rare case, introduce a known defect that makes the check
   fail. On the next comparable change, determine where the problem was first
   found and whether audit or manual acceptance led to rework. Record
   effectiveness as unknown until a comparable case occurs.

**Completion requires** an updated skill that passes blind trials and a first
retrospective performed on the new data.

## Stage 3. Move rules into deterministic controls

Produce an approved rule-to-control register and reduce the amount of
instruction text that agents and auditors must read.

1. Inventory rules across the methodology and skills that a mechanism can
   check without model judgment. Candidates include unique explicit anchors
   and resolvable internal links, including inbound links from unchanged
   files. The package already requires link checks. Put the adopter default in
   [documentation defaults](../../defaults/documentation.md). Another candidate
   is a lock for checks competing for a mutable database or environment.
   Chapter 08 owns the principle and the profile identifies resource types.
2. Choose the least restrictive reliable control for each rule. Consider
   permission rules, hooks, required CI checks, branch protection, absence of
   credentials and sandbox isolation.
3. Make each enforcement guard fail closed. Exercise awkward inputs such as
   multiline commands, unusual filenames and empty strings. Back a path
   protection hook with CI to catch writes through a shell. Use a clean input
   and a known diagnostic that fails for the expected reason. A deliberate
   weakening of a threshold must be detected. Determine success from the exit
   code. Configure relevant warnings and diagnostics to affect it so a clean
   last line cannot hide a failure.
4. Describe the concrete mechanisms for Codex and Claude Code separately in
   the defaults. Keep chapters at the principle and reference level.
5. Remove the transferred instruction or reduce it to one reference. Remove
   the mechanically covered rule from the LLM audit's scope.
6. Check the logs after adoption for actual guard activations and a reduction
   in guardian permission checks.

**Completion requires** register approval, implemented and tested controls,
shorter methodology and skill text, and activations visible in the metrics.

## Stage 4. Respond to audit findings

Add the closure rule to [chapter 06](../../method/06-verification.md) and
update the finding format used by review skills.

1. Assign each finding a type. **(a)** is deterministically verifiable, such
   as a defect, missing check or weak test. **(b)** requires judgment about
   structure, architecture, an algorithm or a meaning-changing document edit.
   **(c)** is non-blocking. **(d)** is outside the task.
2. Fix all blocking findings as one batch. Run expensive checks once after
   the batch.
3. Close type (a) with a test that fails before the fix and passes afterwards
   through the same operation and transport as the requirement. This closes
   the finding without another audit. A domain reviewer still checks the delta
   for security, money, permissions and migrations.
4. Give type (b) one delta audit. Supply the original findings, fix commits,
   delta diff and check results. Verify the fixes and problems introduced by
   the delta. Carry forward coverage of unchanged parts.
5. Preserve the previous audit for a document edit that keeps its meaning.
6. An executor who disagrees submits an evidence-backed objection for the
   delta audit or the operator to resolve. Keep it open until disposition.
7. Refer type (d) to the owner for separate disposition.
8. Retain the existing limit on audit rounds.

**Completion requires** the revised chapter and review template, a type on
each finding produced by the reviewers, and an audit-round comparison with
the baseline.

## Stage 5. Baseline tests after specification

Add a first plan step for tasks that change observable behavior. Freeze the
baseline tests so the implementation is evaluated against the agreed public
contract.

1. The specification identifies the public test boundary, including routes,
   fields, error codes and accessible UI names where applicable. Trace every
   condition in a baseline test to a source or owner decision. Refer
   unsupported conditions to the owner before they become frozen assertions.
2. Assign the baseline to a separate agent with access to the specification
   alone and no knowledge of the future implementation.
3. Exercise the public API, data contract or user path. Trace each test to an
   acceptance criterion and use the exact operation and transport it names.
   A race on another operation or an HTTP helper in place of the browser
   request would test a different contract.
4. Run every new baseline test before implementation and observe failure for
   the intended reason.
5. The baseline commit records a hash manifest covering protected tests,
   runner configuration and exclusions, fixtures and snapshots, coverage
   thresholds and `skip` markers.
6. A hook rejects changes to protected paths during implementation. CI checks
   the diff against the manifest.
7. Implementers may add tests of their own alongside the baseline. When an
   implementation test supplies evidence of a race, retry or change of rights,
   use an older snapshot or a controlled violation to show it can distinguish
   the outcomes.
8. Change a baseline test through a dispute. The implementer identifies the
   test, the specification clause and the conflict. Mark it disputed and
   continue independent work. The specification owner resolves contradictions
   with the specification. When the specification is clear and the test is
   faulty, the test author corrects it directly. Resolve disputes together at
   the next checkpoint.
9. For a refactor, existing tests form the baseline. Documents and small
   corrections are exempt from the added step.
10. After rollout, focus specification-conformance audits on the behavior the
    tests leave uncovered.

**Completion requires** chapters 02, 03 and 06 and the plan template to reflect
the route, a working manifest and enforcement, and a medium-risk task pilot.
Compare task duration and the number of disputes with the baseline.

## Stage 6. Merge train

Add a conditional practice for a project where expensive checks take materially
longer than fast checks **and** ready PRs delay one another. Look for rebases,
reruns after a base update and time spent waiting to integrate. Use stage 1
metrics to establish the trigger. The I1 reference project did not show it.
A different project's repeated CI runs and long end-to-end suite motivated
the proposal. Projects outside the trigger use the existing
[integration queue](../../method/07-integration.md#integration-queue).

The train assembles ready PRs into one candidate, runs the expensive suite
once or twice, excludes offending changes where necessary and integrates the
tested tree. The operator gets a single morning report. Admission depends on
stage 3 for branch protection and the train identity, stage 4 for a completed
audit, and stage 5 for trusted tests. Extend the stage 1 collector with train
metrics.

1. **Select the GitHub default.** Verify against the provider documentation
   whether the native merge queue supports scheduled admission and one run
   for a batch. The proposal assumes groups start on arrival and proposes a
   script on a runner that can access the expensive test environments.
   Describe the selected implementation in the defaults and the principles in
   chapter 07. Treat provider behavior as a fact to verify.
2. **Establish write authority.** Protect the integration branch. Only the
   train's account may write to it. Agents have no merge permission.
   Documentation-only PRs on profile-listed paths take a fast route via the
   same bot after fast checks. They wait for any active train so its base
   cannot move during the run.
3. **Admit PRs.** The script owns the queue label. Require passing format,
   lint, type, build and package tests on the current head, affected end-to-end
   scenarios, task baseline tests and clean migration replay when migrations
   change. Require the audit verdict as a status on the same head SHA and a
   conflict-free integration with the branch. A new PR commit removes the
   label.
4. **Schedule runs.** Use a standalone scheduled project task in Codex. Use
   system cron only if the built-in scheduler is unavailable. The proposed
   default is every two hours during a night window. Set both in the profile.
   Try a non-blocking lock first. When the
   previous train is active, log a skip and exit immediately. A pending run
   starting later would violate this schedule, so check that property when
   selecting a concurrency facility. A process-owned lock such as `flock -n`
   releases on exit or crash. Enforce a maximum duration and report a timeout
   as an incident. The worst case includes two full runs plus diagnosis.
   Choose the interval with that duration in mind. A scheduled skip is normal.
   Exit an empty queue before allocating temporary environments. A manual
   urgent single-PR train takes the same lock.
5. **Recover at startup.** Clean up temporary branches, environments and
   database copies left by an interrupted train. Resource types come from the
   profile. If a preceding train merged but stopped before test deployment,
   first deploy the current branch to the lagging test environment.
6. **Assemble the candidate.** Take PRs in queue order, up to the profile's
   limit `N`. The default maximum is one migration PR per train. Merge each
   PR into a fresh integration base that includes earlier trains. Return a
   conflicting PR with its reason and leave resolution to its owner. A
   dependent PR travels with its parent and is excluded with it.
7. **Run and diagnose.** Run the profile's full expensive suite on candidate
   `C0`, for example end-to-end checks, database tests and a migration rehearsal
   on a disposable copy. Serialize suites sharing a mutable resource or
   isolate their environments. Allow one infrastructure retry. A second
   infrastructure failure stops integration and creates an environment action
   in the report. Rerun failed tests on `C0`. If they pass, accept the candidate
   under the plan's flaky-test rule and record a defect with an owner. A
   recurrence of the same flaky test within `M` days makes that action blocking.
   For reproducible failures, rerun just the failing tests on queue prefixes.
   If a pair fails only together, exclude the later PR. Remove that PR and its
   dependants to form `C1`. Give `C1` the second and final full run. A red
   `C1` stops the train without a merge.
8. **Integrate and deploy.** Fast-forward the branch to the tested candidate
   with a check against the expected branch OID. Mark the integrated PRs as
   merged. Deploy to the test environment and read back its revision when the
   profile requires it. Production requires an operator decision and a tree
   that passed the train.
9. **Return excluded PRs.** Comment with the reason, failed test, run ID and
   log locator. Use stage 4 type (a) for the fix. Count the exclusion as a
   fix/check cycle under chapter 14. A second exclusion for the same cause
   stops the task pending an operator decision.
10. **Use a read-only diagnostic agent.** Give it failed-test and log
    summaries. It writes a causal analysis for the report and may suggest a
    PR to check first. Test runs determine the exclusion.
11. **Report the night.** The script records the facts for each train. One
    morning summary puts decisions awaiting the operator first, followed by
    merges, returned PRs and reasons, flaky tests, incidents, skipped runs
    and the remaining queue.
12. **Update the rule owners.** In chapter 03, an enabled train may integrate
    into its protected branch without a hard stop. Keep stops for production,
    migrations on real data and external effects. In chapter 06, move the
    expensive suite into the train and retain fast checks and affected
    scenarios on each task. In chapter 07, add a conditional section beside the
    existing queue covering the sole writer, frozen candidate, diagnosis by
    failing tests, budget of full runs, fast-forward to the tested tree and
    human resolution of conflicts. In chapter 12, the coordinator submits
    ready PRs to the queue. In the profile record activation and its basis,
    the expensive suite, temporary resource types, window, interval, timeout,
    `N`, full-run budget, migration PR limit, `M` and documentation paths.
    Put the GitHub Actions default, schedule defaults and report template in
    the defaults. Add the trigger decision to the adoption guide.
13. **Measure the train.** Add queue wait, exclusions by cause, flaky tests,
    full runs per train, train duration and skipped starts to the collector.
14. **Prove the route.** The seven test cases cover a failing PR, a pair that fails
    only together, a flaky test, a merge conflict, runner failure, termination
    mid-run and an overlapping start. Run in dry mode for several nights,
    exercising every applicable step with the merge suppressed. Compare each
    report with the operator's decision, then enable merging.

**Completion requires** updated chapters 03, 06, 07 and 12, the profile,
defaults and adoption guide. A project meeting the trigger must have branch
protection and the train account configured, all seven cases exercised,
the dry run completed and merging enabled. Verify the collector's train metrics
and compare time to acceptance and CI runs per task with the baseline.

## Stage 7. Default decisions in solo mode

This conditional practice lets an agent apply a predefined choice for material
decisions that are inexpensive to reverse. The owner confirms them in a batch.
The initial set of authorized classes is empty. Stage 1 supplies actual
operator-blocking time by cause. Stage 6 can supply the morning report.
A project without a train can produce a separate report.

1. **Decide whether to proceed.** After two weeks of `decision.requested` and
   `decision.resolved` events in solo projects, use the intervention type and
   blocking flag to count material decisions with an evident safe default and
   the overnight work they actually held up. If these waits are rare and
   permission requests dominate, stop this stage and address permission checks
   in stage 3. I1's question-to-answer intervals could include independent
   work. Estimates inferred from final messages cannot establish this trigger.
2. **Amend chapter 12.** A solo agent applies the profile default for an
   explicitly named class, records it and continues. If classification is
   uncertain or the decision is outside the class, dependent work waits for
   its owner. Irreversible actions require their ordinary authorization.
   Reconcile the chapter steps and the workflow.
3. **Define classes in the profile.** Extend the existing safe-default field
   to solo. For each class state its boundary, choice and whether a PR may
   merge before confirmation. Pilot two or three classes. Examples are an
   unspecified UI detail matching a nearby screen, a narrow interpretation
   of an ambiguous specification that leaves a wider interpretation open,
   and generic error text that discloses no data.
4. **Set minimum exclusions.** Keep irreversible actions and external effects,
   security and access rights, personal data, public contracts and data
   migrations, dependencies, and customer or contractual commitments outside
   default decisions. Projects may add exclusions.
5. **Record the decision.** Extend the decision template with the status
   “applied by default, awaiting confirmation” and fields for class, rejected
   alternatives, reversal cost and work already based on the choice. Keep the
   decision pending until an explicit response. Track dependent work built
   before confirmation.
6. **Control integration.** A PR with a pending decision can enter integration,
   including an enabled train, only when its class permits it. Otherwise
   finish preparation and checks and hold integration until confirmation.
7. **Confirm in a batch.** Give pending decisions their own section in the
   morning report. Show class, choice, reversal cost, dependent work and impact
   on existing users and data. State whether confirmation authorizes further
   investigation or the start of implementation. The operator confirms or
   changes each decision. A changed choice becomes a rework task. Transfer a
   confirmed decision to its owning document. Extend the requirements-decision
   skill to consume the batch. Set a cap on pending decisions in the profile.
   At the cap, new decisions in these classes wait for the operator.
8. **Audit authority.** Reviewers trace each material decision in the diff to
   the specification, an explicit confirmation or a recorded permitted class.
   An unrecorded decision is a finding even when its outcome appears sound.
9. **Measure the practice.** Add counts by decision class, share changed by the
   operator, time to confirmation, number pending at day end and operator
   wait attributable to material decisions.
10. **Reassess classes after one month.** A class with no operator changes may
    become a routine choice the agent makes without recording a decision.
    Narrow or remove classes with frequent reversals.

**Completion requires** a go/no-go decision based on stage 1 data. If the
stage proceeds, update chapter 12, the workflow, profile, decision template,
requirements-decision skill and review skills. Pilot two or three classes for
one month. Compare reversals and operator wait with the baseline.

## Stage 8. Task state and recovery after compaction

Split the handoff into a short, rewritable agent state file and an operator
report. Capture mechanical facts by script. After compaction, supply the state
file and a fresh snapshot to the agent. Measure and bound the cost of recovery.
Stage 1 supplies events and measurements for both harnesses. Stage 3 supplies
the mechanism for checking file size and invoking recovery.

1. **Establish the baseline.** Measure compactions per task and elapsed time and
   tokens from compaction to the first action that changes task state. Derive
   a baseline from existing logs. Repeated reading, cached input and many
   compactions in a shared chat justify measuring this boundary. They do not
   establish that a compaction lost a decision.
2. **Split the handoff.** The agent reads the task state file after compaction,
   failure or a session change. Move Result and Final reconciliation to the
   checkpoint/closure report in the PR or task for the operator and next owner.
   Keep it off the routine compaction read path. Replace the competing terms
   “snapshot” and “recovery ledger” for the hand-maintained artifact in chapter
   03 and the PLANS template. Define the chosen term in the glossary.
3. **Keep one file per task.** Put it in the worktree at a path defined in
   defaults. Keep it out of task commits so state updates cannot invalidate
   PR-head evidence or queue labels. Overwrite it and enforce a profile line
   limit (150 is an example). Keep short, verbatim source and operator
   constraints, current step, next permitted step, open decisions and blockers,
   active operations with output and exit-status locations, fix/check counts
   and audit rounds. A chat normally follows one task. On a switch, update
   the previous file, load the next file and emit `task.switched`.
4. **Move closed items to their owners.** Put accepted decisions in the owning
   document under chapter 13 and completed checks and operations in the PR's
   development log. Keep at most a reference in the state file. Reuse the
   existing stores.
5. **Produce a fresh snapshot.** Use a short, stable format for repository,
   worktree, branch, HEAD, base, upstream, ahead/behind, staged, unstaged and
   untracked changes, PR/task/run IDs, CI and publication status, and owned
   active processes and temporary resources with remaining lease if applicable.
   Projects define resource types in the profile. Read these values afresh on
   recovery. Name an unavailable field and hold the action that depends on it
   until it can be reconciled. Describe the script in defaults.
6. **Refresh the state file** at each plan-step boundary, before a long run,
   before handoff or a hard stop, and at the end of a stage.
7. **Invoke recovery after compaction.** Check the session-start event whose
   source is `compact` in Claude Code and establish the Codex equivalent
   during stage 1. Supply the task file and a fresh snapshot. The first action
   is reconciliation, before polling processes or resuming other work. Report
   a missing or oversized file explicitly. If the hook fails, continue via
   the [chapter 12 recovery procedure](../../method/12-agents.md#context-recovery).
8. **Enforce the size limit.** Reject an oversized write. Move closed items to
   their owners and write the file again.
9. **Pilot a fresh session at checkpoints.** On several tasks, start a new
   session from the state file. Compare it with ordinary compaction on time
   and tokens to first action, sources reread, resumption errors and tokens
   per accepted task with cached input shown separately. Record whether a new
   session at a checkpoint should become a rule.
10. **Update the rule owners.** In chapter 12 describe step-wise updates,
    first-action reconciliation with the file and snapshot, and rereading only
    operator instructions received since the last state update. Chapter 03
    refers to both artifacts. Reconcile the chapter 12 steps and workflow
    step 8. Update the PLANS template term, glossary, profile limit, default
    path, snapshot script and harness hooks. Align step 9 of the implementation
    skill's task-switch handoff with the file's source, scope, state and next
    action.
11. **Run three drills.** Trigger a manual compaction mid-step and verify the
    first action is reconciliation and work resumes at the recorded step.
    Interrupt a session and recover in a new session from the file and
    snapshot. Compact during a long run and read its result from the saved
    output location without repeating it merely to recover the outcome.

**Completion requires** a measured baseline, split templates, updated chapters
03 and 12, workflow, glossary, PLANS template, profile, defaults and
implementation skill. Exercise the snapshot and recovery hook in both
harnesses or document a harness's missing event. Complete the drills, record
the fresh-session pilot decision, and compare time and tokens to the first
state-changing action with the baseline.
