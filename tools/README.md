# Methodology tools

This private npm package contains executable checks for use with the
[methodology](../README.md). It builds TypeScript directly to JavaScript and
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
[process metrics contract](../defaults/process-metrics.md).

Keep the private JSON profile and journal in an existing local directory
outside Git worktrees. Set the profile's file mode to `0600`. Generate a random
32-byte identity key locally and retain its 64 lowercase hex characters in
`identity_key`. Keep that key and the issued alias list stable for the journal.
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
