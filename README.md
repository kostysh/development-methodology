# Portable development methodology prototype

Version: **0.4**. Status: **prototype for adaptation**. Date: 2026-11-12.

This package describes how people and AI agents carry development from the
initial request to a verified result, integration, operation, and process
improvement. It is intended for the project owner, the technical lead, the
executor, and the reviewer. Technology, team size, and domain are not fixed.

It contains only the methodology and blank templates. There is no application,
no requirements, contracts, tasks, data, mockups, configuration, migrations,
CI code, or copies of files from the originating project. The formats of PRDs,
SPECs, decisions, plans, and review reports are defined by
[agent skills](method/15-skills.md); the methodology defines when these
documents are needed, what kind they are, and how they are accepted.

## Where to start

1. Read the [adoption guide](ADOPTION.md) and the [work routes](WORKFLOW.md).
2. Fill in a copy of the [project profile](PROJECT-PROFILE.md).
3. Install the [skills](defaults/skills.md) and record them in the profile.
4. Confirm the [documentation scheme](defaults/documentation.md)
   or set the differences in the profile.
5. Connect navigation for people and agents from the [templates](templates/README.md).
6. Agree the profile with the project owner.
7. Run a small real task along the accepted route and verify the result.

The presence of these files does not mean that the process has been adopted,
configured, or proven effective. The profile in this prototype is deliberately
left blank. It creates no new authority to publish, access data, or run agents.

## Methodology levels

| Level | Question | Rule owner |
| --- | --- | --- |
| Governance | Who decides, where does a requirement come from, and what is permitted? | [Sources and authority](method/01-authority-and-scope.md) |
| Product and system | How is a request turned into agreed requirements and decisions? | [Lifecycle](method/02-lifecycle.md) |
| Plan | How is a sufficient solution chosen and stage boundaries kept? | [Planning](method/03-planning.md) |
| Delivery | How are tasks, dependencies, acceptance, and completion linked? | [Tasks](method/04-task-management.md) |
| Implementation | How are contracts, simplicity, and managed dependencies preserved? | [Engineering discipline](method/05-implementation.md) |
| Quality | What proves the result, and where does the proof end? | [Verification and review](method/06-verification.md) |
| Integration | How is a verified candidate tied to the final repository state? | [Git and CI/CD](method/07-integration.md) |
| Operations | How are environments, access, resources, and recovery managed? | [Environments](method/08-environments-and-operations.md) |
| Data | How is a schema changed while existing records are preserved? | [Migrations](method/09-data-and-migrations.md) |
| Protection | How are permissions, secrets, personal data, and external effects verified? | [Security and privacy](method/10-security-and-privacy.md) |
| Interface | How are requirements, design, text, and a working scenario linked? | [UI and design](method/11-ui-and-design.md) |
| Teamwork | How is work delegated, independence preserved, and context recovered? | [Agents and coordination](method/12-agents.md) |
| Knowledge | Which document does a stage produce, where is it stored, how is it accepted, and when is it updated? | [Documentation and communication](method/13-artifacts-and-communication.md) |
| Learning | How are failures corrected and the benefit of a process change verified? | [Diagnostics and improvement](method/14-learning-and-recovery.md) |
| Tools | Which skills to use at a stage, and how to install and update them? | [Agent skills](method/15-skills.md) |

Work route:

```text
Request and authority → accepted requirements → necessary architecture decisions
→ delivery plan and specification → implementation → verification and review
→ authorized integration → applicable acceptance → reconciliation and closure
```

Stages are switched on per task. A short reversible correction does not need
the full set of documents. Verification of a protected boundary is required
regardless of the number of changed lines.

## How to read the requirements

- **Core** — general principles of sources, authority, proportionality, and evidence.
- **Conditional section** — applies when a named trigger is present: UI,
  migrations, external integration, money, sensitive data, or release.
- **Default** — a concrete choice from [defaults/](defaults/): documentation
  layout, ID scheme, skill set, and their install commands. It applies until
  the profile says otherwise; replacing it does not require changing chapters.
- **Profile** — the concrete owners, tools, commands, languages, and constraints
  of the new project. Values from the originating project are not carried over.
- **Template** — a blank for an existing working document. Fill in the needed
  fields; do not create a separate file for every table.

Once the methodology is adopted, "must", "required", and "must not" apply only
to the applicable section and the accepted profile. An exception requires an
owner, a basis, a boundary, and a review condition. An empty field is not a
permission and does not count as `not_applicable`.

A project may complete a task with a document, a study, or a verified
decision if that is exactly what was assigned. Such a result does not confirm
that the product works. Delivering a feature requires observable behavior and
evidence at the stated boundary.

## Contents

| File | Purpose |
| --- | --- |
| [ADOPTION.md](ADOPTION.md) | Adoption procedure, completion criteria, and methodology updates |
| [PROJECT-PROFILE.md](PROJECT-PROFILE.md) | Blank project profile: owners, authority, checks, documentation, skills |
| [WORKFLOW.md](WORKFLOW.md) | Three step-by-step routes: small change, feature, document |
| [method/](method/) | Chapters 01–15: canonical rules |
| [defaults/](defaults/) | Defaults: [documentation](defaults/documentation.md), [skills](defaults/skills.md) |
| [templates/](templates/README.md) | Blank forms and entry-point templates |
| [GLOSSARY.md](GLOSSARY.md) | Terms |
| [CHANGELOG.md](CHANGELOG.md) | Version history and actions on update |
| [AGENTS.md](AGENTS.md) | Rules for maintaining this package |
