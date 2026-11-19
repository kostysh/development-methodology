# Requirements for executing the development plan

**Status — draft for the methodology owner and the maintainers of its tools.**
The owner requires every script delivered under this plan to be built from a
properly configured package and covered by the tests it needs. The contract
below defines observable acceptance for that requirement. It applies equally
to executables shipped with a skill, invoked by a hook, or run in CI.

The [plan](plan.md) owns the eight stages, triggers, exceptions and pilot
criteria. The [impact matrix](impact-matrix.md) contains estimates. The current
package boundary and the rules for releasing an update come from the
[repository instructions](../../AGENTS.md). Preparation and any subsequently
authorized changes in this repository target the `v5` branch. A methodology
release and any rollout in an adopting project are separate decisions.

## Requirements for the methodology

| ID | Required outcome | Acceptance evidence |
| --- | --- | --- |
| M1 | Each changed rule MUST have one owner in the applicable layer. Place principles, conditional triggers, concrete defaults and project values in their respective layers. Project examples used in research stay with their evidence owner. | A maintainer can trace the rule to one owning section. An adopter can configure the practice using the package, its profile and the chosen tools. |
| M2 | Changed instructions MUST agree across the owning chapter, its steps, the applicable work route, profile, defaults and templates. Skill references and artifact formats follow existing ownership. | Walk the affected route, including a failure or exclusion. Check relative links and anchors, glossary terms and commands against the named tool version. Verify that an actual user or agent can reach the intended next step. |
| M3 | Adoption guidance MUST identify what enables each mechanism, how a project verifies it, and what to do while it is unavailable. Retire a review obligation only for a project where its replacement covers the same rule and is working. | Walk a full and a partial adoption. With missing collector data, a retrospective may report supported observations and must identify unavailable metrics. A stage 2 completion claim requires the computed input. An absent or failed enforcement control cannot silently remove a mandatory check. |
| M4 | Each stage MUST preserve its specified gates, independent roles, exceptions and completion criteria. | Compare the delivered result with the corresponding stage in the plan. Stages 6 and 7 require their own trigger. A stage 8 harness limitation is recorded with the working recovery route. |
| M5 | A claim of improved delivery MUST use comparable real tasks, a baseline and a quality outcome alongside time to acceptance. | Record task mix, measurement window, missing or overlapping intervals and subsequent rework where measurable. Distinguish a written rule, a control that passed its tests, and an observed improvement. Mark an inconclusive result explicitly. |

## Build and test contract

A **package** is the version-controlled unit that owns a script's sources,
build configuration, runtime dependencies, tests and distributable output.
One package may own several related scripts. A **built artifact** is the output
installed or invoked by the consumer. For an interpreted language the build
may assemble and validate an executable distribution. A **host** is the
actual caller, such as an agent harness, CI runner or scheduled job.

| ID | Requirement for every applicable package | Check that can expose a defect |
| --- | --- | --- |
| B1 | Every delivered script MUST belong to a package and be produced by its build. This includes collectors, adapters, guards, manifest tools, train and reporting scripts, snapshots and recovery hooks. | Map each executable used by the instructions, skill, hook or workflow to its package, source, build output and public entry point. Invocation configuration may select an entry point and pass inputs. Check that it cannot substitute an unbuilt copy or an inline implementation. |
| B2 | The package MUST declare its identity and version, supported runtime and toolchain, dependencies, build and test commands, output files, entry points and required runtime assets. Dependency resolution MUST be repeatable from version control, using the ecosystem's lockfile or equivalent where dependencies apply. | In a clean checkout with previous output removed, install declared dependencies and run the documented build. Check the emitted paths against the manifest. Missing inputs or a failed build must return a failure status rather than leave an old artifact eligible for release. |
| B3 | Each public entry point MUST work from the built distribution in the environment and invocation mode promised to its consumer. | Pack or stage the distributable output. Install it in a fresh location outside the source checkout, with only declared runtime dependencies. Invoke each documented command or hook entry point in its successful case and with invalid input or a failed precondition. Assert output, exit status, diagnostic and side effect as applicable. This catches missing assets, executability, module-format and source-path errors. |
| B4 | The package MUST include automated tests matched to the behavior and risk of every delivered script. Its canonical test command MUST discover and run them. | Use unit tests for applicable transformation or decision rules, contract tests for public inputs, outputs and error handling, and integration tests at the real boundary the claim depends on. Each enforcement rule needs a known violation and a clean control. Test malformed or missing input, relevant edge cases and a previously observed defect where applicable. A deliberate defect must turn the corresponding test red for the expected reason. |
| B5 | A package that depends on a harness, log format, provider or shared resource MUST state the versions or capabilities it supports and its behavior when the dependency changes or fails. | Use deterministic, sanitized fixtures for repeatable regressions. Exercise the built integration on each claimed host at its real entry point. Simulate missing capability and interrupted input. Record the tested versions and any limit on support. Use a disposable resource or dry mode for checks with external effects. |
| B6 | A script with state or side effects MUST preserve its stage's rules for authority, retries, concurrency, interruption and recovery wherever they apply. | Drive two contenders, retry an interrupted operation, or change the observed revision between check and write as appropriate. Assert the resulting state through an independent readback. Verify cleanup and ownership of affected resources. A routine parser with no such effects only needs tests of its own contract. |
| B7 | CI for the owning package MUST run its checks, clean build, automated tests and distribution smoke test on the revision intended for delivery. Integration or release of the tool MUST require successful results for that revision or a verified identical artifact under the repository's existing rules. | A broken build, a missing public entry point or a failing required test blocks delivery. Record the revision, package version, artifact identity and check results. Confirm that the installed artifact exercised by the smoke test is the one supplied to adopters. |
| B8 | The adopting project MUST be able to identify the tool release in use and recover a working configuration after a bad update. | Provide versioned installation, compatibility, upgrade and recovery instructions in the appropriate owner. Exercise an update and the return to a previously verified version when the delivery changes an existing installation. Restore previously effective protection before resuming a guarded action. |

The package owner chooses the language, package layout, build tool and test
runner. A package can reuse the owning repository's existing toolchain and CI.
For TypeScript, for example, a clean build and installed invocation must agree
on emitted files, module format and runtime dependencies. Test sufficiency is
judged by the contracts and failure cases above and below. A single coverage
percentage would leave an untested installed entry point undetected.

## Verification by stage

These checks connect instruction changes to actual behavior. Use them alongside
the completion criteria in the plan. Stages concerned only with guidance or a
skill use the applicable walkthrough, blind trial or real task. The package
contract applies whenever a stage delivers executable code.

| Stage and consumer | Positive evidence | Failure or boundary to exercise |
| --- | --- | --- |
| [1. Collector](plan.md#stage-1-process-metrics) | Both harnesses emit attributable events. Compare a real task with a manual chronology, including task switches, deleted worktrees, forks, CI retries and the seven-day follow-up. | Inject duplicate/parallel events and synthetic private values. The reported durations and counts do not double count, and the output contains only allowed metadata. A collector failure lets work continue and leaves a visible gap in evidence. |
| [2. Retrospective](plan.md#stage-2-evidence-based-retrospectives) | Blind trials and the first real retrospective verify distinct counts, causal attribution and the control for a previously resolved problem. | Repeated findings must not inflate the number of causes. With incomplete evidence, a reviewer identifies the missing fact and limits the conclusion. |
| [3. Guards](plan.md#stage-3-move-rules-into-deterministic-controls) | Allowed input passes in each claimed host. A known violation reaches the real hook or mandatory CI check and blocks the action. | Exercise a guard failure, an awkward path or multiline input, and a deliberately weakened threshold. Check a protected write via a shell at the CI boundary. Verify the exit status. |
| [4. Audit closure](plan.md#stage-4-respond-to-audit-findings) | A type (a) test fails on the earlier snapshot and passes on the fix through the required operation and transport. Type (b) receives a delta review. | A test through another operation cannot close the finding. Verify that security, money, permissions and migrations still receive domain review. |
| [5. Protected baseline](plan.md#stage-5-baseline-tests-after-specification) | In a medium-risk pilot, trace each baseline assertion to its source and initial failure. The implementation passes the protected tests. | Try to change a protected test, fixture, runner exclusion, threshold or skip marker. Verify both hook and CI enforcement. Exercise a mistaken test through the dispute route and preserve independent work. |
| [6. Merge train](plan.md#stage-6-merge-train) | Run all seven plan cases and the required dry nights. Verify the expected branch OID, integrated tree, reported PRs and any test deployment by readback. | Exercise overlapping trains, a moving branch, dependent PRs, a failing second candidate and a crash between merge and deployment. Only the permitted account may update the branch. Distinguish the train's explicit flaky-test policy from a failed mandatory build or test of the train package itself. |
| [7. Solo decisions](plan.md#stage-7-default-decisions-in-solo-mode) | After the trigger is met, trace each applied default to its class, pending record, operator confirmation or change, and eventual owning document. | An excluded or ambiguous class, a reached cap or a missing merge permission holds the corresponding action. Silence leaves the decision pending. |
| [8. Recovery](plan.md#stage-8-task-state-and-recovery-after-compaction) | Exercise manual compaction, session interruption and compaction during a long run. Observe reconciliation as the first action, then compare the fresh-session pilot with the baseline. | An oversized write is rejected. A missing file, stale ref or unavailable field is visible. A failed recovery hook selects manual reconciliation under chapter 12. The recorded output suffices to recover a completed run without replaying it. |

## Decisions and handoff

The owner still needs to choose the tooling repository and maintainer, and the
supported package and host versions before promising a distribution. Stage 1
will establish actual hook availability. Each conditional stage has its own
adoption decision. These decisions affect the relevant delivery. They can be
made separately as the evidence becomes available.

For a methodology release, record adoption actions in the changelog and bump
the version in the README. For a tool release, associate the instructions with
the verified package version and its build and test results. Report the outcome
of real pilots separately from structural checks of the documents and packages.
