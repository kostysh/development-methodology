# GitHub default for the merge train

Use this design when the project selects the [train](../method/07-integration.md#merge-train).
Install the versioned companion. The project supplies a trusted
runner, suite image, admission authorities and the settings in the [profile](../PROJECT-PROFILE.md#merge-train). Verify the built train
with the project's [package checks](controls.md#common-checks).

## Choose the branch policy

The default `rulesets` policy verifies server-enforced restrictions on the
target and submitted refs. A missing rule or denied API call stops the run.
For a **private repository on GitHub Free**, the owner can explicitly choose
`private-free`. GitHub allows other accounts with write access to change these
refs. Use this policy when the team can reserve integration writes for the
train by agreement and can investigate a direct write. [GitHub plan availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

1. Choose the exact repository and integration branch. Review their current
   state, including the deployed revision. Read the branch commit with
   `gh api "repos/$repo/git/ref/heads/$branch" --jq .object.sha`. Record the
   approved 40-character commit in the project profile. Supply it as
   `initialBase` in the protected train configuration below.
2. Follow the common GitHub App, admission, isolated runner and scheduler
   setup below. In the example profile add `"branchPolicy":"private-free"`
   and `"initialBase":"<approved commit>"`. Remove `immutableSources` and
   `ruleEvidence`. Configure `admissionPolicy`, the independent review
   publisher, pinned workflow and required jobs. Grant the App Actions read
   for private workflow results. Use the runner's protected App key and
   installation ID. The runner requests a token scoped to this repository
   and verifies the repository is private. Skip the ruleset creation and export.
3. Submit an exact `ready/<task>-<commit>` revision. Each correction gets
   a new submission and a review bound to the current base and head. After a
   successful batch, obtain fresh reviews against the new base for any
   remaining ready PRs before their next admission. The
   train rechecks admission and the source refs, then fast-forwards using
   a lease on the expected target commit. It reads back the target, tree,
   included PRs and configured test deployment. The lease covers the target
   update. A writer can still race a source-ref check or change either ref
   later. Keep production credentials and deployment separate.
4. Keep the private state directory across runs. After the first successful
   integration the stored candidate becomes the expected target. An unexpected
   tip produces an incident even when the queue is empty. The next run checks
   the tip again. If someone restores the expected commit, it can proceed.
   A change restored between observations is invisible to the train. To keep
   the train on hold during an investigation, pause the scheduler,
   compare the reported commits, PRs and actual test deployment, and have
   the integration owner reconcile the change. Preserve receipts and pending
   state. If the owner adopts an external revision as a new baseline, first
   reconcile pending writes and effects, archive the state, then recommission
   with a fresh state directory and the explicitly approved commit. Run the
   dry checks and the scheduled commissioning case again.

## GitHub setup

1. Run the pinned train on a trusted runner with access to the approved
   test environments. Use a [Codex scheduled project task](#schedule-with-codex)
   to start it. Use [system cron](#schedule-on-a-linux-host) only if the
   built-in scheduler is unavailable. Use one active scheduler per branch.
   GitHub's native merge queue forms `merge_group` candidates when PRs enter
   the queue. Its merge limits group final merges and leave build dispatches
   separate. The documented settings offer neither timed admission nor one
   full check run for a scheduled batch. [GitHub merge queue][merge-queue]
2. Schedule a start every two hours during the project's night window.
   Record the start, end and time zone. Set a maximum duration and choose
   the interval with two full suites and diagnosis in mind. The runner accepts
   a scheduled dispatch only during an identifiable open UTC slot. Record
   late or missing starts in the morning report. An overlap is a normal skip.
3. Let each invocation reach the lock attempt while a prior train is
   running. GitHub Actions `concurrency` leaves pending work or can cancel
   the active run. Use a non-blocking lock shared by scheduled, urgent and
   documentation paths. For example, `flock -n` on one host works when
   every path shares its lock file and the process holds the lock until it
   exits or crashes. If contenders run on different hosts, choose a
   shared equivalent with the same semantics. A runner that queues the
   invocation until the active train ends cannot supply an immediate skip.
   [GitHub workflow concurrency][concurrency]
4. Configure a dedicated GitHub App identity as the designated writer to the
   exact integration branch. Starting with only the owner's GitHub account,
   open **Settings → Developer settings → GitHub Apps → New GitHub App**.
   Register a private App, use the repository URL as its homepage, disable
   webhooks, and grant Contents and Pull requests write, Checks read, and
   Actions read when the project verifies private workflows. Install it
   under **Only select repositories** for the target. Generate its private
   key and place it only on the protected orchestration host. Record the App
   slug, numeric App ID and installation ID (shown in the installation's
   settings URL). An existing train installation needs no new registration.
   [Register a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).
   Scope each token to the repository and the required permissions. For the default ruleset policy, apply an active branch ruleset with
   **Restrict updates** and the App as its only bypass actor. Put permanent
   protections such as blocking force pushes and deletion in a separate
   ruleset the App cannot bypass. Verify the combined rules and retain
   the project's required gates. Keep installation credentials and
   write-capable code in the trusted runner. Isolate PR checkout and test
   execution from write credentials. Read the verdict and checks from their
   configured trusted sources. With the ruleset policy, verify that agents and ordinary identities
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
`assets/train/methodology-train.cron` and `assets/train/dispatcher.yml`.
For the remote trigger, copy the dispatch-only workflow into a trusted
management repository's default branch as `.github/workflows/dispatcher.yml`.
Set the target repository and writer App ID in
the protected train profile. Mount the dedicated App key on this runner at
`/etc/methodology/train-app.pem` (owner-only, mode 0600) and set
`TRAIN_INSTALLATION_ID` in the protected `methodology-train` environment. Restrict that
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
The trusted runner starts the train with the host key path and installation ID.
On the host the train signs a short-lived App JWT and requests a token scoped
to one repository, contents write, pull requests write (labels and comments)
and checks read. Private Actions workflow readback also requests Actions read.
A new token is minted before a remote Git or API operation if the previous
token expires within two minutes. Candidate execution receives neither token
nor key. A short manual run under the ruleset policy can supply an already minted installation
token via `GH_TOKEN`; it cannot renew that token. Keep the profile timeout
inside the dispatcher's 180-minute job timeout with time for cleanup. For two
40-minute suites allow time for diagnosis and publication, for example 150
minutes in total. Raise both limits together if the actual measured budget
requires it. [Installation tokens](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app).
Under the default ruleset policy, the train reads the effective branch protections and stops if it cannot verify them.
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
  "admissionPolicy": "/etc/methodology/admission.json",
  "checks": [{"name":"Methodology reviewed admission","appId":15368,
    "workflow":{"id":123,"path":".github/workflows/admission.yml",
      "blob":"<accepted workflow blob OID>","event":"workflow_dispatch"}}],
  "queueLabel": "train-ready",
  "suiteImage": "sha256:<64 lowercase hexadecimal digits>",
  "timeoutSeconds": 9000,
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
  In the protected profile, set `"taskDependencies":{"child":["parent"]}`
  once, using stable task keys from the ready refs. The train resolves each
  key against same-repository PRs on the integration branch. A closed,
  unmerged submission drops out. Its replacement keeps the same key.
  Each required key must resolve to one open or merged submission. The
  parent enters first, or its merged head must be an ancestor of the base.
  A missing or ambiguous key holds the dependant. Close superseded submissions.
  The train rereads the mapping before publication. This option reads paginated
  PR history for the target branch. Existing `dependencies` maps PR numbers
  to arrays of prerequisite PR numbers. With both forms, both apply.
  For repeated exclusion of the same kind for the same failing tests, the
  operator decides whether work may continue. After that decision, map the
  stable task key (or a legacy PR number) to the reviewed exclusion run
  UUID in `disposition`.
- Enabled publication under the default ruleset policy requires `immutableSources: true`. Create one active
  repository branch ruleset with include `refs/heads/ready/*`, no excludes,
  `update` and `deletion` rules, and an empty bypass list. Allow branch creation.
  The server resolves this pattern for each actual ref. The writer confirms
  its effective active restrictions before final readback. A dry run may use
  mutable sources with a project-specific admission gate.
- For the ruleset policy, GitHub can omit `bypass_actors` from the installation's read. Once during
  setup, export the rulesets using a separate authorized account. Given the
  repository and its three active rule IDs (target update, permanent target
  protections, ready refs), run this in the owner's protected configuration
  directory. Install the resulting file as the profile's absolute `ruleEvidence`
  only after inspecting the actors and the repository identity.

  ```bash
  set -euo pipefail
  umask 077
  repo_id=$(gh api "repos/$repo" --jq .id)
  for id in "$target_updates" "$target_protections" "$ready_protections"; do
    gh api "repos/$repo/rulesets/$id"
  done | jq -se --arg repo "$repo" --argjson id "$repo_id" '
    if length == 3 and all(.[]; .bypass_actors | type == "array") then
      {repository:$repo,repositoryId:$id,rulesets:.}
    else error("incomplete ruleset export") end' > rule-evidence.new.json
  ```

  The writer uses the server's effective rule ID for the exact branch and
  compares repository ID, source, target, enforcement, conditions, rules
  and fractional-seconds `updated_at` before using the exported actor list.
  This fallback relies on GitHub updating that timestamp when actors change.
  Refresh the export when a ruleset changes. Existing exact-branch exports
  in `byBranch` remain readable. The owner credential stays off the runner.
- When an independent protected deployment supplies solo decision authority,
  set `mergeGate` to an argument vector such as
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
  covers installing an owner batch and ordinary publication. On a project with
  one GitHub account the normal author keeps opening PRs. A trusted orchestrator
  can publish an independent review through the existing App as described below.
  A chat note alone cannot release either the train or the solo publication gate.
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

### Schedule with Codex

1. To reuse the same chat, ask Codex to attach the schedule to the existing
   trusted project chat. For a separate chat on each run, create a standalone
   project task under **Scheduled**. Select the local execution environment
   approved for the trigger. Keep the host powered on, the desktop app
   running and the project available on disk.
   [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations)
2. Set the recurring times in the app to match the project's night window
   and time zone. Compare the displayed next runs in UTC with the trusted
   profile's `schedule.hoursUtc` and `schedule.graceMinutes`. Decide how the
   schedule will handle daylight-saving changes and recheck the mapping when
   the offset changes. The default UTC example uses 00:00, 02:00 and 04:00.
3. Give the task access to one fixed trigger. For a remote runner, the trigger
   submits only the scheduled dispatch to the reviewed workflow on the trusted
   default branch. Scope authorization to that receiver and keep the writer
   App key, target repository write credentials, and runner settings on the
   trusted host. GitHub requires repository Actions write permission for
   dispatch. Keep that credential behind the fixed trigger if it would grant
   broader access to the chat. For a co-located runner, use an approved fixed
   local entry point that passes the trusted profile and
   `--scheduled --slot UTC_HOUR` to the installed train. Capture the UTC
   hour when Codex submits the request. Keep privileged execution on the
   runner. Verify that the scheduled environment can reach the chosen
   receiver and run the fixed command without an approval prompt. A remote
   receiver needs network access to GitHub. Give the chat the exact command,
   target, expected effects and receipt location when configuring its schedule.
   If the unattended trial asks for approval, record the missed start and
   correct the permission for that trigger before enabling the night window.
   [GitHub CLI dispatch](https://cli.github.com/manual/gh_workflow_run)
   · [GitHub dispatch permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
4. Save the prompt below after substituting the actual UTC hours, grace period,
   management repository and default ref. If the task uses an approved fixed
   wrapper or local entry point, replace the command with that exact invocation.

   ```text
   This task starts the integration train for TARGET_REPOSITORY, branch TARGET_BRANCH.
   The reviewed trigger TRIGGER_REFERENCE submits the request. The runner checks ready PRs, updates that branch and the configured test deployment, and records the result at RECEIPT_LOCATION.
   Use UTC hours APPROVED_UTC_HOURS and a grace period of GRACE_MINUTES minutes.
   If the current UTC time is outside an approved open slot, report the missed start and stop.
   In an open slot run this exact approved command once:
   gh workflow run dispatcher.yml --repo MANAGEMENT --ref TRUSTED_DEFAULT -f scheduled=true -f slot="$(date -u +%Y-%m-%dT%H:00:00Z)"
   If the command is unavailable or denied, report the missed start and stop.
   Report whether the trigger accepted the request and include the returned run URL if available. The runner reports integration separately.
   Do not retry or backfill a slot, change permissions, or start an on-demand train.
   ```

The dispatch binds the request to the UTC hour when Codex submits it. The
train checks that hour, the configured grace period and existing receipts
when it starts. A request delivered in a later hour is rejected. A late
desktop start can count only for the open slot it actually reaches. An
earlier missed slot stays visible in the morning report.

When moving from an older release, remove any previous GitHub Actions
`schedule` trigger and disable any previous system cron entry for the branch
before enabling Codex. Reconcile any start already in flight. Keep the
reviewed `workflow_dispatch` entry if Codex uses that receiver.

### Schedule on a Linux host

If the built-in Codex scheduler is unavailable, opt in to system cron on
an always-on Linux host. Use a service account with access to the trusted
installation, Git, Docker, the test environment and private state. Install
Node and the release commands on the service's PATH. The service gets the
protected App key. PR code runs in the isolated verifier.

Copy `assets/train/methodology-train.cron` from the installed package to
a staging file. Set the actual service account, installation ID and paths.
Install it as a root-owned, mode 0644 file at
`/etc/cron.d/methodology-train` on that host. Keep the key itself in its
private file. Check the cron daemon's scheduling time zone. The example
runs at 00:00, 02:00 and 04:00 UTC on a UTC scheduler. For a different
night window set its times and the profile's `schedule.hoursUtc` together,
including the project's daylight-saving policy. Keep the daemon available
when the operator logs out. Disable this one entry to stop new scheduled
starts. The shared writer lock also covers urgent runs.

### Verify the scheduled start

Commission a disposable target with one near-term clock slot. Before the
slot, prepare an independently reviewed ordinary PR. Let the scheduler
start the run without operator interaction. Record the scheduled and actual
times, the selected receiver (local or GitHub Actions) and the installed
train's receipt for that UTC slot. For a remote receiver, include the
Actions run URL. GitHub and the configured
test deployment must show the tested commit. Include a protected change
without the owner's answer and a dependent PR. Confirm both stay open while
independent work merges. Verify that a missing slot appears in the morning
report. Leave it missed and let the next configured slot proceed. Restore
the night hours, enable the chosen schedule, and confirm one active scheduler
for the branch.

### Submit and correct a ready revision

Keep the editable task branch under the author's control. From its tested
checkout, set `repo` to the verified GitHub owner/repository, `base` to the
integration branch and `task` to the stable task identifier (letters, digits,
underscore or hyphen, up to 81 characters, starting with a letter or digit).
Set `title` and `bodyfile` to the prepared PR title and description file.
Use the normal author's Git and `gh` identity. If the owner and implementing
agent share a GitHub account, that account authors every PR. Keep the train
App key, installation tokens and trusted review records inaccessible to the
implementing session. For an owner account with administrative access, give
the authoring environment a repository-scoped author credential, without
administration or ruleset bypass, and isolate the owner's unrestricted login.
Check the remote before publishing. Use the same task identifier for every
correction so repeated exclusions stay visible across PR numbers.

```bash
head=$(git rev-parse --verify HEAD)
ready="ready/$task-$head"
git push origin "$head:refs/heads/$ready"
gh pr create --repo "$repo" --base "$base" --head "$ready" --title "$title" --body-file "$bodyfile"
```

Keep a single open submission for this work. On return, use its run ID,
failed tests and evidence to correct the editable task branch. Close the
returned PR with `gh pr close "$old_pr" --repo "$repo"` and retain its
submitted ref. Repeat the commands with the corrected commit and the same task
identifier. For a legacy PR-number dependency, update the affected
number. Task-key dependencies carry forward. Obtain fresh results and an
independent review on the replacement.
The train rechecks every gate before it admits or publishes the new head.

#### Retain or retire closed ready refs

Keeping these refs is the default. GitHub retains the PR and review history.
If the owner chooses a retention period, review expired closed submissions in
a maintenance window. Keep the task, PR, head OID, closure time and train
receipt. Preserve the submitted Git object in the project's archive if its
reproducibility policy requires it. A correction or exclusion alone does
not authorize deletion.

For the private Free policy, retain the refs when the operator cannot exclude concurrent writers.
For deletion under the ruleset policy, pause the dispatcher and submissions, acquire the writer lock
and reconcile pending publication. Proceed only when the owner can prevent
PR creation and reopening during maintenance. Verify that every PR for
each exact ref is closed, no queue or pending write references it, and its
current OID still matches the receipt. Install an active, no-bypass rule
restricting **updates and creations** on those exact refs before excluding
only those full ref names from the ready deletion rule. Leave the wildcard
rules active for all other refs. Verify effective rules and delete with an
exact lease, for example `git push --force-with-lease="refs/heads/$ready:$head" origin ":refs/heads/$ready"`.
Restore the original ruleset exclusions, verify the ref is absent and refresh
the writer's ruleset evidence before releasing the lock. Remove the temporary
exact-ref rule only after the wildcard restrictions are effective again.
Where an owner cannot isolate this operation, retain the refs.
[GitHub ruleset targeting](https://docs.github.com/en/repositories/configuring-branches-and-merges/managing-rulesets/creating-rulesets-for-a-repository)

### Publish a head-bound audit and required results

1. Place the verified release tools tarball at `methodology-ci/tools.tgz`
   in an owner-reviewed Git commit. In that commit store
   `methodology-ci/admission.json` with the actual repository, target and
   numeric GitHub user ID of the review publisher as `reviewerId`. For a
   human author with an independent reviewing agent, use the existing train
   App's **bot user ID**. This differs from its App ID. In the owner's
   setup shell run `gh api user --jq .id` for the expected author, and
   `gh api "users/${app_slug}%5Bbot%5D" --jq .id` for the publisher.
   Record the two distinct numbers. Pin the author with `submitterId` for a
   single-author project. A project with several permitted authors may omit
   it. An existing independent human GitHub reviewer keeps their user ID in
   `reviewerId` and submits the review themselves.
   Supply the actual required
   fast checks, affected tests and baseline tests. For example:

   ```json
   {
     "repository":"example/disposable","branch":"integration","submitterId":13579,"reviewerId":24680,
     "required":[{"id":"fast","name":"Project fast checks","appId":15368,
       "workflow":{"id":83,"path":".github/workflows/fast.yml","blob":"<accepted workflow blob OID>"}}],
     "baseline":{"commit":"<accepted baseline commit OID>","manifest":"methodology-ci/baseline.json"}
   }
   ```

   The optional `baseline` verifies protected files independently of
   running the baseline tests. Any candidate-executing CI must isolate
   the trusted test oracle and keep mutation credentials out of its jobs.
   A dedicated check publisher uses its own numeric App ID. Include migration
   gates separately in the train profile for the applicable paths.
2. Copy the packaged `assets/train/admission.yml` to the target repository's
   default branch as `.github/workflows/admission.yml`. Replace
   `INPUTS_COMMIT` with the reviewed commit from step 1 before committing.
   The hosted job reads Git objects without checking out or running the PR.
   Its read-only GitHub token reads the review and the required Check Runs.
   Copy the same policy into the writer's protected `admissionPolicy` path.
   Read the workflow ID with `gh api "repos/$repo/actions/workflows/admission.yml" --jq .id`.
   Read its Git blob with `git rev-parse "$workflow_commit:.github/workflows/admission.yml"`.
   Pin both plus the job name, path and `workflow_dispatch` event in the
   train's `checks`. The aggregate cannot be one of its own prerequisites.
3. Before requesting the audit, verify the live identities with a
   repository read token in `GH_TOKEN`:
   `methodology-train identity "$policy" "$pr" "$head" "$ready"`.
   Match the returned author and publisher IDs to the profile. A missing,
   shared or unexpected identity holds the submission before expensive checks.
   For an App publisher, follow the procedure below. For an independent human
   publisher, have that reviewer audit the revision and submit **Approve**
   on the exact head with the standalone line `Methodology audit: PASS` and
   the evidence. Only the publisher's latest decisive review qualifies. A
   dismissal, changes requested, a different head or an absent audit holds it.
   The App publisher includes the exact base SHA in its verdict. A base
   change holds admission until the reviewer checks the new pair. When the
   project configures protected review paths, its publisher must include the
   base even for a human review.
4. The submission coordinator dispatches the reviewed workflow on the
   submitted ref as part of handoff:
   `gh workflow run admission.yml --repo "$repo" --ref "$ready" -f pr="$pr"`.
   Confirm the native job **Methodology reviewed admission** passed on that
   head. The train independently reads the latest required checks and
   review again at publication. The check publisher must match the pinned
   workflow bytes, run event, branch, head, repository, check suite and the
   successful job's check-run URL.
   A project using its own dedicated aggregate publisher may keep that
   existing authority after verifying its evidence and invalidation rules.
   [Dispatch semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch),
   [PR reviews](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request).

#### Publish an independent agent's verdict through the existing App

Use this route when one human GitHub account authors PRs. Set up the train
App and its protected host once as described above. Only the trusted
orchestrator can invoke the review publisher with the App's key or token.
The same publisher can attest an ordinary, editable PR in a project that
uses PR-based integration. The train admits the exact reviewed commit from a ready submission.
The implementing agent and the reviewing agent both work without these
credentials or access to the orchestrator's private directory, executable
search path and Git configuration. Give the reviewer a separate, read-only
session with the authoritative requirements and exact Git objects.

1. The orchestrator reads the current PR number, target branch, base commit,
   head ref and head commit from GitHub. Give that tuple to the independent
   reviewer. The reviewer examines the change and its required evidence,
   then returns PASS or FAIL, their session/record locator and an evidence
   reference. An absent review holds publication. If the PR changes, obtain
   a review for the new tuple.
2. Collect the result directly from the independent session. Store it in
   the orchestrator's private directory (0700) in a regular file (0600).
   Use public-safe locators in the two text fields. Do not copy a verdict
   from the PR, its checkout or the implementing agent, since any of those could
   supply its own approval. For example, the record has this shape:

   ```json
   {"repository":"example/disposable","branch":"integration","base":"<base SHA>",
    "pr":17,"head":"<head SHA>","ref":"ready/feature-<head SHA>",
    "verdict":"PASS","reviewer":"<independent review session>","evidence":"<review record locator>"}
   ```

3. Run the installed publisher in the trusted host's read-only Git object
   checkout containing the exact base and head. Keep PR-controlled code out
   of this process. Set `TRAIN_APP_ID` to the same numeric App ID as the
   train writer and reuse its protected `TRAIN_APP_KEY_FILE` and
   `TRAIN_INSTALLATION_ID`. The publisher mints a fresh repository-scoped
   installation token with pull requests write and contents read. A host
   that already issues such tokens can supply one in `GH_TOKEN` with the
   key variable unset. Configure [protected review changes](controls.md#protect-the-review-policy)
   in the trusted policy. Only when the comparison finds a protected change
   does the coordinator need the owner's explicit chat confirmation for this
   exact revision. Obtain it before publishing PASS and add
   `--owner-message "$message_ref"` to the command. Ordinary PRs skip that step.

   ```bash
   methodology-train publish-review "$policy" "$pr" "$head" "$ready" "$verdict_file"
   ```

   PASS publishes **Approve**. FAIL publishes **Request changes**. The App
   records the independent verdict on its exact commit and reads back the
   latest review, including the actual numeric publisher, commit and state.
   A retry reuses the same current review. A superseded or dismissed verdict
   needs new review evidence. Serialize publication per PR on the trusted
   host. Admission and final publication recheck the base of every
   App-published verdict. A moved base requires fresh review. GitHub
   attests that the App submitted the review. The evidence
   identifies the independent reviewer. An owner message reference records
   the coordinator's observation of chat approval. GitHub does not authenticate
   the human behind a chat message.
   [GitHub review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request)

### Build the isolated verifier

Start from the installed package's `assets/train/verifier/`. Copy it to an
owner-controlled build context. Replace the example executable cases and
`full.list` / `docs.list` with the project's trusted suites and stable IDs,
one per line. Each case returns 0 for pass, 1 for an observed failure, and
another status for a runner incident. A targeted run executes the named cases
from the full list. Only trusted tests run in this image. Vendor dependencies
during the image build and pin the selected base image by digest. Build and
record its immutable ID:

```bash
docker build --network=none --iidfile verifier.id "$verifier_context"
cat verifier.id
```

For the packaged example, configure `postgresImage` to the same pinned
PostgreSQL 18 Debian image named in the Dockerfile. Its test candidate needs
a nonempty `README.md` and `products.csv` with the header `id,price_cents`
and a row `1,125`. The full suite loads those committed CSV bytes through
a real disposable PostgreSQL server and checks its observed query result.
Change the price and verify the stable failing ID `postgres-roundtrip`.
This sample exercises commissioning. Replace its example assertions before
accepting the project's own behavior.

When project tests need a database, the runner starts a fresh, memory-backed
PostgreSQL sidecar per full or targeted attempt and supplies its Unix socket
via `PGHOST`; there is no external network or published port. Use the official
image or a compatible reviewed image with the same entrypoint and postgres
user. If end-to-end checks need to run candidate code, configure a separate
immutable `serviceImage` with a trusted application startup command and
preinstalled offline dependencies. It starts as UID 65534 with the read-only
candidate and disposable database socket. The verifier can probe the service
on loopback in its isolated network namespace. The two processes have
separate container filesystems and PID namespaces. Make the trusted probe
wait for readiness within the run deadline. Prepare any project-specific
database seed from approved data. The runner removes its labeled containers
and test data after diagnosis and reconciles interrupted runs at startup.
Docs checks start only the verifier.

Set `suiteImage` to its local
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
| Overlap and competing writer | Hold an active train while a scheduled or urgent start and an eligible documentation PR arrive. Attempt a branch update as an agent. | The second train records an immediate skip and never starts later. Under rulesets GitHub rejects the agent write. Under private Free, change the disposable target as another writer. The train reports the unexpected tip and holds integration and deployment, including on the next empty-queue run. After reconciliation, the App can process the documentation PR with fresh checks against the approved base. |

Also verify a clean batch with passing tests, fresh approvals, the
expected final ref and PR states, and the test revision when configured.

## Morning report

Use one summary for the configured night window. Keep the facts for each
train in its run record and link to them here.

Read `ownerHolds` for the PR, its exact head and the protected paths that
need a prior decision. A dependant names its prerequisite PR. The run's
`integrated` list and deployment readback identify completed work.
Schedule ordinary integration without interactive chat or a required
GitHub environment reviewer on each run. Obtain any protected decision
before its own PR enters the train. Report missed slots without backfill.

- Window, integration branch and run IDs —
- Decisions awaiting the operator, with owner and required action —
- Integrated PRs, final commit and test deployment readback —
- Returned PRs with reasons, failed tests and run or log locators —
- Flaky tests, defect owners and recurrence blocks —
- Incidents and recovery actions —
- Skipped or missed starts and reasons —
- Remaining queue —

[merge-queue]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
[concurrency]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
[rules]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
[combined]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
[app]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
[merge-recognition]: https://docs.github.com/en/pull-requests/reference/pull-request-merges#indirect-merges
