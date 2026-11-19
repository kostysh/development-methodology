# Collector pilot on the methodology branch

The owner approved the stage 5 protected test manifest as the next
methodology task on `v5`. It is identified locally as
`V5-BASELINE`. It has an observable result. The built tool must accept a
clean baseline and detect a changed protected test or runner setting even
when a shell writes the file. The implementation has a natural branch, CI,
review, acceptance and integration history. Stage 5 owns its full contract.

| Decision | Authorized boundary |
| --- | --- |
| Integration | One issue and one PR into `development-methodology/v5`, using a temporary pilot worktree and topic branch. Record the accepted commit, actual merge time and worktree removal. |
| Evidence | Use only this task's declared agent sessions and child sessions, issued task events, Git refs, PR metadata, test exits, CI job/step metadata and review decisions. Inspect only allowlisted fields locally. Raw prompts, transcripts, command bodies, headers, credentials and source files stay out of the journal and repository. |
| Storage | Keep the private profile, identity key and journal outside Git in a task-specific local state directory. Configure any needed hooks only for the pilot worktree. Stop importing a shared session when its attribution becomes ambiguous. |
| Historical comparison | Before starting collection, record the observable project Git and CI milestones and missing sources. Independently reconstruct the pilot using the previous process's data sources. Compare the same window and denominator with the instrumented chronology. Keep the original I1 study as a calibration case. An unavailable historical denominator leaves the numerical cross-project comparison open. |
| Checks | Match issue, PR, revisions, worktree, sessions and explicit task switches. Record pre-PR activity, actual decision blocks, concurrent work, retries and any cancelled or stale attempts. Separate controlled exercises from events that occurred in delivery. A missing event stays unobserved. |
| Follow-up | At actual merge plus 168 hours, classify subsequent changes by their confirmed purpose. The owner reviews coverage, disagreement with the manual chronology and rework, then decides whether to retain the collector. Until then the pilot remains open. |

The owner authorized task-only collection and worktree-local hooks on
2026-11-19. The observer keeps a private manual chronology and a local
journal. On independent acceptance and green checks, the authorized target
for the temporary `pilot/v5-baseline-manifest` branch is `v5`.
Execution began at 18:40:09 UTC. [Issue 1](https://github.com/kostysh/development-methodology/issues/1)
opened at 18:42:50 UTC. The historical preflight identified a prior v5
package-check duration, with task acceptance, operator activity and
seven-day rework unavailable from the permitted earlier evidence. These
observations serve different measures. The general package contains no
project-specific pilot records.

The independent author registered the [27 public tests](baseline-test-evidence.md)
before implementation. The [manifest](pilot-baseline.json) binds them and five
build or execution inputs to trusted baseline
`537d54bfa1c1581ec27cc626b72a6f56514dfca5`. The collector's first import
attributed 41 usage events to the two task-owned sessions for specification
and tests. A second import counted 41 repeats. The journal had one additional
event for the execution start. Coverage of other work in the task remained
partial. [Draft PR 2](https://github.com/kostysh/development-methodology/pull/2)
opened at 19:02:29 UTC, 22 minutes and 20 seconds after execution began.
The [push](https://github.com/kostysh/development-methodology/actions/runs/44594072803)
and [PR check](https://github.com/kostysh/development-methodology/actions/runs/44594142725)
both failed at the missing built command on this pre-implementation revision.

For this PR the owner chose an operator-held integration gate. The orchestrator
re-runs one reviewed GitHub Actions workflow at its original revision.
It builds the verifier from that revision and reads only the Git objects of
the current PR head. Record the run attempt and the inspected candidate for
the controlled change and the clean revision. Before merging, require a passing
integrity result, green package checks and independent acceptance on the final
candidate, and supply that head SHA as the merge precondition. GitHub's native
run belongs to the original workflow revision. Server-side automatic merge
protection on `v5` remains open.

## Pilot results

The independent reviewer accepted `cd2aa689` at 19:21:55 UTC.
[PR 2](https://github.com/kostysh/development-methodology/pull/2) merged
that head into `v5` at 19:22:27 UTC on November 19, 2026. The merge tree
matches the accepted candidate. The [merge build](https://github.com/kostysh/development-methodology/actions/runs/44597637068)
passed. The integration owner removed the temporary branch and worktree
after checking ancestry and their contents. The private journal uses the
stable repository as its project root with the same task-bound sources.
The single-use [trusted workflow](https://github.com/kostysh/development-methodology/blob/eb975b39a70ac3229b59bd0e99210f1de1941f40/.github/workflows/pilot-baseline-check.yml)
is retained at its tested revision.

| Question | Observed result | Evidence boundary |
| --- | --- | --- |
| How long before a PR? | Manual chronology and collector both give 22 min 20 s from execution start to PR and 41 min 46 s to independent acceptance. | Calendar time for one task. Individual operator wait and complete activity attribution remain unavailable. |
| Can the ordinary suite detect a weaker assertion? | Replacing a version-and-output assertion with an exit-status check left the [package CI green](https://github.com/kostysh/development-methodology/actions/runs/44596637507). The pinned verifier rejected that change and returned 0 after restoration. | The [failed attempt](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/2) inspected `3178c84e`, and the [passing attempt](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/3) inspected `cd2aa689`. The operator required that same head at merge. |
| What did the clients enforce? | Claude Code 2.1.328 allowed a disposable write, blocked a protected edit and blocked a missing command with `onFailure: "block"`. Codex 0.170.0 applied a disposable patch and blocked a protected lockfile patch. Protected bytes stayed intact. | Claude used the extension-bundled terminal executable. The graphical panel remains untested. Codex used its native app-server, explicitly trusted hooks in a disposable runtime and synthetic model transport. A hook file placed only in the linked worktree yielded zero discovered hooks on this version. |
| What was measurable? | Two real Claude API requests imported from local OpenTelemetry. Reimport counted both as repeats. The report counted at least 176 attributable model responses, 15 CI job attempts and 3 review attempts before acceptance. | Shared chats with ambiguous attribution were excluded. Two review findings had no recorded individual occurrence times. The delivery-window report leaves their count unknown. Complete compaction, permission and dispute counts remain unavailable. |
| What did review change? | A valid Codex patch caused a false denial. The packed Claude instructions omitted the hook-failure setting. Both findings were corrected and independently rechecked. | The final package passed 81 tests, including 27 frozen cases also run through the installed binary. A documentation-only dispute was a controlled exercise. [Baseline evidence](baseline-test-evidence.md). |

The task-local report gives these bounds for wall-clock activity. The
known column is the union of measured intervals. A missing activity record
does not establish that its duration was zero.

| Interval | Calendar | Operator activity and blocking | Agent activity | Machine occupancy | Known union | Unexplained |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Execution to first PR | 22 min 20 s | Unavailable | Unavailable duration | ≥17 s | ≥17 s (1.3%) | ≤22 min 3 s |
| Execution to acceptance | 41 min 46 s | Unavailable | ≥2.504 s | ≥202 s | ≥204.504 s (8.2%) | ≤38 min 21.496 s |

I1 reported first-commit-to-PR time and missing attribution during shared
conversations. It did not give a comparable execution-start window and
known-interval denominator. This pilot establishes both calendar endpoints
and a lower bound on the explained share. An improvement in that share or
in time spent waiting for the operator remains unmeasured. The orchestrator
accepted the [event schema](../../defaults/process-metrics.md) for the
scoped pilot under the owner's delegated implementation authority.

The tested and installed archive for `@kostysh/development-methodology-tools@0.3.0`
had integrity
`sha512-WMzM/ZcYy2Srt6G22zD7FAinhht39FVO6JgjmNc0hpKBki88zYcPH4KhCBjpSLLz+g6ALVvqmDJrzJ5Hp80c1Q==`.
[Final package checks](https://github.com/kostysh/development-methodology/actions/runs/44596795932).

The seven-day observation closes **November 26, 2026 at 19:22:27 UTC**.
The [first retrospective](pilot-retrospective.md) records the causes and
the controls to exercise on a comparable change.
At the end of the window classify subsequent changes by their verified purpose,
reconcile them with the manual chronology and ask the owner whether to
retain collection. The current sample cannot establish a delivery-time
or quality improvement.
