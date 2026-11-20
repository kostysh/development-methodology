# Methodology tools

This private npm package contains executable checks for use with the
[methodology](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/README.md). It builds TypeScript directly to JavaScript and
uses the lockfile for dependency resolution. The supported runtime is Node.js
24.12 or later in the 24.x series. The automated package and installed-command
checks run on Linux.

## Check Markdown links and anchors

From the repository root:

```sh
npm --prefix tools ci --ignore-scripts
npm --prefix tools run build
npm --prefix tools run check:links -- ..
```

The npm script runs inside `tools/`, so `..` selects the repository. The
installed `methodology-check-links [project-root]` command defaults to the
current directory when run directly. Pass the entire project root, including
unchanged Markdown sources, so a removed target or heading is detected
wherever it is referenced.

The guard checks local links and images in `.md` and `.markdown` files,
including reference links, repository-root links, encoded URLs, and directory
links. Markdown fragments target headings, HTML `id` attributes, or
`<a name="…">` anchors. Directory fragments use the Markdown README in the
target directory. GitHub-style heading numbering and percent-decoded
fragments are supported. Explicit anchors must be unique in their document and
distinct from generated heading anchors.

The guard skips external destinations, paths outside the selected root,
symbolic-link sources, and Git, worktree, dependency, and build directories.
It checks the existence of a non-Markdown target and leaves its fragment
semantics to the target format. The command reads files locally and writes
only to the terminal.

| Exit code | Result |
| --- | --- |
| `0` | Check passed. Standard output reports the number of Markdown files checked. |
| `1` | The project contains invalid links or anchors. Standard error gives the source path, line, and diagnostic. |
| `2` | Invalid arguments or an incomplete scan, including a root with no Markdown files. Standard error gives the reason. |

## Build and verify the package

Run from the repository root:

```sh
npm --prefix tools ci --ignore-scripts
npm --prefix tools run build
npm --prefix tools test
npm --prefix tools run test:packed
npm --prefix tools run check:links -- ..
```

`npm pack` runs the clean build and stages the current version. The packed
test inspects its contents, installs it in a temporary project with runtime
dependencies only, and tests the installed command from outside the source
checkout. Temporary files are removed after the test. The package manifest
owns the version, public command path, and distribution files.

## Install an accepted build

Download the named release, verify its SHA-256, and install the tested tarball
offline using the [adoption guide](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/ADOPTION.md#2-place-and-configure).
CI can set `METHODOLOGY_RELEASE_DIR` during `npm run test:packed` to retain
the exact archive installed by the tests. The release includes the runtime
dependencies and the train dispatcher. Preserve the previous installation
until its replacement passes the project's selected acceptance checks.

## Collect local process metrics

For normal adoption use the installed `methodology-task setup`,
`methodology-task begin` and `methodology-task finish`. They manage the
selected hooks, session bindings, task journal and import of workspace
observations. The [operator procedure](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/process-metrics.md#begin-and-finish-a-task)
includes the required live callback check. The lower-level commands below
also support existing project integrations.

On Linux, install the package with Node.js 24 and make `flock` from util-linux
available on `PATH`. Use a local filesystem for the journal. The event format
and interpretation are in the
[process metrics contract](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/process-metrics.md).

Keep the private JSON profile and journal in an existing local directory
outside Git worktrees. Set the profile's file mode to `0600`. Generate a random
32-byte identity key locally and retain its 64 lowercase hex characters in
`identity_key`. Keep that key and the issued alias list stable for the journal.
For follow-up after deleting a task worktree, select a surviving local
repository as `project_root` and keep the sources bound to their task IDs.
Store approved aliases and categorical vocabularies in the following shape.

```json
{
  "project_id": "example",
  "project_root": "/path/to/project",
  "journal": "events.jsonl",
  "identity_key": "<local 64-character hex key>",
  "issued_ids": ["task_17", "issue_17", "task_start_17"],
  "sources": {
    "manual": { "kind": "normalized" },
    "tasks": { "kind": "task", "path": "task-events.jsonl" },
    "audits": { "kind": "audit", "path": "audit-events.jsonl" },
    "dev": { "kind": "development", "path": "dev-events.jsonl" }
  },
  "categories": {
    "outcome": ["passed", "failed", "success", "failure", "skipped", "cancelled"],
    "action_type": ["verification"]
  }
}
```

The [native setup](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/process-metrics.md#connect-a-native-client)
owns the project-local installation, session binding, positive test, replay,
foreign-session check and rollback for Codex and Claude Code. A scoped file
import supplies the approved session identity as required by its adapter.
The [operation commands](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/process-metrics.md#record-at-the-operation)
capture task and audit transitions, run a test with its real exit status,
record Git rewrites and synchronize the selected GitHub PR and CI history.
Under a workspace sandbox, the task writes operation observations to its
ignored spool. The coordinator imports them into the private journal.

The collector stores schema v1 events and a separate `.coverage.jsonl`
sidecar. Both are private and append-only. File locks serialize participating
writers and bound the wait for a busy journal. Valid events survive failed
rows. Replays reuse the first observed event and conflicts leave a coverage gap
and exclude the disputed event from the summary. A rejected raw value, source
file path, and input body stay out of diagnostics and both files.
Input batches are limited to 16 MiB, rows and hooks to 256 KiB, and each
journal file to 32 MiB. If the journal cannot be opened or locked, the
diagnostic carries the failure and the previous records remain available.

An optional profile `coverage` array declares verified source windows with
`source_id`, `event_types`, `from`, `through`, and `status` (`complete` or
`not_applicable`). Leave this unset until the source's window and scope have
been established. A successful import alone does not establish complete
coverage.

| Exit code | Explicit command result |
| --- | --- |
| `0` | The operation completed. |
| `1` | Collection found invalid or missing source data, or conflicting records. |
| `2` | Invalid arguments or profile, or journal access or processing failed. |

The passive `hook` command returns `0` for each outcome.

### Record train observations

Install the accepted archive using the [installation steps](#install-an-accepted-build).
Confirm the version with `npm exec --offline -- methodology-metrics --version`.
Use the same private profile, local journal and permissions as for task metrics.
Add the pilot alias and each stable occurrence ID to `issued_ids`. Bind a
normalized source to the pilot, for example
`"train": {"kind":"normalized","task_id":"pilot_1"}` in `sources`.
Record the pilot's `task.started` to establish the beginning of the window.

Store one observation per line in a private input file. For example, a dry attempt
that ran two full suites can supply the following single line.

```json
{"schema_version":1,"project_id":"example","event_id":"train_1","source_id":"train","event_type":"train.observed","occurred_at":"2026-11-19T10:00:00Z","observed_at":"2026-11-19T10:01:00Z","actor_role":"operator","task_id":"pilot_1","data":{"train_mode":"dry","train_result":"completed","full_suite_runs":2}}
```

```sh
methodology-metrics record /path/to/profile.json < /path/to/train-observations.jsonl
methodology-metrics summary /path/to/profile.json pilot_1 --as-of 2026-11-19T12:00:00Z
```

Verify the attempt in `train.attempts`, then replay the line and check that
the attempt still appears once. Check rejection of an unapproved field with a
synthetic input. The [train observations contract](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/planning/v5/train-metrics.md)
defines the measurements, missing values and `train.skipped_starts` bounds.
To verify a zero, use `coverage` on the pilot-bound source with
`event_types: ["train.observed"]` across the confirmed interval. For a rollback,
restore the previous archive and lockfile and use the saved prior profile and
journal. Keep the profile and journal with the version that produced them.

## Protect a test baseline

Install the verified package on case-sensitive Linux with Git and the
supported Node.js version. Start from the repository that owns the tests.
Use full commit object IDs. The test owner selects the test and the files
that control how it runs, then records a reviewed manifest in a separate
commit. For example, given an accepted test and runner configuration:

```sh
methodology-baseline freeze --source "$test_commit" --protect tests/contract/ --protect package.json > baseline.json.tmp &&
  mv baseline.json.tmp baseline.json
```

Commit the completed manifest and unchanged selected files. Give its commit
ID and path to the integration owner. From the installed companion, run:

```sh
methodology-baseline verify --baseline "$baseline_commit" --manifest baseline.json --candidate "$candidate_commit"
```

A matching commit exits 0. A protected difference exits 1 with the affected
paths. An unavailable object, invalid manifest or invocation exits 2. Supply
the verifier, baseline and settings from a source outside the candidate's
control. Hold the merge on a missing or unsuccessful required verification.
The integrity check and executing the contract tests are separate results.

For a local synchronous `PreToolUse` command hook, invoke the same installed
binary with `hook --host claude` or `hook --host codex`, followed by
`--repo` with the absolute worktree root and the same `--baseline` and
`--manifest` arguments. On Claude Code match `Edit` and `Write` and set
`onFailure` to `"block"` on the command handler. Use a version with blocking
hook-failure support. Test an unavailable command as well as an ordinary
exit-2 denial. [Claude Code hook failure policy](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails).
On Codex match `apply_patch` in the local single-environment tool surface.
The host passes a JSON event on stdin. An allowed edit exits 0. A denied or
uninspectable request exits 2 with the reason on stderr. Check both outcomes
through the actual host. Record that host, its version and which actions
the hook sees. Required CI covers committed shell edits. The
[contract](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/planning/v5/baseline-manifest.md) describes path selection,
modes, host input and recovery. Restore the last verified archive and trusted
settings after a bad update.

## Recover a task after interruption

On Linux with Git, install the accepted package and verify
`methodology-recovery --version`. Set up the
[task-local state and ignore rule](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/task-recovery.md).
Keep this example profile outside the worktree, substitute the actual
values and restrict its permissions to its owner.

```json
{
  "task_id": "task_17",
  "worktree": "/work/task-17",
  "line_limit": 100,
  "base_ref": "refs/heads/main"
}
```

The example line limit is a project choice. To write, inspect and resume:

```sh
methodology-recovery write /private/task-17.json < updated-state.md
methodology-recovery snapshot /private/task-17.json
methodology-recovery recover /private/task-17.json
```

Keep `updated-state.md` private if you use an input file. A task state can
also be sent directly on stdin. Git counts use the local index and worktree.
Ahead and behind use the local upstream ref. If remote or resource facts
are applicable, the profile accepts the following additional fields.

- `github` takes a GitHub.com `repository` and the applicable positive
  `issue`, `pr` and `run` numbers. Configure read-only `gh` access. For a
  local branch, the snapshot compares its HEAD with the same named branch
  in that repository, including before a PR exists. An unavailable ref is
  a gap. A PR identifies its own recorded head, and a CI result applies to
  the reported revision and attempt.
- Each `resources` entry has a `type`, an `id` and an absolute `record`
  path. The resource owner writes JSON with the same `task_id`, `type`,
  `id`, its `state` (`active` or `released`) and optional UTC `expires_at`.
  Active Linux processes also need `pid`, `boot_id` and `start_ticks`.

Use `methodology-recovery install-hook PROFILE --client CLIENT --session-id ID`
from the selected worktree. The synchronous `SessionStart` hook sends the
recovery packet after compaction. Test it in the chosen client. If the
packet is unavailable or truncated, recover explicitly from that worktree.

Explicit commands exit 0 on success, 1 on rejected state or partial facts
and 2 on invalid invocation or binding. A partial snapshot contains the
known fields and names each gap. The hook exits 0 and supplies the manual
recovery instruction when it cannot safely deliver the packet. The
[public contract](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/planning/v5/recovery-contract.md)
defines the supported operations.


## Coordinate solo decisions and integration

Use [solo decisions](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/solo-decisions.md) for delegated choices,
recording an owner's chat reply and the project's publication check. Use the
[executable train](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/merge-train.md) for the restricted writer,
isolated suite, deployment readback and repeatable recovery. The
[control register](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/controls.md) specifies how to exercise
the installed controls at each selected boundary.

Use a Codex scheduled project task for the nightly clock. The package
provides a GitHub Actions dispatch receiver for remote execution and an
opt-in Linux cron entry for projects without the built-in scheduler.
The trusted runner holds the writer credential and enforces the UTC slot.
The installed `methodology-train publish-review` posts a separate reviewer's
verdict using the trusted App. For coordinator-managed PRs,
`methodology-controls review-policy` also verifies the protected changes
locally. [Review policy](https://github.com/kostysh/development-methodology/blob/methodology-v5.0.3/defaults/controls.md#protect-the-review-policy)
