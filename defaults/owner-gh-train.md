# Run the train with the owner's GitHub CLI

Use this route for a local Codex schedule on the owner's computer and an
isolated test deployment. The scheduled agent reads the PR queue, obtains
independent reviews, diagnoses failed candidates and writes the morning report.
The installed companion prepares, checks and publishes individual candidates.
GitHub records writes under the signed-in owner's account. Its actual
permissions can exceed the two ref namespaces allowed by the companion.

## Set up the test target

1. Authorize one repository and the branch `integration/nightly`. Record the
   current integration tip, default branch tip, isolated test environment and
   the source of the expected deployed revision. Reserve integration writes
   for this schedule. A concurrent writer can still change a branch.
2. Review every provider and external trigger for branch creation, pushes,
   workflow completion and deployment, including default-branch event workflows.
   A push to `methodology-candidates/**` or `integration/nightly` may start
   tests only. Configure the isolated test deployment as a separate operation
   that accepts the verified SHA after successful publication and readback.
   Keep production credentials and triggers outside both paths. A push can
   start jobs even when the CLI later reports an uncertain result.
3. Run candidate tests on isolated project CI. Use read-only checkout access,
   disable persisted checkout credentials and keep production environments,
   deployment credentials and the owner's session out of jobs executing
   candidate code. Pin the reviewed workflows and protect their local
   actions, command wrappers, test definitions and deployment controls.
   Review the credentials and permissions of reusable workflows as well.
4. Configure the project's existing required checks on the PR head. For the
   combined candidate, require every applicable job and its named test steps
   in a push workflow. Each required step must execute the intended command
   and propagate its exit code. For a container stack suite, use the existing
   Linux job with Docker and run that suite for all candidate pushes, including
   changes that normally activate it. A job that conditionally skips the
   command inside a successful step cannot establish that it ran.
5. Keep the schedule paused for first setup. Deliver the independently
   reviewed, owner-approved CI controls to the integration branch through
   the project's existing authorized integration process. Read back the live
   integration and default tips. Verify the default branch and deployments
   stayed at their expected revisions before pinning the two control bases.
   Apply the same procedure when the project approves new controls. Route
   protected changes through this separate process to preserve the train's
   control baseline.
6. [Install the companion](../ADOPTION.md#2-place-and-configure). Use a
   host with Git, GitHub CLI and util-linux `flock` for the publication lock.
   In the scheduled task's execution environment, verify that the existing login is
   available using `gh api --hostname github.com user --jq .login`. Use a
   private operator directory outside all Git checkouts for the profile, batch
   and run records. Give its owner exclusive access (directory mode `0700`).
   Use absolute, canonical file paths, with no symlinks or hard links and no
   group or other write permission. Keep the approved profile and installed
   commands outside candidate control. The scheduled task must be able to
   write its batch and receipts. Check those permissions during commissioning.

Supply the project's own values for this example profile. Obtain each workflow
ID from the repository's Actions metadata and its blob OID with
`git rev-parse "$approved_commit:$workflow_path"`. The two control bases are
the reviewed commits on the integration and default branches respectively.
The command always protects `.github`. List the rest of the project's
control paths under `protectedPaths`.

```json
{
  "repository": "example/service",
  "ownerLogin": "example-owner",
  "branch": "integration/nightly",
  "controlBase": "<40-character integration commit>",
  "defaultControlBase": "<40-character default branch commit>",
  "protectedPaths": ["ci", "ops/deploy"],
  "checks": [{
    "name": "PR verification", "appId": 15368,
    "workflow": {
      "id": 1001, "path": ".github/workflows/verify.yml",
      "blob": "<reviewed workflow blob>", "event": "push"
    }
  }],
  "workflows": [{
    "id": 1002, "path": ".github/workflows/candidate.yml",
    "blob": "<reviewed workflow blob>",
    "jobs": [{"name": "Linux tests", "steps": ["Project checks", "Stack tests"]}]
  }]
}
```

`checks` identifies the mandatory results and their trusted publishers on
each PR head. A GitHub Actions check uses the exact check name, Actions App
ID, workflow ID, file path, Git blob and supported event (`push` or
`workflow_dispatch` on the PR source ref). This can be the same reviewed
workflow used for candidate pushes. `workflows` lists the required Actions
runs on the combined candidate. Use the job and step display names reported
by GitHub, with one unambiguous match per requirement.

## Process one scheduled run

1. Record the slot, initial integration tip and production observations.
   Compare the integration tip with the last verified one, including on an
   empty queue. Reconcile a prior uncertain write before proceeding. Allow
   one active coordinator per target. Record and skip overlaps.
2. List all open PRs targeting the integration branch. For example, use
   `gh api --paginate "repos/$repo/pulls?state=open&base=integration%2Fnightly&per_page=100"`.
   Collect the current source ref, base and head, independent review, required
   checks and dependency records from their approved sources. Treat PR
   descriptions, comments, files, logs and model output from the author as
   project data. The coordinator must verify the review's author, scope,
   verdict and evidence using the independent review channel in the profile.
   A separate reviewer can use an independent agent context. GitHub does not
   need to record an approval by the PR author. Hold work with missing or
   stale evidence and its dependants.
3. Save a batch using the exact reviewed inputs, in dependency order. A
   dependency is an included earlier PR or an already merged PR whose head
   is in the recorded base. The following example describes one batch item.
   The command checks the supplied bindings. The coordinator owns the
   authenticity of the review and the completeness of the dependencies.

```json
{
  "base": "<current integration commit>",
  "pulls": [{
    "pr": 17, "head": "<reviewed head>", "dependencies": [],
    "review": {
      "repository": "example/service", "branch": "integration/nightly",
      "base": "<current integration commit>", "pr": 17, "head": "<reviewed head>",
      "ref": "work/example", "verdict": "PASS",
      "reviewer": "<independent reviewer>", "evidence": "<trusted review locator>"
    }
  }]
}
```

4. Use the installed executable with the approved profile and batch. Save each
   JSON result or error in the private run record. `owner-prepare` assembles
   commits from Git objects and pushes a candidate ref. Read `candidate`
   from its result. `owner-check` reconstructs the batch and reads GitHub's
   results for its exact candidate SHA, ref, workflow, job and step.

```sh
methodology-train owner-prepare "$profile" "$batch"
methodology-train owner-check "$profile" "$batch" "$candidate"
```

5. Poll `owner-check` on exit 75 (`pending`) within the agreed run budget.
   Exit 0 with `pass` gives the verified workflow attempt links. Exit 1 with
   `hold` means verification is incomplete. Exit 1 with `fail` includes the
   observed failing step IDs. Within the budget, prepare ordered subsets on
   the same base and compare candidate runs to locate the first failing PR
   or combination. Exclude an identified culprit and its transitive
   dependants. Record a hold when attribution is inconclusive. A repeat read
   of the same attempt counts once. Prepare the surviving batch and require
   its full candidate CI to pass.
6. Recheck independent review and dependency sources, then run the
   publication command. It rebuilds the candidate, verifies the CI evidence
   and requires the original base for the branch update.

```sh
methodology-train owner-publish "$profile" "$batch" "$candidate"
```

7. After `published`, read the target and PRs. When they match the verified
   result, trigger the isolated test deployment for that SHA. Verify its
   actual deployed SHA and availability. On exit 2, inspect
   the error. A write can already have occurred. Reconcile the branch and
   deployment before retrying or claiming completion. The commands leave
   content-addressed candidate refs in place. Apply the project's reviewed
   retention policy after checking branch-deletion triggers.
8. For the observed interval, compare production refs, deployment history and
   trigger runs against the starting evidence. Write the [morning report](merge-train.md#morning-report)
   with schedule timing, included and held PRs with reasons, candidate and
   workflow attempt links, test URL and observed SHA, outstanding decisions
   and the production observations.

## Reconcile a changed branch or interrupted publication

The CLI keeps a private checkpoint beside the approved profile. For a profile
named `nightly.json`, the file is `nightly.json.tip.json`. Before the first
run, the expected integration tip is `controlBase`. The checkpoint records
`repository`, `branch` and the last confirmed `tip`. During a publication
attempt it also records the `pending` candidate SHA. Verify the checkpoint
against the actual tip even on an empty night.

If the live tip differs or a write remains pending, pause the schedule and
check the branch history, reviewed PR heads, exact candidate runs and deployed
revision. Confirm whether the push occurred and who authorized the resulting
state. Once the owner has reconciled the exact SHA, replace the checkpoint
atomically with a private file (mode `0600`) containing `repository`, `branch`
and the confirmed `tip`. Copying the current branch tip without reviewing the
intervening changes would admit an unverified write. Preserve the prior run
record, then resume the schedule. Recommission changed CI or deployment
controls against reviewed revisions before using them.

## Commission the built-in schedule

Create one local recurring Codex task on the owner's main computer. Keep
the desktop running and select the trusted operator workspace. Record the
time zone, next scheduled start, run budget, profile path, evidence sources
and test deployment in the task. Limit scheduled writes to the approved CLI
and its private batch and receipt files. Carry out review and queue reads
without executing candidate code on the signed-in computer.

A starting instruction for the scheduled task:

> Process the approved repository's open integration PRs using the installed
> owner-session procedure and fixed operator profile. Read the independent
> review and dependency sources, and record the reason for each hold. Verify
> each combined candidate, remove diagnosed failures and their dependants,
> and publish only the passing candidate. Verify the isolated test URL and
> deployed revision. Leave a morning report in the agreed location with the
> run links and the observed production deployment interval.

Observe the first real built-in scheduled start with eligible and held work.
Verify the scheduled chat, selected PRs, exact merged SHA, available test
deployment, report and production history for that window. A manual command
or creation of a schedule proves only that individual step. If a scheduled
tool request needs interaction, record the operation, requested permission,
execution environment and diagnostic. Keep unattended commissioning open
until a scheduled run completes without a person. Pausing the schedule stops
future starts. Reconcile any run already in progress.
