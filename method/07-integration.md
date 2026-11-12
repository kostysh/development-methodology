# Git, CI/CD, and integration

Concrete branches, commands, merge strategy, and required checks belong to
the [profile](../PROJECT-PROFILE.md). The prototype does not install CI and
does not assume it already exists. The absence of a pipeline is recorded
explicitly, not as its PASS.

## Steps

1. Create a task worktree and check the repository state.
2. Add only your own paths to a commit; review the staged diff.
3. Run the mandatory local checks before push.
4. Open a PR with the problem, result, risk, links, and evidence.
5. Before merge, check base, head, conflicts, checks, findings, approvals,
   and the uniqueness of new IDs.
6. Merge according to the profile and re-read the PR, the final commit, and
   the branches.
7. After deploy, check the actually deployed revision.
8. Finish your own resources and synchronize the main checkout.

## Isolation and preparation

One task has an owner, a branch, and an isolated working state. For Git, a
task-owned worktree inside the repository is preferred. Before the first edit,
check root/remote, HEAD, base/upstream, index, dirty/untracked state,
worktrees, unfinished Git operations, and local instructions. Use a fresh
accepted base; other people's unpublished commits do not silently become part
of it.

The temporary worktrees root must be ignored. If setting it up requires a
preparatory change, make it within the permitted boundaries and check the
scope separately. An external directory is chosen by an explicit instruction
or an agreed constraint. Read-only research does not require a new worktree.

An existing worktree is continued only for the same task, after verifying
ownership. Do not use stash/reset/clean to hide someone else's state. A
worktree isolates files, but not ports, databases, credentials, or external
services.

## Commit and publication

Stage only explicit paths or hunks. Review the full staged diff and make sure
it contains no other people's files, secrets, or accidental generated outputs.
Keep commits meaningful and in the accepted format; a task ID is used for
traceability if it exists, not invented for the sake of form.

Before push, finish the mandatory local checks of the candidate being
published. Check the current rules of the target branch, approvals, the exact
head/base, and the scope. Rules from a dated document do not replace the
current state of the service.

Publication goes only to a permitted branch. The PR/MR contains the problem,
result, risk, links to owners, evidence, limitations, and further acceptance.
A draft is acceptable after the intended boundary of local gates; it does not
authorize publishing a red mandatory candidate.

On the accepted full route, changes are integrated through a PR/MR with
required checks/review. Another route must be explicitly established by the
profile, not chosen as a way around protection. Having admin access does not
authorize a bypass.

## Candidate freshness

Before merge, check again the base, head, conflicts, checks, unresolved
findings, mandatory approvals, automatic closing of tasks, and the uniqueness
of the IDs of new documents relative to the current base
([identifiers](13-artifacts-and-communication.md#identifiers)). Updating the
base or resolving a conflict requires assessing the affected evidence and the
necessary reruns. A change of SHA does not prove a change of the tree, but the
binding of evidence must be checked. A base update that does not intersect
with the task by files and contracts does not require a new review. Mandatory
CI for the final revision remains.

Prefer an ordinary fast-forward push of the exact ref. If rewriting a
published task branch is separately permitted, use a lease with the exact
observed remote OID and an explicit refspec. Do not rewrite shared/mainline
branches or other people's branches. After push, re-read the remote ref.

## Integration queue

If several tasks are ready at the same time, the integration owner assembles
them into one candidate: one rebase, one expensive run on the combined tree.
On failure, the candidate is split by task to find the cause. Tasks with
incompatible migrations do not go into one batch.

## Pipeline and release

Build checks according to the actual consequences of the change.
Documentation-only work must not start a database or an application release
without a dependency. A skipped job counts as acceptable only under an
explicit scope rule; a vanished job or an unknown outcome is not equal to a
permitted skip.

If a privileged release is needed, separate verification of the untrusted
candidate from publication: minimal permissions, a verified source, identity
of the build artifact, no running of candidate scripts with release secrets.
The order of CI/build/migration/deploy/merge is defined by the project's
accepted contract, not by a universal command from someone else's repository.

For a migration/release, use the exact identity of the operation and a single
integration owner. Do not start the next release until the state of the
previous one and its cleanup are established. Losing the response after an
external mutation requires reading and reconciling the facts, not blindly
repeating create/deploy/merge.

If CI fails, keep the candidate SHA, run/attempt/job, the original error, and
the failure class. Distinguish a product assertion, a test defect, runner
startup, cleanup, and a network/runtime interruption. A fix is verified by a
replacement run of the changed candidate. Details of retry limits are in
[diagnostics](14-learning-and-recovery.md).

## Confirming the result

After merge, re-read the PR state, the final commit, and the remote branch.
Bind the accepted evidence to the final tree/artifact and the mandatory
checks. One run before merge or a successful merge command does not prove
this whole transition.

If the pipeline contract allows carrying candidate evidence over to an
identical final tree, confirm this binding with the standard trusted
readback. If a separate CI run of the final SHA is required, wait for it. The
prototype does not declare these options automatically equivalent.

For a deploy, check the actual deployed identity and the applicable scenarios
of the target environment. A local test does not prove the state of the
deployed system. Do not claim a release if the task ended with only a
document integration.

## Finishing Git work

After the mandatory transitions succeed, keep the necessary evidence, confirm
that no task-owned resources and no uncommitted work remain, then delete only
your own temporary branches/worktree within the permitted boundary. Do not
apply a broad prune or cleanup to other tasks. On failure/unknown, keep the
ability to recover.

Synchronize the main checkout without losing other people's state, usually
via fast-forward. On divergence, establish who owns the commits; do not fix it
with an automatic reset. The final report names the scope, commit/PR, checks,
integration state, other people's preserved changes, and real limitations.
