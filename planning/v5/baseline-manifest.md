# Protected test baseline

Public acceptance contract for [V5-BASELINE](https://github.com/kostysh/development-methodology/issues/1).
The test author uses this contract before implementation. The source decisions
are [stage 5](plan.md#stage-5-baseline-tests-after-specification) and the
[build and test contract](requirements.md#build-and-test-contract).

## BM1. Installed commands (B1–B3)

The existing `tools/` package builds the `methodology-baseline` binary with
`tsc`. Use its declared Node.js runtime and Git on a case-sensitive Linux
filesystem. Run `freeze` and `verify` from a Git worktree, including a
subdirectory. Manifest and selection paths are relative to its Git root.
`--repo` is the absolute Git worktree root supplied by the hook owner.

```text
methodology-baseline --version
methodology-baseline freeze --source <commit-oid> --protect <path> [--protect <path> ...]
methodology-baseline verify --baseline <commit-oid> --manifest <path> --candidate <commit-oid>
methodology-baseline hook --host <claude|codex> --repo <absolute-root> --baseline <commit-oid> --manifest <path>
```

Each commit argument is the full lowercase Git object ID of a commit, using
the repository's object format. Abbreviations, refs, expressions, tag
objects, and missing objects are errors. Comparisons read the named Git
objects without replacement objects and are independent of the index,
worktree contents, and current branch.

## BM2. Freeze the contract (stage 5.1–5.5)

The test owner selects the reviewed baseline tests and the files that
control how they run. Include runner configuration and exclusions, fixtures,
snapshots, coverage settings and skip controls as applicable. Each assertion
needs a source or owner decision, an acceptance criterion ID, and an
observed pre-implementation failure on the specified operation and
transport. Keep those links and results with the test evidence.

`freeze` reads the selected paths from the source commit. A selection is a
literal Git path to a tracked regular file or to a directory, with a trailing
slash for a directory. A directory includes all tracked files below it,
recursively, and must contain at least one selected file. Selectors match
whole case-sensitive path components. Use UTF-8 paths with slash separators
and no empty, `.`, `..`, or `.git` components. Spaces and Unicode characters
are literal. An absolute path, nonexistent selection, or selected symlink or
submodule is an error. Overlapping selectors yield one entry per file.

On success `freeze` writes one UTF-8 JSON object followed by a newline:

```json
{
  "version": 1,
  "source": "<full source commit oid>",
  "paths": ["tests/baseline/", "vitest.config.ts"],
  "entries": [
    {"path": "tests/baseline/contract.test.ts", "mode": "100644", "oid": "<full Git blob oid>"},
    {"path": "vitest.config.ts", "mode": "100644", "oid": "<full Git blob oid>"}
  ]
}
```

Sort unique selectors and entries by UTF-8 byte order of their paths. Use Git
file modes `100644` and `100755`. Identical inputs produce byte-identical
output regardless of selector order. The test owner saves successful output
as a regular file outside the selection, commits it with the unchanged
selected files, and gives the resulting **baseline commit** and manifest
path to the hook and CI owners. Freeze writes only to stdout so an
interrupted or competing invocation cannot replace the accepted manifest.

## BM3. Verify and enforce the candidate (stage 5.5–5.7)

Load the manifest from the exact trusted baseline commit and path. Check
its schema, source commit, and agreement with the source and baseline
trees. The baseline commit must have the same selected path inventory,
modes and blob IDs as the source. A missing or inconsistent trusted input
is an error.

`verify` compares the exact candidate commit against this inventory and
against the baseline's own manifest entry. The manifest must have the same
path, mode and blob ID in both commits. Reject protected additions,
deletions, renames, content changes and mode changes. A different file
type at a selected path, at a selected root, or at an ancestor that
displaces a protected entry is also a change. Report changed paths
relative to the Git root. Allow independent tests and implementation files
outside the protected selection.

Required CI supplies the actual revision being evaluated. It obtains the
verifier, its invocation, baseline commit and manifest path from settings
the candidate cannot replace. A missing, failed or skipped verification
holds integration. Exercise this check after a shell write to a protected
file has been committed, even when a local hook was skipped.

## BM4. Intercept direct edits (stage 5.6, B5)

`hook` reads one JSON object from stdin. It loads and validates the trusted
baseline in BM3 before allowing a call. The object must have
`hook_event_name: "PreToolUse"` and an absolute `cwd` in the configured
worktree. Extra event fields can be ignored. Use synchronous command hooks
with these matchers and payloads.

| Host | Matcher | Input |
| --- | --- | --- |
| Claude Code | `^(Edit\|Write)$` | `tool_name` is `Edit` or `Write`. `tool_input.file_path` is an absolute path. |
| Codex | `^apply_patch$` | `tool_name` is `apply_patch`. `tool_input.command` is the raw single-environment patch. Read the paths in all add, delete and update hunks, including every move destination. Resolve relative paths against `cwd`, which must match the single local tool environment. |

Check the manifest path, file selections and directory selections,
including proposed new files under a selected root. Also block proposed
targets that would replace an ancestor of a protected path. Compare
normalized paths and resolved filesystem paths so an existing symlink
alias cannot reach a protected target. A nonexisting new leaf is valid if
its location can be resolved through existing ancestors. Deny an ambiguous
or out-of-worktree target, an inspectable request with any protected target,
a malformed or unsupported payload, or failed baseline validation.
Evaluate the whole call before returning a verdict.

For Claude Code use a host with blocking `onFailure` support and set it to
`block`. Codex support requires a local single-environment session that
delivers the documented `apply_patch` event. Recovery from a skipped hook
or a host process failure depends on the host. Required CI in BM3 is the
enforcement boundary for committed shell writes, other tool paths, and
unavailable hooks. Confirm invocation and denial in the actual host and
record its version before relying on direct edit protection.
[Claude Code hook contract](https://code.claude.com/docs/en/hooks#pretooluse),
[Codex hook contract](https://learn.chatgpt.com/docs/hooks#pretooluse),
[Codex 0.170.0 payload source](https://github.com/openai/codex/blob/rust-v0.170.0/codex-rs/core/src/tools/handlers/apply_patch.rs),
[Codex patch format](https://github.com/openai/codex/blob/rust-v0.170.0/codex-rs/apply-patch/src/parser.rs).

## BM5. Results, recovery and scope (stage 5.7–5.10, B3–B8)

| Command and outcome | Exit | Stdout | Stderr |
| --- | --- | --- | --- |
| `--version` | 0 | Package version and newline | Empty |
| `freeze` succeeds | 0 | BM2 JSON | Empty |
| `verify` matches | 0 | Empty | Empty |
| `verify` finds changes | 1 | Empty | Changed paths and reason |
| CLI input, Git read, or trusted-baseline validation fails | 2 | Empty | Diagnostic |
| `hook` allows the tool's ordinary permission flow | 0 | Empty | Empty |
| `hook` denies, including input or Git errors | 2 | Empty | Blocking reason and affected path when known |

The commands do not write files, change refs, stage changes, fetch missing
objects, or run candidate code. Diagnostics identify the failed input or
path without printing hook payload contents or reading transcripts. Restore
missing inputs or the last verified installed build and settings, then
repeat the clean and denied cases before resuming the guarded action.

If a test is disputed, the implementer records the test, criterion and
conflict and continues independent work. The specification owner resolves a
contradiction in the specification. The test author corrects a mistaken test
against a clear specification. Resolve disputes at the next checkpoint.
Only the owners can accept a replacement baseline and update the trusted
inputs. Refactors use existing tests. Documentation and small corrections
are exempt from the added baseline step. Integrity checks cover only the
selected Git paths. Proving meaningful assertions, actual execution of the
tests, and applicable security, permissions, money and migration review
remain obligations of the work route.

## Acceptance evidence

- BM1–BM3 and BM5. Independently exercise the installed distribution against
  temporary Git repositories. Check reproducible freeze, a clean candidate,
  independent tests, and each protected change type. Include a replacement
  or absent manifest, incomplete Git input and invalid arguments. Record an
  intended failure before implementation and the passing result after it.
- BM3–BM4. Observe allowed and denied direct edits at each claimed host's
  actual entry point. Exercise a malformed request and an unavailable trusted
  input. Confirm a required CI failure on the committed shell change and a
  success on the clean candidate. Fixture tests of stdin and exit status
  verify the adapter contract.
- BM5 and B1–B8. Run the owning package checks, clean build, canonical tests
  and installed distribution smoke on the delivery revision. Record the
  tested package and hosts. Walk through a disputed test and show independent
  work can continue. Record pilot timing and disputes separately from these
  checks.
