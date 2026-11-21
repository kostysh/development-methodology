# AGENTS.md — template for an adopting project

Replace placeholders and merge this navigation into the existing project
instructions. Do not overwrite established rules. This template is not active
until adopted by the project owner.

After merging this navigation, run the [activation command](../ADOPTION.md#activate-the-skill-loading-rule)
to include the release's skill loading rule in the active root instructions.

```markdown
# AGENTS.md

## Start

Read the [project profile](<{{PROJECT_PROFILE_PATH}}>), the route in
[WORKFLOW.md](<{{METHOD_PATH}}/WORKFLOW.md>) that matches the task, the current
task, and closer `AGENTS.md` files for the affected paths. Follow
system/developer constraints, explicit user instructions, and the applicable
project authority.

## Route by action

| Context | Read before the dependent action |
| --- | --- |
| Scope, requirements, permissions, material uncertainty | [01-authority-and-scope.md](<{{METHOD_PATH}}/method/01-authority-and-scope.md>) |
| Product, architecture, specification, delivery handoff | [02-lifecycle.md](<{{METHOD_PATH}}/method/02-lifecycle.md>) |
| Formal planning or execution of an accepted plan | Root `PLANS.md` and [03-planning.md](<{{METHOD_PATH}}/method/03-planning.md>) |
| Tasks, dependencies, readiness, closure | [04-task-management.md](<{{METHOD_PATH}}/method/04-task-management.md>) |
| Implementation, dependencies, public contracts, exact arithmetic | [05-implementation.md](<{{METHOD_PATH}}/method/05-implementation.md>) |
| Tests, evidence, self-check, independent review | [06-verification.md](<{{METHOD_PATH}}/method/06-verification.md>) |
| Git, publication, CI, merge, cleanup | Root `CONTRIBUTING.md` and [07-integration.md](<{{METHOD_PATH}}/method/07-integration.md>) |
| Runtime, credentials, resources, recovery | [08-environments-and-operations.md](<{{METHOD_PATH}}/method/08-environments-and-operations.md>) |
| Data, migrations, import, compatibility | [09-data-and-migrations.md](<{{METHOD_PATH}}/method/09-data-and-migrations.md>) |
| Security, privacy, providers | [10-security-and-privacy.md](<{{METHOD_PATH}}/method/10-security-and-privacy.md>) |
| UI, design, accessibility, text | [11-ui-and-design.md](<{{METHOD_PATH}}/method/11-ui-and-design.md>) |
| Coordinating complex work or a group of tasks, delegating, or resuming after compaction | [Agents and coordination](<{{METHOD_PATH}}/method/12-agents.md>) and the [project skill selection](<{{PROJECT_PROFILE_PATH}}#skills>) |
| Creating, changing, or accepting a persistent artifact: location, ID, metadata, status, module index | [13-artifacts-and-communication.md](<{{METHOD_PATH}}/method/13-artifacts-and-communication.md>) and the profile section [Documentation and artifacts](<{{PROJECT_PROFILE_PATH}}#documentation-and-artifacts>) |
| Change affects commands, configuration, public contracts, user-visible behavior, or operations | [Living documentation](<{{METHOD_PATH}}/method/13-artifacts-and-communication.md#living-documentation>) |
| Choosing, installing, updating, or replacing an agent skill | [15-skills.md](<{{METHOD_PATH}}/method/15-skills.md>), [skills.md](<{{METHOD_PATH}}/defaults/skills.md>), and the profile section [Skills](<{{PROJECT_PROFILE_PATH}}#skills>) |
| Repeated failures or retrospective | [14-learning-and-recovery.md](<{{METHOD_PATH}}/method/14-learning-and-recovery.md>) |

## Skills

Use the skill that the profile assigns to the current stage
in [Skills](<{{PROJECT_PROFILE_PATH}}#skills>). The skill owns the
content structure; project conventions own location, ID, metadata, language,
and status.

## Local navigation

- Primary materials: `{{BASELINE_PATH}}`, `{{INPUTS_PATH}}`
- Product authority: `{{PRODUCT_OWNER_PATH}}`
- Architecture and decisions: `{{ARCHITECTURE_OWNER_PATH}}`
- Delivery plans: `{{DELIVERY_PATH}}`
- Specifications: `{{SPECIFICATIONS_PATH}}`
- Accepted validation and retrospectives: `{{VALIDATION_PATH}}`
- Module indexes: `{{MODULES_PATH_OR_NONE}}`
- Design artifacts: `{{DESIGN_PATH_OR_NONE}}`
- Runtime/package instructions: `{{PACKAGE_RULES_PATH}}`
- Operations and environments: `{{OPERATIONS_OWNER_PATH}}`
- Task tracker and accepted evidence: `{{TRACKING_EVIDENCE_LOCATION}}`

Read only the relevant owners and expand discovery when new facts change the
solution. Keep canonical rules in their owners; this file remains navigation.
Existing authorization persists within its exact scope. Planning alone does
not authorize implementation or publication. Report only observed outcomes.
```
