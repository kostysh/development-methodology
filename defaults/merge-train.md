# GitHub default for the merge train

Use this design when the project meets the [trigger](../method/07-integration.md#merge-train)
and opts in. The project supplies a built train, its runner and the settings
in the [profile](../PROJECT-PROFILE.md#merge-train). Verify the built train
with the project's [package checks](controls.md#common-checks).

## GitHub setup

1. Use a scheduled GitHub Actions dispatcher that invokes the pinned train
   build on a runner with access to the approved test environments.
   GitHub's native merge queue forms `merge_group` candidates when PRs enter
   the queue. Its merge limits group final merges and leave build dispatches
   separate. The documented settings offer neither timed admission nor one
   full check run for a scheduled batch. [GitHub merge queue][merge-queue]
2. Schedule a start every two hours during the project's night window.
   Record the start, end and time zone. Set a maximum duration and choose
   the interval with two full suites and diagnosis in mind. An overlap is
   a normal skip. The scheduled workflow must exist on the default branch.
   GitHub can delay or drop schedules. Accept a timed dispatch only for
   an identifiable open slot. Account for late or missing slots in the
   morning report. [GitHub schedule][schedule]
3. Let each invocation reach the lock attempt while a prior train is
   running. GitHub Actions `concurrency` leaves pending work or can cancel
   the active run. Use a non-blocking lock shared by scheduled, urgent and
   documentation paths. For example, `flock -n` on one host works when
   every path shares its lock file and the process holds the lock until it
   exits or crashes. If contenders run on different hosts, choose a
   shared equivalent with the same semantics. A runner that queues the
   invocation until the active train ends cannot supply an immediate skip.
   [GitHub workflow concurrency][concurrency]
4. Configure a dedicated GitHub App identity as the sole writer to the
   exact integration branch. Scope its installation and token to the
   repository and the required permissions. Apply an active branch ruleset with
   **Restrict updates** and the App as its only bypass actor. Put permanent
   protections such as blocking force pushes and deletion in a separate
   ruleset the App cannot bypass. Verify the combined rules and retain
   the project's required gates. Keep installation credentials and
   write-capable code in the trusted runner. Isolate PR checkout and test
   execution from write credentials. Read the verdict and checks from their
   configured trusted sources. Verify that agents and ordinary identities
   cannot update the branch.
   [Available rules][rules] · [Combined rulesets][combined] · [App authentication][app]
5. Verify the write and readback on the selected branch. Assemble candidates
   with the included heads reachable in their history. Use a Git ref update with
   an explicit lease for the expected OID and separately verify the
   fast-forward ancestry. A prior read alone cannot guard a racing update.
   Verify the branch OID, tree and all affected PR states independently. GitHub
   can mark a PR merged when its commits become reachable from the base.
   Exercise this on the actual target branch and PR shape before enabling
   live writes. A closing comment cannot establish a merged PR.
   [GitHub indirect merges][merge-recognition]

The default migration limit is one PR per train. Record the PR limit,
[full-suite budget](../method/06-verification.md#verification-for-a-merge-train),
flaky-test recurrence window and timeout in the profile.

## Dry-run cases

Use an isolated repository, test environment and controlled failures.
Exercise the built entry point with known base and PR head OIDs, checks
and audit status fixtures, and the real provider and runner boundaries.
Assert the expected branch OID and tree, PR states and test deployment
revision through readback. Use the write path only in an authorized
disposable setup. During dry nights, suppress the live write and
deployment and record what the train would have done.

| Case | Starting condition and action | Expected result |
| --- | --- | --- |
| Failing PR | Queue a passing PR, a second PR that fails reproducibly, and its dependant. Make the affected test fail only after the second PR enters the candidate. | Replay finds the first failing prefix. The second PR and its dependant are returned. The remaining candidate gets one final full run. Repeat with a red final candidate and verify the branch and test deployment stay at the prior revision. |
| Incompatible pair | Two PRs pass alone and fail together. Queue them in that order. | Exclude the later PR. The earlier PR may integrate only after the remaining candidate passes. |
| Flaky test | Fail one test in the first suite and pass it on the same candidate's targeted rerun. Repeat the pattern for the same test within the recurrence window. | The first run records an owned defect and can integrate. The recurrence holds integration and appears as a blocking action. |
| Conflict and stale evidence | Introduce a base conflict after admission. In separate runs update a queued PR head and move the disposable base to a different ancestor of the candidate between verification and update. | Return the conflict and its dependant for owner action. A changed head loses admission. A changed base rejects the pending write. Neither stale candidate is integrated. |
| Runner failure | Cause a runner or environment failure, then fail its one retry. Also exercise an empty queue. | No failed run integrates. The report names the environment action. The empty run allocates no temporary environment. |
| Interruption | Terminate a run with owned branches and test resources. Repeat after a disposable branch update and before test deployment. | The next run can acquire the lock and reconciles leftovers. It reads the real branch and catches the test deployment up without replaying the merge. A timeout is recorded as an incident. |
| Overlap and sole writer | Hold an active train while a scheduled or urgent start and an eligible documentation PR arrive. Attempt a branch update as an agent. | The second train records an immediate skip and never starts later. The branch rejects the agent write. The App processes the documentation PR after the lock is available, with fresh checks against the new base. |

Also verify a clean batch with passing tests, fresh approvals, the
expected final ref and PR states, and the test revision when configured.

## Morning report

Use one summary for the configured night window. Keep the facts for each
train in its run record and link to them here.

- Window, integration branch and run IDs —
- Decisions awaiting the operator, with owner and required action —
- Integrated PRs, final commit and test deployment readback —
- Returned PRs with reasons, failed tests and run or log locators —
- Flaky tests, defect owners and recurrence blocks —
- Incidents and recovery actions —
- Skipped or missed starts and reasons —
- Remaining queue —

[merge-queue]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
[schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
[concurrency]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
[rules]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
[combined]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
[app]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
[merge-recognition]: https://docs.github.com/en/pull-requests/reference/pull-request-merges#indirect-merges
