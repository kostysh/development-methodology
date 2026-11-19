# Recovery pilot on v5

The owner authorized observations for three real jobs on November 19, 2026.
Use only newly designated sessions for each named job. Do not read other
chats. Keep task-bound identifiers, times and numeric counts in private
storage. Publish aggregate results and locators to public work products.

| Job | Work product the project will use |
| --- | --- |
| `V5-RECOVERY` | Verify a public behavior of the built recovery tool against its approved contract. |
| `V5-STATE-GUIDE` | Identify the existing guide and template consumers that must change for the two handoff artifacts. Use the verified inventory when making the documentation change. |
| `V5-RULES` | Check a selected mechanical rule against the actual inputs and determine what review work can safely be retired. |

For each job, have one session do the actual preparation through an idle
checkpoint. Save its short task state, source revision and next permitted
action. Give both continuations the same worktree contents, state, fresh
facts, instruction, model settings and authority. Preserve separate writable
copies. Compact the continuing session. Start the other session fresh. Record
dispatch or the explicit recovery fallback used in each. Verify the actual
work product independently before using it.

Measure elapsed time from the available continuation to the first verified
task change. Count repeated reads of identifiable sources, resumption errors,
and observed tokens through that change and through acceptance. Report
cached input separately. Record initialization and compaction time separately
so the full cost can also be compared. Mark a missing action, a counter that
straddles a boundary, an unreadable source or an unobserved interval. The
two continuations share one preparation cost. Their outputs represent one
accepted job. Retain order, model changes, differences in the starting
state and interruptions that affect comparability.

After the three jobs, compare within each pair and report sample sizes
and coverage. Keep the choice of routine fresh sessions open when the
observations cannot support it. Synthetic skill trials and native
dispatch drills answer separate verification questions.

## Observations

All three jobs used Codex App Server 0.170.0 with GPT-6.2 Sol at medium
reasoning. Each used a real native compaction and real model responses.
The guide and recovery jobs ran the compacted arm first. The controls job
ran the fresh arm first. Both arms received the same explicit recovery instruction and task
inputs. The verified action on the guide was writing the link inventory.
On the control check it was changing the selected link in the disposable
copy. On the recovery job it was recording the verified result of the
original test run. Setup measures native compaction or fresh-session setup.

| Job | Continuation | Setup | Ready to first change | Reopened sources observed | Arm input / cached subset / output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| Guide | Compacted | 24.153 s | 36.897 s | 46 | 291,123 / 249,216 / 2,297 |
| Guide | Fresh | 0.602 s | 36.113 s | 46 | 279,807 / 231,296 / 2,115 |
| Controls | Compacted | 11.718 s | 9.539 s | 50 | 310,099 / 276,864 / 1,278 |
| Controls | Fresh | 0.079 s | 13.971 s | 50 | 333,069 / 268,160 / 1,281 |
| Recovery | Compacted | 17.882 s | 22.476 s | Partial | 223,712 / 189,952 / 960 |
| Recovery | Fresh | 0.473 s | 22.746 s | Partial | 203,700 / 171,648 / 950 |

The guide inventory found five Markdown links and one literal path in the
planning entry template. Both inventories matched the source tree.
The compacted arm described the snapshot as granting authority. The operator
had authorized the job. The orchestrator corrected that sentence. Each arm
stayed within the assigned write scope. The guide change used the verified
inventory. [Guide revision](https://github.com/kostysh/development-methodology/commit/a8332460c858b2bee0b1cac20f8a05097dfbdd76).

The control job checked that guide revision in two isolated copies. Each
observed the link checker exit 0 on clean inputs, exit 1 on the stale
Handoff link in the glossary, and exit 0 after byte-for-byte restoration.
The collector recorded six distinct observed activations and two blocks.
Reimport reported six repeats and left six events. The task start time and
the total number of guardian permission checks were unavailable. The
collector correctly reports lower bounds.

The recovery job ran the eight frozen tests against the installed package
at `28fc8deb`. Both sessions reconciled first with the explicit recovery
command, matched the original launch and revision, and read a passing
eight-case result. Each arm launched the suite once. The compacted arm
recorded one additional failed command with unknown cause. The running
suite finished before that arm resumed. In the fresh arm the original
session was interrupted, and the suite finished after the new session
became ready and before it read the result. File-access observations
cover only the named launch evidence. A stale process identity returned
exit 1 with the live revision and an explicit gap.

The shared preparation used 315,094 input tokens (268,672 cached) and
1,292 output tokens for the guide. For controls it used 120,232 input
tokens (89,216 cached) and 538 output tokens. Recovery used 137,044 input
tokens (96,640 cached) and 893 output tokens. Add the shared preparation
once to a chosen arm for the observed cost through its work product.
Source counts include reads by tools operating on the documents. The
host reported usage at intervals, so tokens through the exact first
change are partial. It supplied no separate provider token count for the
compaction itself. Independent acceptance effort also falls outside these
arm totals.

## Native hook and interruption checks

- **Codex 0.170.0.** In a disposable home with trust recorded for the
  exact hook definition, one native compaction delivered the installed
  recovery packet to the first continuation request. The startup request
  did not contain the packet. This host-dispatch check used a synthetic
  model endpoint. The three paired jobs above used live models and the
  explicit recovery route. Scope-local hook trust was unavailable there.
- **Claude Code 2.1.328.** Native `/compact` dispatched
  `SessionStart` with source `compact`. The first tool read a fresh
  snapshot. After an intervening tracked edit, the model reported the
  change and held the dependent action. A separate operation survived
  termination of the terminal client. The resumed and fresh conversations
  read its original stdout, stderr and exit status 17 and identified its
  launch revision. The operation ran once. These drills used a real
  model and the terminal executable bundled with the VS Code extension.
  Graphical-panel behavior and efficiency on Claude tasks remain unmeasured.
  [Official VS Code guide](https://code.claude.com/docs/en/vs-code#switch-between-extension-and-cli)
  · [SessionStart](https://code.claude.com/docs/en/hooks#sessionstart).

## Decision

Keep fresh sessions optional at a checkpoint. Both approaches completed all
three jobs. Fresh setup was shorter in each pair. From a ready session,
the fresh arm reached the first verified action earlier on the guide and
later on the controls and recovery jobs. Reread counts matched on the two
jobs with comparable coverage. With three tasks, missing compaction costs
and incomplete first-action token counts, a mandatory restart or an overall
delivery-time saving has insufficient evidence.
