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
| [Task state](task-state.md) | Recover one task and its authority after an interruption |
| [Checkpoint and closure](checkpoint-report.md) | Give results and outstanding decisions to the operator or next owner |
| [Review and retrospective](review-and-retrospective.md) | Review of a stable version, or an evidence-based analysis |
| [Module index](module-index.md) | Navigation across the artifacts of one module |
| [AGENTS for a documentation area](docs-area-AGENTS.md.template.md) | Local rules of one `docs/*` directory |

`{{...}}` marks a value that is filled in during adoption. Before transferring
an entry-point block, remove its code fence and replace the placeholders.
Follow [adoption step 5](../ADOPTION.md#5-connect-the-instructions) to set the
two link destinations:

- `{{METHOD_PATH}}` is the guide directory relative to the entry point, or the
  URL prefix for files at the exact release tag. Omit a trailing slash.
- `{{PROJECT_PROFILE_PATH}}` is the path to the filled profile, relative to the
  entry point. Include the filename. Preserve the section anchors used in the
  template or update them to match the actual profile.

For example, with an offline guide in `docs/methodology-v<version>/` and a
filled profile in `docs/PROJECT-PROFILE.md`, a root entry point uses
`docs/methodology-v<version>` and `docs/PROJECT-PROFILE.md`. An entry point in
`docs/product/` uses `../methodology-v<version>` and `../PROJECT-PROFILE.md`.

Do not replace existing files wholesale. Map their rules to owners, add the
necessary links, and resolve conflicts with the owner. A template does not
count as an active instruction, a command, an approval, or proof of a result.
