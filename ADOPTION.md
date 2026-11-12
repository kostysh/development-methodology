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

Copy this package into the chosen methodology folder. The recommended path is
`docs/development-methodology/`; another path is acceptable if navigation is
updated. Record the package version from the [README](README.md) in the profile.

Fill in the [profile](PROJECT-PROFILE.md). Every material choice must have an
owner and a basis. Use real, existing commands and verify their semantics,
environment, and side effects. If a command does not exist, record the gap;
an invented command does not become a working control.

Decide the applicability of every section. A conditional section may be
switched off only with an explanation, for example "no persistent storage,
migrations do not apply". Do not switch off permission checks just because a
change is called small.

## 3. Install skills

Choose the set from the [defaults](defaults/skills.md#sets): the base set plus
the conditional sets the profile needs and the stack skills. Obtain the
owner's permission to install and choose the location: the project directory
(recommended) or the agent's global directory.

Install [via the CLI or by cloning](defaults/skills.md#installation-via-cli)
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

Choose the `solo` or `team` mode and name the role owners
([team composition](method/12-agents.md#team-composition)).
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
10. Records, for the trial task, the values of the [metrics from the profile](PROJECT-PROFILE.md#process-metrics).
    They become the baseline for later comparison.

Separately work through a negative case: a missing mandatory result, unclear
access, a wrong record in an end-to-end test, or a lost response from an
external operation. The process must forbid false success and give a concrete
way to continue. This is a check of how the rules are applied; it does not
require deliberately damaging the system.

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
- [ ] The trial task is completed, including the negative case; baseline
      metrics are recorded.
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
