# Methodology tools

This private npm package contains executable checks for use with the
[methodology](https://github.com/kostysh/development-methodology/blob/7bbb60d714651e4549bcd264f608448dae4632b8/README.md). It builds TypeScript directly to JavaScript and
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

From the chosen repository revision, run `npm ci --ignore-scripts` and
`npm pack --json` inside `tools/`. Keep the tarball with its reported
integrity value. In the adopting project's tools package, install that saved
tarball using `npm install --save-dev /path/to/package.tgz` and retain the
lockfile. Run `npm exec --offline -- methodology-check-links --version` there
and verify a clean input and a known broken link with the installed command.
Record the version, integrity value and actual CI check in the project profile.
For an update, keep the previous verified archive until the new checks pass.
To recover, restore that archive and its lockfile, run `npm ci`, and repeat
the installed-command checks before relying on enforcement.

## Collect local process metrics

On Linux, install the package with Node.js 24 and make `flock` from util-linux
available on `PATH`. Use a local filesystem for the journal. The event format
and interpretation are in the
[process metrics contract](https://github.com/kostysh/development-methodology/blob/7bbb60d714651e4549bcd264f608448dae4632b8/defaults/process-metrics.md).

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

Resolve paths relative to the profile. Configure just the sources available to
the project. The `task`, `audit`, `development`, and `normalized` kinds read
schema v1 event records. Raw adapter kinds accept the corresponding source
records. Where every record in a raw source belongs to one task, an operator
may configure that source's `task_id` with an issued task alias. Without
verified attribution, adapters leave the task unassigned. For an immutable
JSONL input, `content_sha256` pins the bytes and enables stable line identities.
A changed snapshot produces a coverage gap and requires a new source decision.

| Raw source kind | Local input accepted by the package |
| --- | --- |
| `codex_rollout` | The selected session's JSON Lines. Per-response usage is counted once. Its exact turn can supply the configured model. |
| `codex_app_server` | One notification per line. A completed `contextCompaction` item provides the compaction identity. Guardian start and completion notifications provide the review identity. |
| `claude_monitoring` | One local OpenTelemetry LogRecord per line, with scalar `attributes` or OTLP JSON key/value attributes. The `api_request` and successful `compaction` records supply usage, measured request time and compaction identity. Use the same adapter for supported terminal and editor sources. |
| `claude_hook`, `codex_hook` | One native hook object. A bare `PostCompact` lacks a replayable occurrence ID. Use the monitoring or App Server source above for counts, or import a pinned hook capture. `SessionStart` also serves recovery. |
| `github_jobs` | One object per line containing `repository.id`, `jobs` and `total_count` from the selected run attempt. Retain the provider's job IDs, attempt, head, step numbers and times. Supply all pages or report partial coverage. |
| `github_webhook` | A local pull request, workflow run, workflow job or forced-push payload with its repository ID. For a forced push, supply the verified delivery UUID alongside the payload as `{"delivery_id":"…","payload":{…}}`, or use a pinned capture. A job start does not supply an assignment timestamp. |

For example, configure an approved task-only Claude export as
`"session": {"kind":"claude_monitoring","path":"session.jsonl","task_id":"task_17"}`
and import it with `methodology-metrics collect /path/to/profile.json session`.
Use a local source selected by the data owner. Raw telemetry can contain
personal information. The adapter allowlists fields before journal storage.

Run the installed commands below. From the source checkout, the corresponding
built entry is `node tools/dist/metrics.js`.

```sh
methodology-metrics record /path/to/profile.json < normalized-events.jsonl
methodology-metrics collect /path/to/profile.json tasks
methodology-metrics hook /path/to/profile.json source-name < hook-payload.json
methodology-metrics summary /path/to/profile.json task_17 --as-of 2026-11-19T12:00:00Z
```

`record` reads normalized JSON Lines from standard input. `collect` reads a
profile-selected local JSON Lines file. `hook` reads one payload and returns
control on failure with a sanitized standard-error diagnostic. It leaves
standard output empty. `summary` is an explicit read for the operator.
No hook installation or remote transfer is part of these commands.

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
[contract](https://github.com/kostysh/development-methodology/blob/537d54bfa1c1581ec27cc626b72a6f56514dfca5/planning/v5/baseline-manifest.md) describes path selection,
modes, host input and recovery. Restore the last verified archive and trusted
settings after a bad update.

## Recover a task after interruption

On Linux with Git, install the accepted package and verify
`methodology-recovery --version`. Set up the
[task-local state and ignore rule](https://github.com/kostysh/development-methodology/blob/a8332460c858b2bee0b1cac20f8a05097dfbdd76/defaults/task-recovery.md).
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
  `issue`, `pr` and `run` numbers. Configure read-only `gh` access. Only
  selected objects are queried. A PR identifies its recorded head, and a
  CI result applies to the reported revision and attempt.
- Each `resources` entry has a `type`, an `id` and an absolute `record`
  path. The resource owner writes JSON with the same `task_id`, `type`,
  `id`, its `state` (`active` or `released`) and optional UTC `expires_at`.
  Active Linux processes also need `pid`, `boot_id` and `start_ticks`.

Use the absolute installed executable and profile paths in a synchronous
`SessionStart` command hook with matcher `compact`. The command is
`methodology-recovery hook /private/task-17.json`. The host sends native
JSON on stdin and receives the task packet as additional context. Test the
actual client, worktree and hook configuration. If context is unavailable or
truncated, run explicit recovery from the bound worktree before acting.

Explicit commands exit 0 on success, 1 on rejected state or partial facts
and 2 on invalid invocation or binding. A partial snapshot contains the
known fields and names each gap. The hook exits 0 and supplies the manual
recovery instruction when it cannot safely deliver the packet. The
[public contract](https://github.com/kostysh/development-methodology/blob/7bbb60d714651e4549bcd264f608448dae4632b8/planning/v5/recovery-contract.md)
defines the supported operations.
