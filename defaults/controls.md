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
| Persistent artifact IDs are unique within the defined namespace. The current integration base can introduce a collision after drafting. This covers artifact authors and integration. [Identifiers](../method/13-artifacts-and-communication.md#identifiers), [candidate freshness](../method/07-integration.md#candidate-freshness) | The documentation and integration owners enable the existing metadata or ID check on the candidate against the current base. Supply the document roots, namespace and identity field from the profile. Where IDs may never be reused, check the owner's retained allocation history as well. | Two documents with distinct IDs pass. A newly introduced collision with an unchanged document, or reuse of a retired ID when history is required, fails. |
| Git writes use the expected repository, worktree, destination and candidate. Staging preserves paths outside the declared write set. This covers Git operations and review handoff. [Isolation](../method/07-integration.md#isolation-and-preparation), [publication](../method/07-integration.md#commit-and-publication) | The integration owner uses a read-only Git preflight and explicit path staging. Resolve canonical paths and verify the checkout, expected refs, applicable ignore rule, and staged path set before a dependent write. Use an exact expected remote OID for an authorized rewrite. Apply server-side restrictions on protected refs. | The intended checkout and staged paths pass. A wrong remote or checkout, symlink outside the approved root, unrelated staged file, or stale rewrite lease stops the corresponding operation. |
| Mandatory checks belong to the candidate and finish successfully through the declared entry points. This covers implementation, test runners, packaging and integration. [Run composition](../method/06-verification.md#run-composition), [CI and release](../method/07-integration.md#pipeline-and-release) | The CI owner uses the repository's required checks and trusted result readback. Bind actual runner status and the required job or suite IDs to the candidate and the accepted merge policy. Use the declared build, lint, type or test command as applicable. Record explicit policy skips and propagate configured diagnostic failures to the exit status. | The candidate with all required results passes. A stale result, missing or cancelled required job, unpermitted skip, or failing assertion followed by a success message holds integration. |
| The accepted test baseline is preserved during implementation. [Verification](../method/06-verification.md#protected-test-baseline) | Use the [test baseline procedure](#protect-a-test-baseline). | Independent changes pass. The local hook rejects a protected edit. Required CI rejects a committed protected change even when the hook is bypassed. |
| A mutable resource has at most one conflicting user. This covers database-backed tests, environment operations, and other checks that reset or mutate shared state. [Runtime isolation](../method/08-environments-and-operations.md#runtime-isolation), [run lifecycle](../method/08-environments-and-operations.md#run-lifecycle) | The environment owner gives checks isolated resources where available. For a shared resource, the runner acquires an exclusive lock keyed by the verified resource identity before the first conflicting action. Use a lock shared by every contender, including separate CI runners when applicable. Lock competing runs around setup, exercise and cleanup. Keep the intended participants of a race test concurrent within one run. Cleanup and readback precede release. A lost lease, failed lock service, or unknown prior run holds the dependent action until the owner reconciles the resource. | Checks for separate disposable databases proceed in parallel. A second reset of the same database waits or exits before mutation. A killed owner with uncertain cleanup cannot admit another run until reconciliation. |
| Runners preserve real exit status and release their own resources. This covers integration, browser smoke, and runtime checks. [Run lifecycle](../method/08-environments-and-operations.md#run-lifecycle), [resource failures](../method/14-learning-and-recovery.md#ci-and-resource-failures) | The runner owner configures task-scoped limits, records the child exit status outside the interactive session, and verifies cleanup by the same owned identities on success, failure, or interruption. Store the primary result and cleanup result separately. | A completed run retains the correct status and leaves no task-owned listener. A probe that exits non-zero stays failed after cleanup. An independently surviving child still appears as unresolved. |
| Read-only or untrusted verification has no access to mutation credentials. Evidence contains only approved fields. This covers review, browser work, provider checks and release pipelines. [Configuration and secrets](../method/08-environments-and-operations.md#configuration-and-secrets), [data control](../method/10-security-and-privacy.md#data-control), [release isolation](../method/07-integration.md#pipeline-and-release) | The security and operations owners omit write credentials, use scoped identity and isolate filesystem and egress where required. Keep release authority out of candidate execution. The evidence owner allowlists fields at the actual export boundary and checks sensitive outputs with synthetic values. Use the repository's own secret detection where applicable. | An authorized synthetic check emits the permitted status and identifiers. A candidate job cannot use release credentials. An injected token, email, full command, or payload is absent from the persisted output. |
| The package builds and runs from the declared distribution and dependency set. This covers code-backed skills, tool packaging, and generated outputs where the repository has a declared source. [Dependency verification](../method/05-implementation.md#dependencies-and-tools), [skill ownership](../method/15-skills.md#ownership-split) | The package owner uses the existing locked install, build and package checks. Verify public entry points from the built artifact. For generated packages, use the established source/output drift check and validate declared active references and assets. | A clean locked build invokes the documented entry point. An out-of-date lockfile, a missing runtime asset, or a generated file that diverges from its source fails the applicable check. |

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
