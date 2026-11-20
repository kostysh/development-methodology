# Adopting the methodology in a new project

Goal: obtain a working process for a specific project while keeping only the
rigor it needs. The result of adoption is an accepted profile, available
navigation, installed skills, and a verified trial task. Copying the directory
does not achieve this by itself.

## 1. Establish the starting conditions

Read the project's current instructions, the owner's constraints, the sources
of requirements, the repository structure, and the checks that already exist.
Name the type of result: product, library, CLI, service, research, or
documentation. Record the users, the decision owners, and the boundary of the
intended delivery.

If a process already exists, first make a short list of matches, gaps, and
conflicts. Keep its current owners. Do not replace the existing `AGENTS.md`,
`CONTRIBUTING.md`, or release rules wholesale.

## 2. Place and configure

Install the guide and companion from the named [v5 release](https://github.com/kostysh/development-methodology/releases/tag/methodology-v5.0.0). Run the following in a clean project directory on Linux with Node.js 24.12–24.x, npm, Git, the GitHub CLI and GNU coreutils. For an update, stage these paths next to the existing installation and keep its hooks and profile until the replacement passes. Select a project-owned path for persistent executables outside disposable task worktrees.

```sh
release_dir="$PWD/.methodology/releases/5.0.0"
tools_dir="$PWD/.methodology/tools/5.0.0"
guide_dir="$PWD/docs/development-methodology"
mkdir -p "$release_dir" "$tools_dir" "$guide_dir"
gh release download methodology-v5.0.0 --repo kostysh/development-methodology --dir "$release_dir"
(cd "$release_dir" && sha256sum --check SHA256SUMS)
tar -xzf "$release_dir/methodology-guide-5.0.0.tar.gz" -C "$guide_dir"
npm install --prefix "$tools_dir" --offline --ignore-scripts --omit=dev --no-audit --no-fund "$release_dir/kostysh-development-methodology-tools-5.0.0.tgz"
export PATH="$tools_dir/node_modules/.bin:$PATH"
methodology-metrics --version
methodology-check-links "$guide_dir"
```

Stop on a failed command. Record the verified SHA-256, source commit and installed version in the profile. Keep the download directory and the preceding release for rollback. Add the executable directory to the verified runner configuration. Native hooks record an absolute installed command path.

Fill in the [profile](PROJECT-PROFILE.md). Every material choice must have an
owner and a basis. Use real, existing commands and verify their semantics,
environment, and side effects. If a command does not exist, record the gap;
an invented command does not become a working control.

Choose applicable checks from the [control register](defaults/controls.md).
Record the trusted package version, command, owner and enforcing boundary in
the profile. Verify the installed check on a clean input and a known
violation before transferring its rule out of manual review.

For the protected test baseline, name the independent test author, test
owner, and hook and CI owners. Set up and exercise the
[default procedure](defaults/controls.md#protect-a-test-baseline). Record
the activated scope in the [profile](PROJECT-PROFILE.md#tools-and-checks).
While a boundary is unverified or unavailable before adoption, keep the
existing test and conformance review route in that scope. Once the integrity
check is required, a failed or missing result holds integration. Diagnose
the failure and restore the verified control before retrying.

Decide the applicability of every section. A conditional section may be
switched off only with an explanation, for example "no persistent storage,
migrations do not apply". Do not switch off permission checks just because a
change is called small.

## 3. Install skills

Choose the set from the [defaults](defaults/skills.md#sets): the base set plus
the conditional sets the profile needs and the stack skills. Obtain the
owner's permission to install and choose the location: the project directory
(recommended) or the agent's global directory.

Install the approved [versioned v5 skill archives](defaults/skills.md#install-the-v5-release)
following the [rules of chapter 15](method/15-skills.md#installation).
Verify in a new session that the agent sees and loads the skills. Record the
method, location, release tag, and set in the [profile](PROJECT-PROFILE.md#skills).
For a stage without a skill, name the replacement: a person, another tool, or
manually following the template from the skills repository.

## 4. Choose the depth

| Situation | Minimum sufficient application |
| --- | --- |
| Small reversible correction | Assignment, result boundary, sources, isolation of changes, narrow check, mandatory repository gates, final report. |
| Several components or material regression risk | In addition: a ready contract, dependencies, a verification plan, and the necessary independent reviews. |
| Public contracts, permissions, money, migrations, irreversible effects | In addition: accepted decisions, negative scenarios before code, recovery, verification of real boundaries and of the target environment. |
| Research or documentation | Sources, completeness within the stated area, conclusions, and fitness of the result are verified. Runtime/deploy gates are added only when a corresponding claim is made. |

Do not turn the table into three rigid process sizes. Independent risk
triggers can strengthen the route. The general principle comes from
[sources and authority](method/01-authority-and-scope.md).

## 5. Connect the instructions

Use the [templates](templates/README.md) to extend the project's entry points:

- `AGENTS.md` — short triggers, links to rule owners, and the skills per stage;
- `CONTRIBUTING.md` — real commands, Git policy, and quality gates;
- `PLANS.md` — activation of formal planning and a link to its contract;
- local `AGENTS.md` files of documentation areas and packages — differences only.

Templates do not replace existing requirements. After transferring them,
replace every `{{...}}` with verified values and fix links relative to the
file's location.

## 6. Configure documentation

Fill in the profile section ["Documentation and artifacts"](PROJECT-PROFILE.md#documentation-and-artifacts):
confirm the [defaults](defaults/documentation.md) or record the differences,
switch on the extended-set types you need, and name the owners who accept
documents and the locations of living documentation.

**New project.** Do not create empty PRDs, SPECs, ADRs, or directories for
the sake of structure. The first documents emerge from the first real work,
usually in this order:

1. Primary materials — in baseline or inputs, with a register.
2. PRD — once the product is formulated.
3. Architecture brief — when system boundaries and the stack are chosen.
4. Delivery plan — when the work is split into slices and tasks.
5. SPEC — for an area of behavior where the executor would otherwise have to
   invent the behavior.

**Existing project.** Map the existing documents to the classes in the
profile and determine their kind: description of the current state or record.
Mass renaming and relocation are not needed. New documents follow the accepted
scheme; old ones receive an ID and metadata when they are materially changed.

## 7. Accept the profile

Before enabling a collector, establish the project's own process baseline.
Select comparable completed tasks and a cutoff. With the data owner's
permission, match their task records, local logs, Git revisions and CI attempts.
Record the time window, number of tasks, sources and gaps in the
[profile](PROJECT-PROFILE.md#process-metrics). Use the recorded execution
start and acceptance for lead time. Keep card-to-merge and PR-to-merge as
separate measures when those are the only timestamps available.

Count an operator wait only while an explicit request blocks work. Take the
union of overlapping intervals within each activity and report uncovered time
as unexplained. Record missing history as unknown. A project starting without
comparable history can use its first trial as the first observation.

For each agent client selected in the profile, authorize the named task and
sources and [install its native hooks](defaults/process-metrics.md#connect-a-native-client).
Bind the session, perform an actual tool action and compact context. Verify the
task journal gained both observations. Repeat delivery and check that the
counts stay unchanged. A different session must leave the journal unchanged.
Connect the [operation sources](defaults/process-metrics.md#record-at-the-operation),
including Git, GitHub, CI, audit and task events where selected. Reconcile
the first report with the actual chronology. Mature seven-day histories
supply the quality rate. Missing history affects that measure only.

Record the owner's [integration route](method/07-integration.md#merge-train)
in the [profile](PROJECT-PROFILE.md#merge-train). When the train is selected,
[commission the installed command](#commission-the-merge-train) on the target.

Choose the `solo` or `team` mode and name the role owners
([team composition](method/12-agents.md#team-composition)).
For a solo project, select each delegated class and its pending merge rule,
set the cap and exercise [a confirmation and a reversal](defaults/solo-decisions.md).
The project owner confirms the chosen route, mandatory checks, authority,
exceptions, document scheme, skill set, and stop conditions. The acceptance
record may live in the profile or in an existing decision. If the current
task already explicitly authorizes the exact choice, keep that basis without
asking again.

Before acceptance the profile has the status `draft`. Studying documents and
safe preparation continue; dependent actions for which permissions or
mandatory checks are unknown are not performed. A template grants no standing
permission for an external service, mass mailing, production, or reading secrets.

## 8. Verify on one task

Choose a small real change with a clear result. Take it from the assignment to
the intended completion. Verify that the executor:

1. Finds the source and the next step without consulting the originating project.
2. Distinguishes a safe technical choice from a decision of the requirements owner.
3. Chooses the stage's skill and names it in the handoff.
4. Creates a persistent artifact only under the persistence rules, in the right
   place, with an ID, metadata, and the status `draft`; leaves acceptance to the owner.
5. Updates living documentation or explicitly notes that it is not affected.
6. Obtains a verifiable result, not just filled-in documents.
7. Runs the real applicable commands and records their outcome.
8. Confirms the final refs, environment, and statuses if they are part of the task.
9. Preserves other people's state and finishes its own resources.
10. Records the trial's [process metrics](PROJECT-PROFILE.md#process-metrics)
    using the same definitions as the baseline, with any gaps identified.

Separately work through a negative case: a missing mandatory result, unclear
access, a wrong record in an end-to-end test, or a lost response from an
external operation. The process must forbid false success and give a concrete
way to continue. This is a check of how the rules are applied; it does not
require deliberately damaging the system.

To adopt the protected test baseline, also pilot it on a medium-risk
behavior change. Trace each new baseline test from its criterion through
the intended pre-change failure to the passing implementation. Walk a
[dispute](method/06-verification.md#protected-test-baseline) and continue
independent work while the owners resolve it. Verify the hook and required
CI using the [control cases](defaults/controls.md#protect-a-test-baseline).
Record time to acceptance, dispute count, and verification outcomes for
comparison with comparable earlier tasks. Record any missing baseline or
inconclusive comparison.

For agent tasks, configure [task recovery](defaults/task-recovery.md).
Exercise a compaction, an interrupted session and a long run. Verify that
the agent reconciles the current revision and reads the saved outcome.
Keep the checkpoint report in the task or PR for its reader.

<a id="pilot-the-merge-train"></a>

### Commission the merge train

When the owner selects the train, install the released command and
verifies the [branch and runner controls](defaults/merge-train.md#github-setup),
the [audit closure](method/06-verification.md#closing-review-findings), and
the [protected test baseline](method/06-verification.md#protected-test-baseline)
where applicable. Run the [seven cases](defaults/merge-train.md#dry-run-cases)
in a disposable setup. Run the target configuration in dry mode and compare
the report with the expected admissions and exclusions. Enable live integration after the operator
accepts the evidence, verifies the sole writer in the target repository,
and approves the switch. Until then use the ordinary integration queue.
After activation, hold integration when a required control is unavailable.
Restore it or use a separately approved route that preserves protection and
mandatory checks.

Before relying on the [collector's train observations](defaults/process-metrics.md#train-observations), verify queue wait, exclusions by cause,
flaky tests, full-suite runs per train, train duration, and skipped starts
against the train's recorded facts. Measure queue wait from admission to
selection. Count a retry of an entire suite as a full run and record
targeted reruns separately. Compare time to acceptance and CI runs
per task with comparable baseline tasks and track verification outcomes.
Record missing coverage or an inconclusive comparison.

## Adoption is complete when

- [ ] The profile is accepted by the owner; `unknown` fields are resolved or
      restrict only the named actions.
- [ ] The skill set is installed, the agent sees it in a new session, and the
      profile contains the release tag and replacements.
- [ ] The documentation scheme is confirmed; the accepting owners and the
      locations of living documentation are named.
- [ ] The root `AGENTS.md`, `CONTRIBUTING.md`, and, if needed, `PLANS.md`
      link to the methodology; no `{{...}}` remain in them.
- [ ] Relative links from entry points to the methodology and documents work.
- [ ] The trial task and negative case are complete. The profile identifies
      the historical baseline or first observation and its evidence limits.
- [ ] An owner for maintaining the methodology and the next review event are assigned.

These checkmarks confirm adoption, not the effectiveness of the process.

## 9. Maintain

Fix the rule's owner and the related links. For a material change, keep the
reason, the acceptance, and the affected obligations. For a task already in
progress, state explicitly which new rules apply to it.

After several comparable tasks, assess delays, rework, escaped defects, and
coordination cost. Simplify a step that does not prevent an established
failure. Do not claim a speed-up based on the number of documents or green
checks. The measurement method is in the
[improvement section](method/14-learning-and-recovery.md).

## Updating the methodology

The project keeps its own copy of the package. A new version is not applied
automatically.

1. Read the [CHANGELOG](CHANGELOG.md) between the version in the profile and
   the new one.
2. Compare the new version with the local copy. Local differences should live
   in the profile or in local `AGENTS.md` files; identify edits inside the
   `method/` chapters and decide on them separately: move them to the profile,
   propose them to the shared package, or keep them as a deliberate deviation.
3. Transfer the changes to chapters and templates. Do not overwrite the profile
   and the filled-in entry points: add only new fields and links to them.
4. Update the skills if the new version relies on them.
5. The methodology owner accepts the update; the new version is recorded in
   the profile. For tasks in progress, state which new rules apply to them.

### Roll back a release

1. Pause the train dispatcher and reconcile its last write and deployment.
   Keep the target protected. Retain the current task journal and decision
   ledger with their profile and owning data permissions.
2. With the new executable still installed, run
   `methodology-metrics uninstall-hooks PROFILE SOURCE` for each changed
   native source. Compare the resulting settings to the saved working copy.
   Restore only project-owned entries, including the former recovery command.
3. Switch executable paths, trusted CI configuration and versioned skill
   directories back to the recorded release. Restore its local lockfile and
   the prior profile. Verify the previous skill is discoverable in a new
   session, a clean check succeeds and the same known violation is blocked.
4. If collection was enabled previously, verify a positive record using the
   earlier hook. Read back protection, writer and deployed revision before
   resuming integration. Record the observed results.
