# V5-BASELINE pilot retrospective

Ordinary package CI passed after a version test stopped checking the version
and output. The verifier built from pinned revision `eb975b3` rejected that
controlled candidate (`3178c84e`, exit 1) and accepted the restored candidate
(`cd2aa689`, exit 0). The operator used that same accepted head as the merge
precondition. The merged tree `4437f9c` matches it and passed package CI.
[Weakened assertion](https://github.com/kostysh/development-methodology/commit/3178c84e97462ef5954976e142456ed716d0c61b) · [Green package CI on weakened candidate](https://github.com/kostysh/development-methodology/actions/runs/44596637507) · [Rejected candidate](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/2) · [Accepted candidate](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/3) · [PR 2](https://github.com/kostysh/development-methodology/pull/2) · [Merge build](https://github.com/kostysh/development-methodology/actions/runs/44597637068)

## What triggered rework

The supplied manual chronology records one independent changes-requested
verdict, followed by technical PASS and final ACCEPT. That review reported
two actionable findings, with two distinct observations and two distinct
direct causes in the reviewed scope. The collector leaves finding counts
unavailable because the individual finding times were unrecorded. The two
early red package jobs shared the expected missing-binary cause. All 27
pre-implementation cases stopped before reaching the semantic assertions.
The later red integrity run intentionally exercised rejection. The
documentation-only dispute was also a controlled exercise.
[Pilot chronology](pilot.md#pilot-results) · [Test evidence](baseline-test-evidence.md) · [Early push](https://github.com/kostysh/development-methodology/actions/runs/44594072803) · [Early PR check](https://github.com/kostysh/development-methodology/actions/runs/44594142725)

- **Codex hook.** The parser required exact outer delimiter lines and denied
  valid patches with surrounding whitespace. The pre-fix tests exercised the
  canonical delimiters but omitted these host-valid variants. In a focused
  replay of the three new regression cases, the pre-fix build `eb975b3` falsely
  denied 3 of 3 valid independent patches. The accepted build falsely denied
  0 of 3 and still denied all three protected counterparts with a path
  diagnostic. The occurrence is fixed and regression coverage is in place.
  The replay measures fixture behavior at those revisions. Field recurrence
  remains unmeasured.
  [Correction and regression tests](https://github.com/kostysh/development-methodology/commit/a7ef5ce75fe9e0cc97f43d9f20b1083d89a95178)
- **Claude Code setup.** The packed README omitted the required
  `onFailure: "block"` setting. The installed smoke exercised commands,
  leaving that setup outside its coverage. The README now includes the
  setting and a missing-command check. With this setting, the extension-bundled
  terminal executable blocked an unavailable command.
  The graphical panel remains untested. The record does not establish why
  either omission entered the first reviewed revision or how much time it cost.
  [Hook contract](baseline-manifest.md#bm4-intercept-direct-edits-stage-56-b5) · [Correction](https://github.com/kostysh/development-methodology/commit/a7ef5ce75fe9e0cc97f43d9f20b1083d89a95178) · [Native host checks](pilot.md#pilot-results)

## What to measure next

- **Integration owner.** On the next comparable change, record the inspected
  head and gate decisions for both a known protected violation and a clean
  candidate. This pilot proved the operator-held gate. Automatic branch
  protection remains open. Before relying on it, verify that the server
  holds a merge when the current head lacks a passing integrity result.
- **Hook and package owner.** On the next comparable host-adapter change,
  exercise valid whitespace, protected edits and an unavailable hook command
  from the documented installation. Confirm hook discovery at the intended
  entry point. In this pilot, a Codex hook file present only in the linked
  worktree yielded zero discovered hooks. Record false denials and setup
  misses per exercised host. For any recurrence or integration miss, record
  the first detection point, rework from review or manual acceptance, and any
  measured delay. Use zero recurrence in exercised cases as the target.
- **Collector and project owners.** Close the seven-day observation on
  November 26, 2026 at 19:22:27 UTC. Verify the purpose of follow-up changes
  and reconcile them with the manual chronology before deciding whether to
  retain collection. For the next comparable task, capture the same calendar
  intervals and record verdict and finding times when they occur.
  [Pilot scope and follow-up](pilot.md)

From the start of execution, the task-only aggregate and manual chronology
agree on 22 min 20 s to draft PR and 41 min 46 s to independent acceptance.
The aggregate gives lower bounds of 15 CI job attempts, 2 retries, 3 review
attempts and 176 model responses. Its seven-day window remains open.
Working time, owner wait, a comparable historical denominator and a change
in delivery time or quality remain unknown.
