# Application templates

These are blank forms of the methodology, not application files and not
accepted decisions of a new project. Templates for PRDs, SPECs, ADRs, plans,
and review reports live in the
[skills](../defaults/skills.md#artifact-templates-in-skills) and are not
duplicated here. Use only the blocks you need, inside an existing artifact.
Templates do not require separate registers, automation, or a file per form.

| Template | Use |
| --- | --- |
| [AGENTS](AGENTS.md.template.md) | Extend the agent's root navigation |
| [CONTRIBUTING](CONTRIBUTING.md.template.md) | Link the real commands and Git policy to the profile |
| [PLANS](PLANS.md.template.md) | Connect the formal planning contract |
| [Task and plan](work-item-and-plan.md) | Assignment, readiness, steps, and checkpoints |
| [Decision and change](decision-and-change.md) | Authority, alternatives, consequences, affected surfaces |
| [Acceptance and evidence](acceptance-and-evidence.md) | Scenario, access, negative cases, and results |
| [Handoff and recovery](handoff-and-recovery.md) | Continuing work without losing authority and facts |
| [Review and retrospective](review-and-retrospective.md) | Review of a stable version, or an evidence-based analysis |
| [Module index](module-index.md) | Navigation across the artifacts of one module |
| [AGENTS for a documentation area](docs-area-AGENTS.md.template.md) | Local rules of one `docs/*` directory |

`{{...}}` marks a value that is filled in during adoption. Before transferring
entry-point files, replace the placeholders and adjust relative paths from the
real destination. `{{METHOD_PATH}}` usually means `docs/development-methodology`,
but this is the adopting project's choice.

Do not replace existing files wholesale. Map their rules to owners, add the
necessary links, and resolve conflicts with the owner. A template does not
count as an active instruction, a command, an approval, or proof of a result.
