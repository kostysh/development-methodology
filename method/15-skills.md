# Agent skills

A skill is a package of instructions, references, and templates that an agent
loads for a particular kind of work. The methodology uses skills as the
owners of the form of stage artifacts. The default set, install commands, and
templates are in the [defaults](../defaults/skills.md); the actual set,
version, and installation method are in the [profile](../PROJECT-PROFILE.md#skills).

A skill provides a method and the form of a result. It grants no authority,
does not replace a mandatory gate, and does not make a result accepted.

## Steps

1. During adoption, choose the set, obtain the owner's permission to install,
   and install the skills into the project directory.
2. Verify in a new session that the agent sees the skills; record the set and
   version in the profile.
3. In the work, choose a skill by the stage and the aspect of the task, read
   its `SKILL.md`, and apply it within the permitted boundary.
4. Name the skill used in the handoff.
5. Update skills as a tool: with a review of the changes and a record of the version.

## Ownership split

| Question | Owner |
| --- | --- |
| Content structure of an artifact: sections of a PRD, SPEC, decision, plan, review report | The skill and its templates |
| Subject-matter checks within the work: PRD completeness, SPEC falsifiability, review findings | The skill |
| Whether an artifact is needed, its kind, location, ID, metadata, language, statuses, and acceptance | [Documentation and artifacts](13-artifacts-and-communication.md) and the profile |
| Authority, mandatory gates, review route, conditions for Done | The methodology and the profile |

Before creating a persistent artifact, the skills of the default set look for
the project's rules on location, IDs, metadata, links to sources, and
indexes. If rules exist, the skill follows them; if not, it uses its own
values. Therefore the profile section "Documentation and artifacts" is filled
in before the first persistent artifact.

If a skill's vocabulary differs from the project's, for example in document
statuses, the record follows the project's vocabulary. The mapping is set in
the profile once. An irresolvable conflict between a skill and the
methodology is recorded and passed to the methodology owner; the executor
does not choose the convenient reading.

The methodology does not copy skill templates, so that the form has one owner.

## Installation

Installation changes the agent's configuration and is done with the project
owner's permission, only into the permitted location. Installation into the
project directory is preferred: all participants have one set and one version.

Installation counts as done when, in a new session, the agent sees the
required skills and loads at least one of them on direct request. Files on
disk do not prove this. The profile records the method, location, version,
set, and date of the check. For a stage without a skill, the profile names
the replacement.

## Updating

Updating a skill is a change of tool. Before updating, review the release's
changes and their effect on compliance with the project's rules. Local
changes to a skill are not deleted for the sake of a successful update. A
task in progress continues on the previous version or explicitly switches to
the new one, stating which of its results are being revisited. The new
version is recorded in the profile.

## Use in the work

A skill is chosen by the aspect of the work, not by the name of a role. The
agent reads the current `SKILL.md`, applies it within the permitted boundary,
and states in the handoff which skill was used. The availability of a skill
does not require a separate agent or an additional audit ([agents](12-agents.md)).

A review skill provides evidence only for its own subject and the area it
read. Its PASS does not replace mandatory checks of another subject, runtime
acceptance, or the owner's decision. Review independence is ensured by a
separate executor without the author's history, not by the name of the skill.

## Working without skills

The methodology does not depend on a specific agent. A team of people or an
agent without skill support performs the same roles. The minimal content of
each output is set in the [lifecycle](02-lifecycle.md). Skill templates can be
read in their repository as ordinary Markdown files. A replacement of a skill
is recorded in the profile; the mandatory result of the role is preserved
when it is replaced.
