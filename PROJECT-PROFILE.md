# New project profile

Status: **not filled in; not a permission to act**.
Filled in by the adopting project. The value `not_applicable` requires a
reason; `unknown` blocks only the actions that depend on the missing decision.

## Identity and governance

| Field | Value |
| --- | --- |
| Project, type of result, goal | Not set |
| Owner of the product and of requirement sources | Not set |
| Owner of technical decisions and of the methodology | Not set |
| Owners of security, data, and operations, where applicable | Not set |
| Repository, integration branch, release branch if needed | Not set |
| Accepted sources, priorities, and procedure for changing the baseline | Not set |
| Languages of communication, project prose, UI, API text, emails | Not set |
| Original language of quotes and immutable technical identifiers | Preserved |
| Methodology version, adoption decision, date, and owner | Not set |

## Authority and stops

| Action | Who authorizes / existing basis | Constraints |
| --- | --- | --- |
| Research and local edits | Not set | State the read/write scope |
| Commit, push, PR, merge | Not set | State separate boundaries and branch rules |
| Deploy, migrations, rollback, production | Not set | Exact environment and owner |
| External messages and publication | Not set | Recipient, content, channel |
| Secrets, mail, sign-in, data processing | Not set | Do not store values here |
| New or replacing dependency / provider / workflow | Not set | Decision before the boundary changes |
| Delegation and independent checks | Not set | Admissibility, independence, limit |
| Plan and checkpoints | Not set | Trigger, hard stops, action after acceptance |
| Limit of tasks awaiting the owner | Not set | Number and queue order |

## Working route

| Setting | Value |
| --- | --- |
| Source isolation; task worktree or an accepted equivalent | Not set |
| Branch names, commit style, PR, and history rules | Not set |
| Required live protection/checks/reviews and how to read them | Not set |
| Integration method and proof of the final commit/tree | Not set |
| Execution tracker; where the requirements owner's decisions live | Not set |
| Mapping of local statuses to the task model | Not set |
| Location of requirements, decisions, specs, plans, and evidence | See [Documentation and artifacts](#documentation-and-artifacts) |
| Permitted exceptions and their review dates | No accepted exceptions |

## Documentation and artifacts

Rules are in [documentation and artifacts](method/13-artifacts-and-communication.md),
defaults in [defaults/documentation.md](defaults/documentation.md).
Fill in a row only if the project departs from them; otherwise write
"default". Map an existing structure to the classes without relocating
documents en masse.

| Setting | Value |
| --- | --- |
| Documentation root and directory layout | Default (`docs/`) — confirm or set |
| Mapping of existing directories to document classes | Not set |
| ID and file-name scheme; differences from the default | Default — confirm |
| Numbering: next free number or tracker task number | Default — next free number |
| Extended-set types switched on (PB, ADR, QS, SPK, ASR, AHI, MDP, T, BA, RETRO, OPS, MOD, etc.) | None — core set only |
| Metadata: front matter or an equivalent | Default — confirm |
| Mapping of skill statuses to project statuses (`review`, `baselined`, etc.) | Not set |
| Who accepts documents per class: product, architecture, delivery, specification, validation | Not set |
| Where acceptance is recorded: PR, decision in the document, tracker | Not set |
| Modules and their IDs (`MOD-*`) | Not defined |
| Primary materials: baseline, inputs, access restrictions | Not set |
| Development log: PR, task, or handoff | Not set |

Living documentation:

| Class | Location | Owner | How it is verified |
| --- | --- | --- | --- |
| Package/module READMEs and `CONTRIBUTING.md` | Not set | Not set | Not set |
| Runbooks and environment contract | Not set | Not set | Not set |
| API reference (hand-written or generated) | Not set | Not set | Not set |
| User documentation | Not set | Not set | Not set |
| Product release notes / changelog | Not set | Not set | Not set |

## Skills

Rules are in the [skills chapter](method/15-skills.md); the default set and
install commands are in [defaults/skills.md](defaults/skills.md).

| Setting | Value |
| --- | --- |
| Source | `https://github.com/kostysh/skills` |
| Installation method: CLI `@kostysh/skills` or clone | Not set |
| Location: project directory (`.claude/skills`, `.agents/skills`) or global | Not set |
| Release tag or commit | Not set |
| Who authorizes installation and updates | Not set |
| Date and method of verifying that the agent sees the skills | Not set |

| Stage / subject | Skill | Installed | Replacement or reason for absence |
| --- | --- | --- | --- |
| Requirements owner decisions | `requirements-approval` | Not set | Not set |
| Product | `prd-engineer` | Not set | Not set |
| Architecture | `architecture-engineer` | Not set | Not set |
| Delivery | `delivery-planner` | Not set | Not set |
| Specification | `spec-engineer` | Not set | Not set |
| Implementation | `implementation-discipline`, `git-engineer`, stack skills | Not set | Not set |
| Code and conformance review | `code-reviewer`, `spec-conformance-reviewer` | Not set | Not set |
| Security and privacy review | `security-reviewer`, `gdpr-compliance` | Not set | Not set |
| UI | `web-ux-engineer`, `frontend-design`, `web-ui-reviewer`, `pencil-dev` | Not set | Not set |
| Documentation | `documentation` | Not set | Not set |
| Retrospective | `retrospective-analysis` | Not set | Not set |

## Tools and checks

For each row fill in the existing command/procedure, the run scope,
preconditions, expected outcome, whether it is mandatory, and the locator of
the stored result. Do not treat an installed utility or the existence of a
script as proof of success.

| Check | Command / interface | Where and when | Result and evidence |
| --- | --- | --- | --- |
| Format, lint, types, build | Not set | Not set | Not set |
| Unit and component | Not set | Not set | Not set |
| Real integration and API | Not set | Not set | Not set |
| UI: reproducible test and direct walkthrough | Not set | Not set | Not set |
| Data: clean replay and upgrade | Not set | Not set | Not set |
| Secrets, dependencies, workflow checks | Not set | Not set | Not set |
| CI and deployed revision | Not set | Not set | Not set |
| Documentation, links, publication | Not set | Not set | Not set |
| Cleanup and re-reading of resources | Not set | Not set | Not set |
| Expensive checks: composition, duration, when run | Not set | Not set | Not set |

Describe the trusted runtime/toolchain versions, package manager, lockfile,
update sources, compatibility, license policy, and acceptable release maturity.
Technology names and numeric thresholds are not inherited from the prototype.

## Environments and access

For each environment needed, fill in the
[access matrix](templates/acceptance-and-evidence.md#access-and-preconditions).
Separately set the resource owner, data isolation, origin/target identity,
CPU/RAM/disk admission, deadlines, retry limits, how results are stored,
cleanup, and recovery after loss of control.

Keep the secret/config inventory with the environment owner. The profile
needs links and the names of secret classes, but not values and not user
credentials.

## Conditional areas

| Area | applicable / not_applicable and reason | Owner and rule |
| --- | --- | --- |
| UI, accessibility, design, and localization | Not determined | Not set |
| Public API, events, and compatibility | Not determined | Not set |
| Persistent data, migrations, legacy/import | Not determined | Not set |
| Identity, roles, tenancy, and long-lived sessions | Not determined | Not set |
| Personal data, retention, deletion, legal hold | Not determined | Not set |
| Monetary/exact calculations | Not determined | Not set |
| External providers and side effects | Not determined | Not set |
| Operations, observability, release, and recovery | Not determined | Not set |
| Status for an external reader | Not determined | Not set |
| AI feature of the product, if any | Not determined | Owning requirements, evaluation of quality/failures, and a specialist; the development agent does not prove the quality of an AI product |

## Process metrics

Baseline values are taken on the adoption trial task and serve as the basis
for the [effectiveness check](method/14-learning-and-recovery.md#effectiveness-check).

| Metric | Measurement method | Baseline value and date |
| --- | --- | --- |
| Time from Ready to Done | Not set | Not set |
| Review rounds per task | Not set | Not set |
| Share of work after the first review | Not set | Not set |
| Time waiting for the owner | Not set | Not set |
| Duration of mandatory checks | Not set | Not set |

## Roles and independence

Choose the mode and map the roles from the [lifecycle](method/02-lifecycle.md)
to people, teams, or [skills](#skills). The rules for the modes are in
[team composition](method/12-agents.md#team-composition).

| Setting | Value |
| --- | --- |
| Mode: `solo` or `team` | Not set |
| Owner and deputy per role: product, architecture, delivery, specification, review, integration | Not set |
| Owner response time per class of decisions | Not set |
| Safe default when there is no response in time, per class of decisions | None — the decision waits for the owner or deputy |
| Who resolves disputes between author and reviewer | Not set |

For AI, state the actually supported models/reasoning levels, permitted
parallelism, resource limit, the auditor's isolated context, and how
completion is confirmed.

No specific model, editor, or API is mandatory. Skills from the
[default set](defaults/skills.md) are recommended and replaceable;
the mandatory result of a role is preserved when the tool is replaced.

## Adoption acceptance

- Adoption decision: not set.
- Unknown fields and the actions they affect: not resolved.
- Trial task, its result and limitations: not done.
- Maintenance owner and next review event: not set.
