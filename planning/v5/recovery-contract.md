# Task state and recovery

[Stage 8](plan.md#stage-8-task-state-and-recovery-after-compaction) owns the
workflow. This public contract defines the observable Linux/Node.js companion
for an independent test author. Use the existing package, build and CLI
distribution checks.

## R1. Public commands and task binding

```text
methodology-recovery --version
methodology-recovery write PROFILE
methodology-recovery snapshot PROFILE
methodology-recovery recover PROFILE
methodology-recovery hook PROFILE
```

`--version` prints the package version and a newline. Each operation uses a
trusted JSON profile outside the worktree, with `task_id` (one filename-safe
alias), absolute `worktree`, and positive integer `line_limit`. It may also
contain `base_ref`, `github`, and `resources` as described below. Validate the
actual Git worktree root. Commands can run from a different current directory.
A hook input can never select another profile or worktree. Omit unconfigured
optional integrations. Mark an unavailable configured integration explicitly.

## R2. One ignored state file per task

`write` accepts nonempty UTF-8 Markdown on stdin and atomically replaces
`.methodology/task-state/<task_id>.md` in the bound worktree. Reject unsafe
paths, symlinked state directories or destination, and a tracked or unignored
destination. The adopter owns the local ignore rule. Keep task files private.
Preserve the Git index and refs. Each task has one assigned writer. A failed,
interrupted or oversized write preserves the previous file. Readers must
always see a whole version when writes overlap.

Count LF and CRLF as line ends. Count a final unterminated line once.
Exactly the limit passes. Reject whitespace-only input and documents that
exceed the line limit.
Successful writes preserve the submitted text and have empty stdout. The
profile owns the limit. The plan illustrates 150 lines. Route supported
updates through this writer. A direct filesystem edit is outside the writer's
boundary, so recovery validates the file on read as well.

The state holds source and scope, a locator for the last operator instruction,
short authorized verbatim constraints, current and permitted next step,
blockers, pending decisions, running operation IDs and output/exit locators,
and counts of fix/check attempts and audit rounds. The writer need not parse
these human fields. Completed checks belong in the development log. Accepted
decisions belong in their owning document. The operator's checkpoint report
has a separate read path. On a task switch, save the old task, select the new
one and use the existing collector interface for the switch event.

## R3. Snapshot

`snapshot` prints one JSON object with `task_id`, `observed_at` (UTC), `git`,
`github`, `resources` and `gaps`. Use a `null` field and a gap identifying a
configured fact that a source could not establish. Keep independently known
facts in a partial snapshot. Re-read each configured source on every call.

| Source | Required readback |
| --- | --- |
| Git | Worktree identity, branch or detached state, full HEAD, configured base ref/OID, upstream ref/OID, ahead/behind relative to that local upstream, and counts of staged, unstaged and untracked files. A path modified in both trees counts in both. Ignore excluded files. A remote-tracking ref is a local observation. Preserve known Git facts on an unborn or detached branch. |
| GitHub | Optional `github.repository` names a repository (`owner/name`). The same object holds the applicable positive `issue`, `pr` and `run` numbers. Use bounded, read-only calls to the named repository via the installed `gh` CLI. Verify returned identities, PR head repository/branch/OID and run attempt/head/PR association when applicable. Report publication and CI status for that revision. When local head differs, expose the mismatch and withhold current-head readiness. One successful run covers its own check. |
| Owned resources | Optional `resources` lists `type`, `id` and absolute `record` paths in the trusted profile. Only a record the resource owner designates as authoritative can establish a resource state. Read its task, type, ID, state (`active` or `released`) and any UTC `expires_at`. Report remaining lease time. Expiry alone does not establish release. For a registered Linux process, match `pid`, `boot_id` and `start_ticks` against the live system before claiming it is running. Unknown or mismatched ownership stays unavailable. |

Return only IDs, Git facts, timestamps, counts, status and named gaps. Keep
filenames in changes, command arguments, environment, provider bodies,
transcripts, run output and credentials out of the snapshot and diagnostics.
The tool does not start, stop or repeat operational jobs.

## R4. Resume

`recover` returns an agent-facing packet with the validated state text, the
fresh R3 snapshot, and the instruction to reconcile both before polling or
resuming work. Report missing or oversized state. If a head moved, the old
checks still belong to that old head. Where a process finished while the
session was interrupted, reconcile its identity and checkout, then read the
saved stdout/stderr and exit record before deciding what to do. A lost PID
cannot establish a passed check. Reread only instructions received after the
saved locator, unless that locator or binding itself needs recovery.

`hook` receives one native JSON event on stdin. A valid unrelated event has
empty stdout. For `SessionStart` with `source=compact`, check that its `cwd`
is within the bound worktree. Return JSON with
`hookSpecificOutput.hookEventName="SessionStart"` and
`hookSpecificOutput.additionalContext` holding the packet. On invalid or
wrong-task input, return only the manual recovery instruction if deliverable,
with no state from another task. The passive hook returns 0. If it cannot
run or the host truncates its context, chapter 12 supplies manual recovery.
Observe dispatch and the agent's actual first action separately.
[Codex hooks](https://learn.chatgpt.com/docs/hooks#sessionstart) ·
[Claude Code hooks](https://code.claude.com/docs/en/hooks#sessionstart).

Explicit commands exit 0 on success, 1 for a rejected state or a partial
applicable recovery input and 2 for invalid invocation, binding or processing.
A partial snapshot or manual packet preserves verified facts. Fatal failures
give a concise stderr diagnostic without state contents.

## Verification

Exercise built and packed commands on disposable Git worktrees, including
wrong binding, interruption, competing writes, boundary line counts,
identity drift, stale CI and incomplete or expired resources. For the
pre-implementation observation, exercise the prior manual handoff path
as well as the named public command. Record command absence and any deeper
assertion it prevents as distinct facts. Carry out the three Stage 8 drills
on observed hosts. Compare ordinary compaction and fresh-session checkpoints
on the three owner-authorized real tasks. Record time and tokens to the first
state change, repeated source reads, resumption errors and tokens per accepted
task. Keep cached input separate. Lack of comparable data leaves the decision
about routine fresh sessions open.
