# Impact matrix and conclusions

**Stage 3 has the widest review scope. Stage 5 changes everyday feature work
the most. Stages 1 and 6 carry the greatest tooling and maintenance cost.**
Stage 8 also needs substantial implementation. Stage 7 moves the most
decision authority, even though it involves relatively little code.

The [implementation and evidence matrix](status.md) records what shipped to
the development branches, what the owner deferred and which pilots are open.

This assessment compares the [eight-stage plan](plan.md) with
[version 0.4](../../README.md) at `d923b29`. That revision contains 35
Markdown files and 3,373 lines of Markdown, including 1,903 lines in the
15 method chapters. The tracked tree contains no CI configuration. The three
project-specific prototype scripts examined for the estimate contain 1,125
lines of TypeScript. One reads SQLite and session logs directly, which makes
format compatibility a real maintenance cost.

S means a localized edit. M means several coordinated changes. L means a new
practice or tool. XL means a whole-corpus inventory, a major lifecycle change
or several mechanisms that must work together. The two columns estimate
different kinds of work. The ratings express relative scope and do not imply
staffing, line counts or a delivery date.

| Stage | Change from 0.4 | Methodology package | Tooling, pilot and effect on the adopter |
| --- | --- | --- | --- |
| [1. Metrics](plan.md#stage-1-process-metrics) | The profile's five trial-task indicators gain a historical baseline and 13 measurement groups. The first question is where time before PR creation goes. | **M.** Adoption procedure, profile alignment and defaults. | **XL.** Correlate tasks across Codex, Claude Code, Git and CI. Protect the content of logs and expose attribution gaps. Pilot one real task and reconcile follow-ups seven days after merge. The owner then decides on permanent collection. The plan gives no three-week minimum. |
| [2. Retrospectives](plan.md#stage-2-evidence-based-retrospectives) | Evidence reconciliation and deduplication already exist. The skill gains a required computed input, cause attribution by layer, and a check that the remedy worked. | **S.** The main change belongs to the retrospective skill. | **M.** Blind trials and a first retrospective on new data. A project with missing collector data needs a way to state exactly which conclusions it can support. |
| [3. Deterministic controls](plan.md#stage-3-move-rules-into-deterministic-controls) | Transfer mechanically decidable rules to hooks, CI, permissions or isolation. Retire the corresponding audit checks when the mechanisms cover them. | **XL for the inventory.** The register determines how many files will actually change. | **L–XL.** Prove that valid work passes, a known violation is caught and a broken guard blocks the action. A CI workflow owned by this repository is one implementation option. The number of skills requiring edits is still open. |
| [4. Audit findings](plan.md#stage-4-respond-to-audit-findings) | Delta review and round limits already exist. A regression test on the required operation and transport can now close a deterministic finding. Judgment calls get a delta audit. | **S–M.** Chapter 06 and the review form. | **M.** Update reviewers and responses. Preserve domain review of fixes involving security, money, permissions and migrations. Compare audit rounds with the baseline. |
| [5. Baseline tests](plan.md#stage-5-baseline-tests-after-specification) | A separate agent writes tests from the specification before implementation. The baseline is frozen and disputed tests have an owner. Refactors use existing tests. Documents and small corrections are exempt. | **XL for the task lifecycle.** Chapters 02, 03 and 06, the plan template and the work route. | **L.** Supply an independent author, manifest, hook and CI verification. Pilot a medium-risk task. The main risk is freezing an invented requirement. A dedicated new skill is optional. |
| [6. Merge train](plan.md#stage-6-merge-train) | The existing integration queue gains scheduled batch checks, a sole branch writer, failure isolation and a morning report. | **L, conditional.** Affects planning, verification, integration, coordination and adoption. | **XL when enabled.** Maintain a runner, protection, identity and recovery. Exercise failures, run dry for several nights and then enable merges. Expensive tests and interference among ready PRs must both be observed. I1 did not meet the trigger. |
| [7. Solo defaults](plan.md#stage-7-default-decisions-in-solo-mode) | The owner preauthorizes classes of reversible material choices. The agent records and applies a default. The owner confirms or changes it in a batch. Each class controls whether integration may precede confirmation. | **M, conditional.** Significant change in decision authority. | **M when enabled.** Measure genuine blocks for two weeks before deciding whether to proceed. Pilot two or three classes for one month. A separate summary works in a project without a train. |
| [8. Context recovery](plan.md#stage-8-task-state-and-recovery-after-compaction) | A short agent state file and fresh mechanical snapshot replace the combined handoff on recovery. The operator keeps a checkpoint/closure report. The state file is updated at each step and before long runs. | **M.** Two chapters, work route, templates, profile, defaults and glossary. | **L.** Build and test snapshot, hooks and size enforcement. Exercise three interruption cases and compare session strategies on several tasks. Document a harness limitation if the required event is unavailable. |

## Conclusions

1. **The largest structural change is maintaining executable tools.** The
   owner chose a separately built companion in this repository's `tools/`.
   Adopters still copy portable guidance and blank templates. The maintainers
   now own versioned builds, host compatibility and installed-package tests.
   [Package boundary](../../AGENTS.md#scope) ·
   [Execution requirements](requirements.md#build-and-test-contract)
2. **Three chapters concentrate the coordination work.** Chapter 03 appears
   in stages 5, 6 and 8, chapter 06 in stages 4, 5 and 6, and chapter 12 in
   stages 6, 7 and 8. Stage 5 changes the published work route, so chapter
   steps and the workflow must agree. Edits to chapters 13 and 14 are plausible
   follow-ups, subject to a concrete need. Stage 3 calls for shorter text at
   that stage. The total change in core length depends on the inventory.
   A forecast of 13% growth or a zero-growth release cap has no agreed basis.
   [Maintenance rules](../../AGENTS.md#scope) ·
   [Existing feature route](../../WORKFLOW.md#feature--medium-or-high-risk)
3. **Partial adoption needs explicit behavior.** Permanent collector use is
   an owner decision, while stage 2 requires its data. The adoption guidance
   needs to say which retrospective output remains possible with missing data.
   A project also needs to know which checks remain with the reviewer until
   its own replacement controls have passed their tests.
   [Collector decision](plan.md#stage-1-process-metrics) ·
   [Control transfer](plan.md#stage-3-move-rules-into-deterministic-controls)
4. **Dependencies determine which stages can ship together.** Stage 8 needs
   measurements from stage 1 and the relevant mechanisms from stage 3.
   Combining stages 1 and 8 in an early release brings those mechanisms with
   them. Stage 6 needs the measured queue trigger and stages 3–5. Stage 7
   can use its own report. Pilot windows are specified separately. Release
   numbers and a calendar for the entire program are still open.

Even if both conditional practices are omitted, the collector, deterministic
guards, pre-implementation baseline tests and recovery tools account for
substantial work. Budget these four first when estimating the common route.
Judge the benefit on comparable real tasks using time to acceptance and
quality outcomes such as subsequent rework. The release of instructions or a
passing tool build alone cannot establish that benefit.
