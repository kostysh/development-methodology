# Defaults for deterministic controls

Use this register to select checks for an adopting project. The project
owner records the applicable rows, owners,
inputs, supported hosts, commands, and mandatory gates in the
[project profile](../PROJECT-PROFILE.md#tools-and-checks). Each row transfers
only the stated mechanical check. Keep the existing review obligation until
the project verifies the control at the boundary it will rely on.

## Common checks

| Rule and source | Default control and project owner | Cases that establish coverage |
| --- | --- | --- |
| Local links resolve and explicit anchors are unique. [Documentation](../method/13-artifacts-and-communication.md#steps) | The documentation owner runs the [renderer-aware check](documentation.md#verify-links-and-anchors) on the whole candidate. | Verify a clean result. Remove a target or anchor referenced by an unchanged page, and try a duplicate explicit ID. Each violation must exit nonzero and identify the affected location. |
| Persistent artifact IDs are unique within the defined namespace. The current integration base can introduce a collision after drafting. Preserve applicable archive and supersession history. [Identifiers](../method/13-artifacts-and-communication.md#identifiers), [statuses](../method/13-artifacts-and-communication.md#statuses-and-acceptance), [candidate freshness](../method/07-integration.md#candidate-freshness) | The documentation and integration owners run the [artifact check](#check-artifacts) or an existing equivalent against the current base. Supply the document roots, namespace and identity field from the profile. Where IDs may never be reused, check the owner's retained allocation history as well. | A candidate with unique IDs, preserved archive history and valid successors passes. A collision with an unchanged document, reuse of a retired ID, a changed archive or a missing successor fails. |
| Git writes use the expected repository, worktree, destination and candidate. Staging preserves paths outside the declared write set. This covers Git operations and review handoff. [Isolation](../method/07-integration.md#isolation-and-preparation), [publication](../method/07-integration.md#commit-and-publication) | The integration owner uses the [Git preflight](#verify-git-targets-and-staging) or an equivalent and stages explicit paths. Apply server-side restrictions on protected refs and use an exact expected remote OID for an authorized rewrite. | The intended checkout and staged paths pass. A wrong remote or checkout, symlink outside the approved root, unrelated staged file, or stale rewrite lease stops the corresponding operation. |
| Mandatory checks belong to the candidate and finish successfully through the declared entry points. This covers implementation, test runners, packaging and integration. [Run composition](../method/06-verification.md#run-composition), [CI and release](../method/07-integration.md#pipeline-and-release) | The CI owner uses the repository's required checks and [trusted result readback](#verify-required-results). Use the declared build, lint, type or test command as applicable. Record explicit policy skips and propagate configured diagnostic failures to the exit status. | The candidate with all required results passes. A stale result, missing or cancelled required job, unpermitted skip, weakened threshold, or failing assertion followed by a success message holds integration. |
| The accepted test baseline is preserved during implementation. [Verification](../method/06-verification.md#protected-test-baseline) | Use the [test baseline procedure](#protect-a-test-baseline). | Independent changes pass. The local hook rejects a protected edit. Required CI rejects a committed protected change even when the hook is bypassed. |
| A mutable resource has at most one conflicting user. This covers database-backed tests, environment operations, and other checks that reset or mutate shared state. [Runtime isolation](../method/08-environments-and-operations.md#runtime-isolation), [run lifecycle](../method/08-environments-and-operations.md#run-lifecycle) | Give checks isolated resources where available. For shared resources, the environment owner uses the [resource runner](#run-with-a-shared-resource) or an equivalent lock shared by every contender. Keep the intended participants of a race test concurrent within one run. | Checks for separate disposable databases proceed in parallel. A second reset of the same database waits or exits before mutation. A killed owner with uncertain cleanup cannot admit another run until reconciliation. |
| Runners preserve real exit status and release their own resources. This covers integration, browser smoke, and runtime checks. [Run lifecycle](../method/08-environments-and-operations.md#run-lifecycle), [resource failures](../method/14-learning-and-recovery.md#ci-and-resource-failures) | The runner owner uses the [resource runner](#run-with-a-shared-resource) or an equivalent. Configure task-scoped limits and verify cleanup by the same owned identities. Store the primary and cleanup results independently of the interactive session. | A completed run retains the correct status and leaves no task-owned listener. A probe that exits non-zero stays failed after cleanup. An independently surviving child still appears as unresolved. |
| Read-only or untrusted verification has no access to mutation credentials. Evidence contains only approved fields. This covers review, browser work, provider checks and release pipelines. [Configuration and secrets](../method/08-environments-and-operations.md#configuration-and-secrets), [data control](../method/10-security-and-privacy.md#data-control), [release isolation](../method/07-integration.md#pipeline-and-release) | The security and operations owners omit write credentials, use scoped identity and isolate filesystem and egress where required. Keep release authority out of candidate execution. The evidence owner allowlists fields at the actual export boundary and checks sensitive outputs with synthetic values. Use the repository's own secret detection where applicable. | An authorized synthetic check emits the permitted status and identifiers. A candidate job cannot use release credentials. An injected token, email, full command, or payload is absent from the persisted output. |
| The package builds and runs from the declared distribution and dependency set. This covers code-backed skills, tool packaging, and generated outputs where the repository has a declared source. [Dependency verification](../method/05-implementation.md#dependencies-and-tools), [skill ownership](../method/15-skills.md#ownership-split) | The package owner uses the [locked install and distribution checks](#verify-the-distribution). For generated packages, use the established source/output drift check and validate declared active references and assets. | A clean locked build invokes the documented entry point. An out-of-date lockfile, a missing runtime asset, or a generated file that diverges from its source fails the applicable check. |

## Check artifacts

Run `methodology-controls artifacts <policy.json>` in the adopting Git
worktree. Have trusted CI supply full `base` and `candidate` commit IDs and
the profile's `paths` for a single namespace. A trailing `/` selects a
directory. The command reads exact Git objects and requires the candidate
to contain the supplied base. The integration owner supplies the current
base and repeats the check when it moves.

Set `retiredIds` from the owner's retained allocation history. Use an empty
list for a namespace with no retired IDs. The default `idField` is `id`.
The check reads Markdown front matter and the top-level fields in YAML
artifacts. Use plain top-level keys, simple scalar values, and inline or
indented block ID lists for the fields it reads. It rejects quoted keys,
merged mappings and ambiguous syntax. Select legacy names explicitly and
supply the ID field and `status` in the configured metadata. For new archives
whose plans use a metadata note,
set `archiveIdPrefixes` to their ID prefixes and `archiveNoteField` to the
profile's field name if it differs from `archive_note`. The note's meaning
and completeness stay with the plan owner.

## Verify Git targets and staging

Run `methodology-controls git <policy.json>` with the expected canonical
`worktree` and `commonDir`, local `branch` and integration `destination`
as full `refs/heads/…` names, `head` as a full commit ID, and the `remote`
name and exact `pushUrl`. Set `paths` to literal allowed paths and use a
trailing `/` for a directory. Require exit 0 before the dependent write.
Run staging and publication in that checkout with the same Git configuration.
Use explicit paths for staging and the verified destination ref for
publication. Recheck the staged set immediately before a commit. A rewrite
also requires Git's `--force-with-lease=<destination>:<expected-remote-oid>`
so the remote ref update compares the exact expected value.

## Verify required results

Run `methodology-controls checks <policy.json> <trusted-results.json>`
at the integration gate. Set `candidate` to the full exact commit ID
and supply `required` policies with a stable `id`, an optional numeric
`minimum`, and `allowSkip` when the owner explicitly permits a skip.
Have the CI owner export a `results` list using its actual job or runner
readback. Each result has `id`, `candidate`, `status` and `exitCode`.
Success requires status `completed` and exit 0. For a checked threshold,
include its effective `threshold` and the measured result as `measured`.
Bind the producer and the policy to a trusted boundary. The candidate
must not supply its own mandatory results because it could claim a pass
without executing the required checks.

For GitHub Check Runs the installed producer is:

```bash
methodology-train export-checks /trusted/provider-policy.json "$pr" "$head" "$ref" > results.json
methodology-controls checks /trusted/required-policy.json results.json
```

Set `repository`, target `branch` and the `required` rows (`id`, check
`name`, publisher `appId` and pinned `workflow` for GitHub Actions) as in
the [admission policy](merge-train.md#publish-a-head-bound-audit-and-required-results).
Supply a scoped read token in `GH_TOKEN` and run the exporter in the trusted
integration job. It checks the current same-repository PR and produces one
row per required ID from the latest Check Run on the expected head. A
missing run, wrong authority, failed check or skip produces an unverified
row that holds the gate. If the policy sets a numeric `minimum`, the trusted
publisher must expose `{"threshold":85,"measured":90}` in its Check Run
output summary, with the actual values. The exporter checks both before
emitting them. An installation that permits particular skips needs its own
trusted skip evidence. Preserve the export command exit status before using
its file. The packaged admission workflow runs the same exporter logic.

## Run with a shared resource

Provision one protected lock directory on a filesystem that provides
coherent `flock` locking to every configured runner. Use the same directory
and canonical resource identity across worktrees. Verify cross-host
exclusion on the selected shared mount before using it across hosts. For
runners without a common locking filesystem, use a service lock shared by
every contender or give each its own resource. Keep the lock file in place
so all contenders continue to lock the same inode.

Run `methodology-controls run <policy.json>` on Linux with util-linux
`flock` and accessible `/proc`. Supply absolute canonical `cwd` and
`lockDir`, a stable non-secret `resource` identity, a fresh absolute
`result` path outside the lock directory, and the `timeoutMs` and
`cleanupTimeoutMs` limits. Use argument arrays with absolute executable
paths for `command` and `cleanup`. Put setup and exercise in `command`.
Keep owned processes in the supervised group. Use the independently run
`cleanup` to stop and read back owned external resources before it exits 0.
Apply memory limits, filesystem, network and credential isolation at the
runner boundary selected in the profile.

The runner holds the lock through cleanup and result recording. A busy
contender exits 75 before it runs a command. If the invoking process dies,
the supervisor terminates the foreground group and runs cleanup. If the
supervisor also dies, the kernel releases the file lock and the persistent
reconciliation marker holds the next run. Set an absolute `reconcile`
command only under the resource owner's authority. Run `methodology-controls
reconcile <policy.json>` with a fresh result path and require a successful
readback before continuing. Reconciliation acquires the same lock.

Read the JSON result for the primary exit and the separate cleanup result.
The shell exit preserves a nonzero primary exit. Interruption returns 130,
timeout returns 124, and a cleanup failure or unexpected surviving process
returns 125 when the primary exit was 0. The runner starts commands with a
minimal environment and exports fixed status fields. It discards child
output. Run untrusted or read-only checks under an identity that cannot
read writer credentials from the host, filesystem or service.

## Verify the distribution

Run the owning package's locked install and install its packed distribution
in a clean location. Exercise the configured entry points there, including
their active references and runtime assets. Fail the release gate on a
missing command, a skipped mandatory case or a failed assertion. Compare
the digest of the asset being adopted to the trusted release checksum and
verify the same archive was the input to the installed checks.

## Protect a test baseline

1. Have the test owner commit the reviewed test sources and their inputs.
   Select paths for baseline tests, runner configuration and exclusions,
   fixtures, snapshots, coverage thresholds, and skip controls as applicable.
   Select whole directories when their inventory must remain fixed. Use
   repository-relative paths so a different worktree can verify the same set.
2. Generate a hash manifest of the selected paths and Git file modes from
   that commit. Save the manifest outside the selection. Commit it with the
   selected inputs intact. Give the hook and CI owners the accepted baseline
   commit and manifest location.
3. Configure a local write hook on the supported editing tools, including
   protection for the manifest. Make the integrity check required in CI.
   Supply the accepted baseline commit, manifest location, verifier and
   invocation from settings the candidate cannot change. Compare the exact
   candidate's selected paths against the trusted manifest and compare its
   manifest file against the manifest entry in the baseline tree. Check path
   inventory, file modes and hashes, including additions in a protected
   directory. Run the baseline tests as a separate required result.
4. Try an independent test or implementation change and a protected edit
   through the actual hook. Check CI on a clean commit and on a protected
   shell edit committed with the hook bypassed. Include a fixture or test
   change, an exclusion, threshold or skip-control change, a replaced
   manifest, and unavailable trusted inputs. Record which boundary rejected
   each case. Restore verified settings and repeat the affected checks after
   a control failure or update.

For a GitHub push check, copy `assets/controls/baseline.yml` from the
installed tooling to `.github/workflows/baseline.yml`. Set the accepted
commit containing the verified release archive at `methodology-ci/tools.tgz`,
the accepted baseline commit and the manifest path before approving the
workflow. On a clean runner it fetches Git objects, installs the accepted
archive offline and runs the verifier on the exact pushed commit. Configure
the trusted gate to require the job from that pinned workflow, including
its workflow ID, blob, event and check suite as in the
[GitHub admission procedure](merge-train.md#publish-a-head-bound-audit-and-required-results).
Give an ordinary integration route an equivalent independently protected
workflow requirement. Run the baseline tests as their own required result.

Select a versioned build and use its documented install and invocation
commands. Record those commands and the tested host versions in the
[profile](../PROJECT-PROFILE.md#tools-and-checks).

## Harness mechanisms

- **Codex.** Use the configured filesystem and network boundary for isolation.
  A `PreToolUse` hook can block supported local shell and edit calls, including
  `apply_patch`. Keep CI as the authoritative check of committed path changes
  because some tool paths do not invoke the hook.
  On Codex 0.170.0 a linked worktree can inherit the hook layer from the
  main checkout. Inspect the discovered hooks and trust the exact intended
  definition in the selected host before relying on its protection.
  [Codex hooks](https://learn.chatgpt.com/docs/hooks#tool-coverage),
  [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
- **Claude Code.** Use the documented permission rules for the tool, a
  `PreToolUse` command hook for supported calls, and the Bash sandbox when
  shell writes or network access must be restricted. The VS Code extension's
  graphical panel uses the shared settings file. Its Hooks menu displays
  loaded settings hooks in supported versions. Verify the actual Claude Code
  surface, version, and shell boundary the adopter uses.
  [Claude Code hooks](https://code.claude.com/docs/en/hooks#pretooluse),
  [permissions](https://code.claude.com/docs/en/permissions),
  [sandboxing](https://code.claude.com/docs/en/sandboxing),
  [VS Code settings](https://code.claude.com/docs/en/vs-code#configure-settings).

An enforcement check must stop its dependent action when required input or
its own result is invalid or unavailable. Test that condition through the
claimed entry point. Where a hook can be skipped or fail open, use a required
boundary that rejects the violation. Test a clean case and a deliberate
violation. Record the exit status, reason, applicable versions, and observed
boundary. Keep guard activation evidence so the project can later compare it
with [process metrics](../PROJECT-PROFILE.md#process-metrics).

## Checks that depend on the project contract

The data owner can compare applied migration versions and content against the
trusted history, then exercise clean replay and data-preserving upgrade using
the accepted database tools. The same ownership applies to a rule that
depends on deployed permissions, webhook verification, monetary rounding,
browser accessibility, signing, or framework-specific packaging. Keep those
checks with the relevant domain owner. A common runner can call them once the
owner supplies the exact contract, identity, and expected outcome.

Keep judgment with the responsible person or review. Examples include
whether a source authorizes the change, a test represents the intended
behavior, an exception is warranted, an observation proves the actual user
path, or a risk requires another specialist. A machine can match an approval
or result to an identifier when the project provides authoritative records.
Choosing the gate, accepting the result and resolving the remaining findings
stay with their owners.
