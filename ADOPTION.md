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

From the primary checkout, use an operator shell with Node.js 24.12–24.x on Linux, npm, Git, GitHub CLI (including `gh attestation verify`) and GNU coreutils. Choose a durable `METHODOLOGY_RELEASES` path outside agent-writable roots or use the project-specific default below. The installer places the [5.0.2 release](https://github.com/kostysh/development-methodology/releases/tag/methodology-v5.0.2) in a fresh version directory. Use your existing project instructions and filled profile in their current locations. For a first installation, copy the blank profile to a new project-owned file outside the release directory.

```sh
(
  set -eu
  project=$(git rev-parse --show-toplevel)
  root=${METHODOLOGY_RELEASES:-"${XDG_DATA_HOME:-$HOME/.local/share}/development-methodology/$(basename "$project")/releases"}
  case "$root" in /*) ;; *) echo "Choose an absolute release path" >&2; exit 1 ;; esac
  version=5.0.2
  tag="methodology-v$version"
  repo=kostysh/development-methodology
  dest="$root/$version"
  mkdir -p -- "$root"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "Release path already exists: $dest. Verify the existing installation or choose a fresh path." >&2
    exit 1
  fi
  stage=$(mktemp -d -- "$root/.stage-$version-XXXXXXXX")
  mkdir -- "$stage/download" "$stage/guide" "$stage/tools"
  gh release download "$tag" --repo "$repo" --dir "$stage/download"
  (
    cd "$stage/download"
    gh attestation verify SHA256SUMS --repo "$repo" --source-ref "refs/tags/$tag" \
      --signer-workflow "$repo/.github/workflows/methodology-tools.yml"
    sha256sum --strict --check SHA256SUMS
  )
  tar -xzf "$stage/download/methodology-guide-$version.tar.gz" -C "$stage/guide"
  npm install --prefix "$stage/tools" --offline --ignore-scripts --omit=dev --no-audit --no-fund \
    "$stage/download/kostysh-development-methodology-tools-$version.tgz"
  "$stage/tools/node_modules/.bin/methodology-check-links" "$stage/guide"
  test "$("$stage/tools/node_modules/.bin/methodology-metrics" --version)" = "$version"
  mv -Tn -- "$stage" "$dest"
  test ! -e "$stage" || { echo "Destination was claimed; staged copy retained at $stage" >&2; exit 1; }
  printf 'Installed in %s\n' "$dest"
)
```

The printed installation directory contains `guide/` and `tools/node_modules/.bin/`. Use the absolute bin path in the launch environment of the selected clients and trusted runners. If another OS account runs a client, select a release location readable by its existing group. Record the version and verified source commit in the project profile. A failed stage leaves the active configuration intact. Review a leftover `.stage-*` directory before discarding it.

GitHub CLI needs a writable cache to verify the attestation. In a shell
with a read-only home, set `XDG_CACHE_HOME` to an operator-owned writable
directory before running the installer.

Fill in the project-owned copy of the [profile](PROJECT-PROFILE.md). Name the owner and basis for each material choice. Verify the project's real commands and record any missing check.

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

Keep the existing instructions and project-owned profile. Set
`{{PROJECT_PROFILE_PATH}}` to the relative link destination of that profile
from each entry point. For a new profile copied from the blank template,
adjust its links to the guide from the profile's actual location.

Choose how collaborators will reach the guide:

- **Pinned links.** Set `{{METHOD_PATH}}` to
  `https://github.com/kostysh/development-methodology/blob/<release-tag>`
  using the exact installed tag. This requires network access to follow the
  links. Open each changed tag link and verify the target file and any
  section anchor. The local link checker does not follow URLs.
- **Offline links.** Copy the verified guide from [step 2](#2-place-and-configure)
  into a fresh, versioned directory in the project. Share it with collaborators
  who need offline access. Set `{{METHOD_PATH}}` relative to each entry point.
  Leave the existing guide and filled profile in place.

For the offline copy, set `release` to the absolute installation directory
printed in step 2. Run from the project's primary checkout:

```sh
(
  set -eu
  release='/absolute/path/to/the/installed/version'
  guide="$release/guide"
  test -f "$guide/README.md"
  if [ -e "$guide/AGENTS.md" ] || [ -L "$guide/AGENTS.md" ]; then
    echo "Use the installed guide; this source includes maintainer instructions." >&2
    exit 1
  fi
  docs="$(git rev-parse --show-toplevel)/docs"
  dest="$docs/methodology-v$(basename -- "$release")"
  mkdir -p -- "$docs"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "Guide path already exists: $dest" >&2
    exit 1
  fi
  stage=$(mktemp -d -- "$docs/.methodology-XXXXXXXX")
  cp -R -- "$guide/." "$stage/"
  "$release/tools/node_modules/.bin/methodology-check-links" "$stage"
  mv -Tn -- "$stage" "$dest"
  test ! -e "$stage" || { echo "Guide path was claimed; staged copy retained at $stage" >&2; exit 1; }
  printf 'Guide copied to %s\n' "$dest"
)
```

The copy includes the release's blank profile as reference material. Link
project instructions to the filled profile. If a copy fails, inspect its
staging directory before removing it. If the destination exists, verify it
against the installed guide or choose a fresh versioned path.

Replace every `{{...}}` with a verified value. Run the
[documentation check](defaults/documentation.md#verify-links-and-anchors)
in the adopting checkout after merging the entry points. Follow the rendered
links from each entry point to confirm the guide, project-owned profile, and
any section anchors resolve as intended.

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

Set up the task coordinator once. For each task run `methodology-task begin`
with its worktree and assigned session IDs, perform an action in each
selected client, and verify that begin reports the callbacks. At the end,
run `methodology-task finish`. These commands register and remove the hooks
and import the workspace observations into the private journal. Add
`--recovery` at project setup if the project uses it. Verify trust in the
actual client, run one wrapped test and reconcile its recorded exit and the
first task summary with the chronology. [Task commands](defaults/process-metrics.md#begin-and-finish-a-task)
· [Client trust and diagnostics](defaults/process-metrics.md#connect-a-native-client)

Record the [integration route](method/07-integration.md#merge-train) in the [profile](PROJECT-PROFILE.md#merge-train). If the project selects the train, [commission it](#commission-the-merge-train).

Choose the `solo` or `team` role owners. In `solo`, act on choices the owner has already delegated. Ask for the owner's choice in the project conversation when one is needed. Give the alternatives and their consequences, then record the answer and its message reference. A local note cannot authorize a merge. Use the project's existing independent PR approval or protected check when publication requires one. [Solo decisions](defaults/solo-decisions.md)
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

Set the target branch, writer App, independent reviewer and trusted fast
checks. A single GitHub user can author all PRs through their usual
`gh`. The coordinator can publish the independent verdict through the
existing App. Exercise the seven train cases on a disposable target.
Then observe an actual scheduled start with the operator offline. Verify
the accepted branch and test deployment, the PRs held for a decision, and
the morning report. Record the enabled schedule and its owner in the
profile. [Train setup and commissioning](defaults/merge-train.md)
· [Operational metrics](defaults/process-metrics.md#train-observations)

## Adoption is complete when

- [ ] The profile is accepted by the owner; `unknown` fields are resolved or
      restrict only the named actions.
- [ ] The skill set is installed, the agent sees it in a new session, and the
      profile contains the release tag and replacements.
- [ ] The documentation scheme is confirmed; the accepting owners and the
      locations of living documentation are named.
- [ ] The root `AGENTS.md`, `CONTRIBUTING.md`, and, if needed, `PLANS.md`
      link to the methodology; no `{{...}}` remain in them.
- [ ] Local links and anchors from entry points work, including the link to
      the project-owned profile. Guide links work from the shared offline copy
      or have been opened and verified at the pinned release tag.
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

Read the [changelog](CHANGELOG.md). Install the new version alongside the old one using [step 2](#2-place-and-configure). Compare the new guide and blank profile with your previous release, then merge applicable fields into your existing filled profile and retain project-specific chapters and entry points. For example, run `diff -ru -- "$old_release/guide" "$new_release/guide"` with the two recorded paths. Exit 1 reports differences. Switch client and runner paths only after the new installation passes the selected project checks. Keep the prior paths and profile for rollback.

### Roll back a release

1. If a train is active, pause its dispatcher, keep the target protected
   and reconcile its last write and deployment. Preserve any journal and
   decision ledger with their profile and access permissions.
2. Remove each hook added by the new release while its executable is
   available. For metrics use `methodology-metrics uninstall-hooks PROFILE SOURCE`.
   For recovery use `methodology-recovery uninstall-hook PROFILE --client CLIENT`.
   Compare the affected settings with the saved working copy.
3. Switch the paths you changed back to the previous installation. Restore
   any changed profile, skill, lockfile or CI configuration from the saved
   copy. Verify a clean check succeeds and the same known violation fails.
   If a skill changed, verify it in a fresh session.
4. If collection was active on the earlier release, observe a positive
   hook record. Before restarting a train, verify its branch protection,
   writer and deployed revision. Record the results for the components used.
