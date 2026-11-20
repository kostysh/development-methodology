# GitHub default for the merge train

Use this design when the project selects the [train](../method/07-integration.md#merge-train).
Install the versioned companion. The project supplies a trusted
runner, suite image, admission authorities and the settings in the [profile](../PROJECT-PROFILE.md#merge-train). Verify the built train
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

## Installed train

Install the tools archive from the [adoption guide](../ADOPTION.md). Check
`methodology-train --version` against its release. The archive includes
`assets/train/dispatcher.yml`. Copy the dispatcher into a trusted management
repository's default branch. Configure its target owner, repository, App ID
and App key in the protected `methodology-train` environment. Restrict that
environment and runner group to the reviewed dispatcher/ref. Use at least two
runner slots on the same Linux host and one private state directory for every
dispatch to the target. Other workflows and contributors must have no access
to that runner, Docker daemon, configuration, executable search path or state.
The dispatcher invokes the installed binary at an absolute path. It performs
no checkout. Adjust the binary and configuration paths to the installation.

Use Git 2.38 or newer with `merge-tree --write-tree`, GitHub CLI with
`gh api`, util-linux `flock`, and Docker with the configured immutable suite
image preloaded and read-only, non-recursive bind mounts. The GitHub adapter
supports github.com and same-repository PRs. Pre-create the queue label.
The host supplies a short-lived installation token in `GH_TOKEN`. Grant
repository contents write, checks read, pull requests/issues write as needed
for labels and comments, and visibility into the active rulesets' bypass actors.
Keep the train timeout inside the installation token's remaining lifetime.
The train reads protections and fails closed if it cannot verify them.
[GitHub branch rules and rulesets](https://docs.github.com/en/rest/repos/rules)

Store the profile outside all candidate worktrees, on paths controlled by
the runner owner. Create an empty, private state directory (mode 0700) that
survives service restarts. A minimal profile has this shape. Replace every
example project value. Keep the aggregate check authority responsible for
all applicable fast checks, affected tests, baseline and audit verdict.

```json
{
  "repository": "example/disposable",
  "branch": "integration",
  "writerAppId": 12345,
  "stateDir": "/var/lib/methodology/train/integration",
  "mode": "dry",
  "checks": [{"name": "reviewed admission", "appId": 67890}],
  "queueLabel": "train-ready",
  "suiteImage": "sha256:<64 lowercase hexadecimal digits>",
  "timeoutSeconds": 2700,
  "maxPrs": 5,
  "fullBudget": 2,
  "flakeDays": 7,
  "flakeOwner": "suite owner",
  "immutableSources": true,
  "schedule": {"hoursUtc": [0, 2, 4], "graceMinutes": 20}
}
```

- List each required exact GitHub Check Run name and dedicated publisher's
  App ID under `checks`. The train reads the latest attempt by that publisher
  on the PR head. For GitHub Actions (App ID 15368), also supply
  `"workflow":{"id":123,"path":".github/workflows/admission.yml","blob":"<accepted Git blob OID>"}`.
  It verifies the immutable workflow bytes and successful push run on the
  same branch, head, workflow and check suite. Pin the workflow's external
  actions and keep its verdict independent of candidate-controlled code.
  This gate needs Actions read. A public repository can explicitly select
  `"publicRead":true` in the workflow object to read public run metadata
  through HTTPS with curl and no credential. An adopter can publish a
  single aggregate if its trusted publisher verifies every required gate,
  approval and audit for that head.
  [GitHub Check Runs](https://docs.github.com/en/rest/checks/runs)
- Record migration prefixes under `migrationPaths`, their required gates
  under `migrationChecks`, and the positive `maxMigrations` (default 1).
  Provide `docsPaths` for the documentation fast route. Select literal paths
  or directory prefixes ending in `/`. Both sides of a rename count.
  `dependencies` maps PR numbers to arrays of prerequisite PR numbers. The
  owner maintains the mapping in the trusted profile. Eligible prerequisites
  enter first. A prerequisite already merged into the target can satisfy the
  dependency. A repeated exclusion of the same kind for the same failing
  tests requires an operator decision. After that decision, add the PR
  number and last reviewed run UUID to `disposition`.
- Enabled publication requires `immutableSources: true`. Use source branches covered by active
  repository update/deletion restrictions with empty bypass lists. Have
  the owner establish that protection before publication. The train verifies
  it before the final head read. This keeps the PR head stable across the
  target update. A dry run may use mutable sources. The enabled writer
  also applies an exact-OID lease to the target branch.
- GitHub can omit `bypass_actors` from an installation's read, including
  with Administration read. In that case the owner exports the complete
  `GET /repos/OWNER/REPO/rulesets/ID` responses using a separate authorized
  account. Put them in a protected JSON file outside candidate worktrees
  and select its absolute path in `ruleEvidence`. Use the shape
  `{"repository":"OWNER/REPO","repositoryId":123,"byBranch":{"main":[...],"ready/one":[...]}}`,
  with the applicable rule objects for each exact branch. The writer compares
  the live repository ID, effective rule ID, source, target, enforcement,
  conditions, rules and exact fractional-seconds `updated_at` before using
  the owner's actor list. The least-privilege installation cannot read
  GitHub's ruleset history version in this case. This fallback relies on
  GitHub changing that timestamp on edits. Refresh the owner export after
  a rule changes. Never give the writer the owner's credential.
- For solo merge authority, set `mergeGate` to an argument vector such as
  `["/opt/methodology/bin/methodology-solo", "gate", "/etc/methodology/solo.json"]`.
  The train uses this stable profile inode as the shared publication lock.
  A custom gate adapter must supply its trusted absolute `mergeGateLock`
  and serialize every authority change on that inode with an exclusive lock.
  The train appends the repository, target branch, PR number and head OID.
  Exit 0 permits this PR and exit 1 holds it. Any other failure stops the
  run. Keep the policy and decision records outside the candidate. The
  train checks at admission, then holds the shared authority lock across
  all final PR checks, the Git push and readback. A busy authority returns
  exit 75 for a later retry. The [solo procedure](solo-decisions.md)
  covers installing an owner batch and ordinary publication.
- Set `deployment` to the absolute path of a trusted installed adapter for
  the authorized **test** environment. The train calls `read REPO BRANCH`
  for a revision (or `none` for an empty environment), then
  `deploy REPO BRANCH SHA` when needed, then reads independently. Require
  idempotent deployment by revision and a terminal synchronous result.
  The adapter receives no writer token. Execute project code only inside
  the isolated test environment.
- Set `metrics` to `{"profile":"/etc/methodology/metrics.json","source":"train","task":"pilot_1"}`
  after binding the normalized source to the issued task alias. Each
  terminal receipt produces one `train.observed` row, including lock skips.
  `methodology-train observations PROFILE` replays receipts after a
  journal interruption. Its stable event identities deduplicate replays.

Prepare a trusted verifier image. Set `suiteImage` to its local
`sha256:...` image ID or immutable `name@sha256:...` digest. The image
entrypoint receives `full|targeted|docs COMMIT_OID [TEST_ID ...]`. The
candidate files are mounted read-only at `/candidate`, without Git metadata.
The process runs as UID/GID 65534 without capabilities, external network,
host sockets or credentials, with a writable bounded `/tmp`. The verifier
owns the test oracle, derives verdicts independently, isolates any candidate
subprocess from its verdict channel, and emits one JSON object on stdout.
Use `{"result":"pass"}` or `{"result":"fail","tests":["test_id"]}` and exit 0.
A malformed receipt or a failed verifier is an infrastructure failure.
Supply offline dependencies in the trusted image. This runner supports local
container test resources. Suites requiring submodules, external networking
or a mutable shared service need a compatible isolated runner before adoption.

```sh
methodology-train run /etc/methodology/train.json
methodology-train run /etc/methodology/train.json --scheduled
methodology-train run /etc/methodology/train.json --pr 17
methodology-train run /etc/methodology/train.json --pr 22 --docs
methodology-train report /etc/methodology/train.json FROM_UTC THROUGH_UTC
```

Each run writes a private JSON receipt under `stateDir/runs/`. It records the
candidate OIDs, suite attempts, exclusions, decisions, queue, and observed
readbacks. A held run with an incident or a pending operator decision exits
1. An invalid invocation or configuration exits 2. An overlapping start
records a skip and exits 0. Keep receipts and the pending write record
together. After a crash, invoke the same profile again. It removes only
run-owned resources, reads the actual target and completes any outstanding
test deployment. If a target has an unexpected third OID, investigate it
before authorizing another write. After a tool update fails, restore the
previous verified archive, dispatcher, configuration and compatible private
state, and exercise the dry cases before the next enabled publication.

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
