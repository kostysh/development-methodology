# v5 delivery and evidence

The [adoption-readiness plan](adoption-readiness.md) governs v5.
The [external review follow-up](external-review-resolution.md) records the
four adoption blockers in 5.0.0 and the verification of their 5.0.1 fixes.
The [5.0.0 acceptance record](release-acceptance.md) identifies the earlier
archives and the results observed in that particular clean project.
The November 26 and December 3 pilot checkpoints were cancelled. They
impose no wait on adoption or enabling approved solo classes or the train.

| Stage | What an adopter receives | What to verify in the project |
| --- | --- | --- |
| 1. Measurement | Installed Codex and Claude hooks, task binding, Git/GitHub/CI and operation inputs, and a report. [Real client results](native-acceptance.md) | Observe an actual tool and compaction in each selected client. Check the first PR and acceptance against timestamps. |
| 2. Retrospectives | Separate verdict, observation, cause and correction counts. [Worked retrospective](pilot-retrospective.md) | Trace a repeated finding to its actual cause and retain missing evidence. |
| 3. Controls | Installed link, artifact, Git, required-check and shared runner controls. [Control evidence](control-acceptance.md) | Verify a clean and a failing case at each enforcing boundary selected in the profile. |
| 4. Audit | Four finding types, response and re-audit rules and independently scoped reviewers. [Closure rules](../../method/06-verification.md#closing-review-findings) | Trace a real finding to a failed check, correction, and applicable independent decision. |
| 5. Baseline tests | Specification-derived tests protected by an installed manifest verifier, native edits guard and trusted CI. [Frozen 27-case evidence](control-acceptance.md) | Verify a changed committed test is rejected and the clean SHA passes. Missing time/dispute history produces insufficient data. |
| 6. Merge train | An installed GitHub writer, queue, isolated suites, bounded retries, deployment readback and six operational measures. [Two actual GitHub merges](train-runtime-acceptance.md) | Commission the chosen target branch, writer, trusted checks, frozen PR heads and test environment. |
| 7. Solo decisions | Delegated choices, a pending limit, ordinary chat decisions and the project's publication check. [Setup](../../defaults/solo-decisions.md) | Exercise a delegated choice, an exclusion, the owner's reply and a correction. Verify the independent publication boundary if enabled. |
| 8. Recovery | Bounded local task state and a fresh snapshot after compaction, with saved operation results. [Native recovery evidence](native-acceptance.md) | Trigger compaction and recover the original revision, saved output and exit status. |

## November 19 historical snapshot

The following table describes the earlier candidate. Dates, deferrals and
open gates in this snapshot were superseded by the November 20 plan.

| Stage | Verified on the development branches | Remaining acceptance |
| --- | --- | --- |
| 1. Measurement | The installed collector observed task-scoped Codex, Claude and GitHub data. Its pre-PR and acceptance intervals matched the manual chronology. Both sources record one verified corrective follow-up so far. [Real pilot](pilot.md#pilot-results) | Several event families have partial coverage. Seven-day follow-up on November 26 at 19:22:27 UTC, then the owner's retention decision. |
| 2. Retrospectives | Chapter 14, the form and the independently accepted skill distinguish verdicts, observations and causes. The final skill passed both matched cases and a separate incomplete-data case. The [first real retrospective](pilot-retrospective.md) reconciled one negative verdict and two findings, then reproduced the corrected guard behavior. [Skill revision and trial records](https://github.com/kostysh/skills/commit/082e6d78720c87e047e2ad08be45a4528259876c) | Stage deliverables accepted. Field recurrence and delivery impact need a comparable follow-up. |
| 3. Controls | The orchestrator approved the [nine-group register](../../defaults/controls.md) for this pilot and transferred the parsed Markdown link and anchor checks to repository CI. On the real guide change the checker rejected a stale incoming link in both continuations. The [collector counted six activations and two blocks](recovery-pilot.md#observations). [Initial CI](https://github.com/kostysh/development-methodology/actions/runs/44588232482) | Template paths in code spans, target meaning and checks outside the configured renderer remain with reviewers. An adopter verifies each selected control at its own boundary. Comparable guardian counts are unavailable. |
| 4. Audit closure | Chapter 06, review form and six skills implement finding types. In two blind case pairs the candidate passed both, the baseline passed one. The owner accepted a one-time exception for case registration after the candidate edit. The independent re-audit passed. [Skills evidence](https://github.com/kostysh/skills/commit/2611fb5ff912387473916a8bb46bf81b78315e70) · [Counts from I1 and the real pilot](pilot-retrospective.md#comparison-with-the-earlier-audit-process) | The historical study and this task have different risk and scope. The change in rounds and quality on comparable real tasks remains unmeasured. |
| 5. Protected tests | The [medium-risk pilot](pilot.md#pilot-results) merged after native host checks, a failing and passing trusted CI comparison, and independent acceptance of the restored head. | The old binary was absent. Initial semantic failures for deeper assertions and a comparable historical duration or dispute baseline remain unavailable. Server-enforced branch protection is open. |
| 6. Merge train | The [conditional route](../../method/07-integration.md#merge-train), [GitHub default and seven cases](../../defaults/merge-train.md), profile and adoption steps are available. The only observed PR into `v5` merged without a competing ready PR. Its [merge verification job](https://github.com/kostysh/development-methodology/actions/runs/44597637068) took 29 seconds. | The owner deferred the write-capable train and night runs until a project demonstrates the trigger. The agreed `v5` scope is portable guidance, seven verification scenarios and [observation metrics](train-metrics.md). Live protection, integration and deployment belong to that later pilot. |
| 7. Solo decisions | The owner opened a [14-day prospective window](solo-observation.md) for future explicitly designated solo tasks on `v5`. Only decision types and actual blocking boundaries are in scope. It opened with zero enrolled tasks and no authorized default classes. | Review the observations on December 3 at 20:25 UTC. Sparse evidence leaves the decision open. A separate owner decision starts a one-month pilot if warranted. |
| 8. Recovery | The two handoff artifacts, chapter routes, installed recovery command and [accepted skill](https://github.com/kostysh/skills/commit/53beaffbc97c65e0a33d26071353fb7f1fd674b4) are implemented. Native compaction, interruption and recovery of an existing run were exercised. The [three real task pairs](recovery-pilot.md#decision) support keeping fresh sessions optional. [Tests and archive](recovery-test-evidence.md#accepted-implementation) | Exact first-action and compaction token costs are partial. Codex automatic packet delivery used a synthetic model endpoint; authenticated paired jobs used explicit recovery. The Claude graphical panel was outside the host drill. |

The pre-edit registration for stages 2 and 8 was frozen on 2026-11-19 at
18:44:02 UTC. Its SHA-256 manifest digest is
`5a9d13c71143b8ac46e0f740401ff69ada1e44db8f459d8c73921b8393dfcc79`.
The coordinator supplies each executor only its assigned materials.

For stage 3, the three documents that owned the transferred link check
became 115 words shorter together. The [documentation skill revision](https://github.com/kostysh/skills/commit/5f5b27c9288ecbc04e5af36cb85fa82cb168032e)
removed 21 active words. In both matched cases, each skill version reused
current structural evidence or reran an outdated check as appropriate, and
tested the reader's operation. The independent review passed. That result
establishes a shorter instruction with preserved behavior on those cases.
It does not establish saved time across project work.

For stage 1 source research, a task-owned Codex rollout produced by app-server
`0.169.0-alpha.11.1` contained 13 distinct per-response usage records and
12 cumulative snapshots. The separate PATH CLI reported `0.170.0`. The
maintainer's Claude Code extension manifests included version `2.1.328` with
a bundled native executable. The [official guide](https://code.claude.com/docs/en/vs-code#switch-between-extension-and-cli)
documents shared local history between the panel and terminal. Stage 8 later
observed [live Claude compaction using the bundled terminal](recovery-pilot.md#native-hook-and-interruption-checks).
Each adopting project selects and tests its own client.
