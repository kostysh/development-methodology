# Defaults: skills

These apply until the [profile](../PROJECT-PROFILE.md#skills) says otherwise.
The principles for working with skills are in the [skills chapter](../method/15-skills.md).
This is the only place in the package where specific skills are listed; the
profile records the set actually installed.

## Source

Repository: [`kostysh/skills`](https://github.com/kostysh/skills).
Installer: the npm package `@kostysh/skills`; requires Node.js 24 or later.
Releases are tagged `skills-YYYYMMDD[-n]`. The current skill catalog is in
the repository README.

## Stages and skills

| Stage | Skills | Result |
| --- | --- | --- |
| Intake, requirements owner decisions | `requirements-approval` | Questions to the owner, accepted decisions, and their transfer into the owning documents |
| Product | `prd-engineer` | PRD, product brief, PRD review |
| Architecture | `architecture-engineer` | Architecture brief, delta, PD, ADR, and other architecture artifacts |
| Delivery | `delivery-planner` | Delivery plan, task brief, backlog audit |
| Specification | `spec-engineer` | Implementation-ready SPEC and verification map |
| Implementation | `implementation-discipline`, `error-fixer`, `git-engineer`, `gh-utility`, and stack skills | Change, tests, living documentation |
| Review | `code-reviewer`, `spec-conformance-reviewer`, `concept-conformance-reviewer`, `security-reviewer`, `web-ui-reviewer`, `gdpr-compliance` | Verdict and findings within the subject |
| UI and design | `web-ux-engineer`, `frontend-design`, `pencil-dev` | Scenario, mockup, design handoff |
| Documentation | `documentation`, `docusaurus-repo` | Tutorial, how-to, reference, explanation, documentation site |
| Learning | `retrospective-analysis` | Retrospective and action plan |

Stack skills (`typescript-engineer`, `node-engineer`, `react-spa-engineer`,
`supabase-engineer`, `financial-calculations-engineer`, and others) are chosen
according to the project's technologies.

## Artifact templates in skills

- `prd-engineer/references/prd-template.md`;
- `architecture-engineer/assets/templates/` — brief, delta, check, PD, ADR,
  quality scenario, spike, ASR, and handoff;
- `delivery-planner/references/output-templates.md`;
- `spec-engineer/references/example-spec.md` and the output contract in `SKILL.md`;
- `documentation/references/diataxis-guide.md`;
- `retrospective-analysis/references/report-and-remediation-plan.md`.

## Sets

| Set | Skills | When |
| --- | --- | --- |
| Base | `prd-engineer`, `architecture-engineer`, `delivery-planner`, `spec-engineer`, `implementation-discipline`, `code-reviewer`, `spec-conformance-reviewer`, `documentation`, `git-engineer`, `retrospective-analysis` | Any project with the full lifecycle route |
| Requirements owner outside the team | `requirements-approval` | A customer or another external owner makes the decisions |
| Security and data | `security-reviewer`, `gdpr-compliance` | Permissions, secrets, trust boundary; personal data |
| UI | `web-ux-engineer`, `frontend-design`, `web-ui-reviewer`, `pencil-dev` | User interface; `pencil-dev` if mockups are in Pencil |
| Hosting and tools | `gh-utility`, `docusaurus-repo`, `error-fixer`, `concept-conformance-reviewer` | According to the services used and the need |
| Stack | Skills for the project's technologies | According to the profile |

The PRD statuses in `prd-engineer` (`draft`, `review`, `baselined`, `updated`,
`archived`) are mapped to the project's statuses in the profile. A typical
mapping: `review` → `draft` under review, `baselined` → `accepted`, `updated`
→ `accepted` with a change note.

## Installation via CLI

The CLI downloads skills from a stable release, verifies SHA-256, and installs
only the runtime files.

```sh
# interactive selection
npx @kostysh/skills

# base set into the project
npx @kostysh/skills install prd-engineer architecture-engineer delivery-planner \
  spec-engineer implementation-discipline code-reviewer spec-conformance-reviewer \
  documentation git-engineer retrospective-analysis \
  --target custom --path .claude/skills

# globally for an agent: --target claude-code | codex | opencode | pi
npx @kostysh/skills install code-reviewer --target codex
```

The project path depends on the agent: `.claude/skills` for Claude Code,
`.agents/skills` for agents that read that directory. Installations are
recorded in `~/.kskills/setup.json`.

## Installation by cloning

```sh
git clone https://github.com/kostysh/skills.git <agent-skills-dir>/kostysh
git -C <agent-skills-dir>/kostysh checkout <release-tag>
```

The runtime skills are in the `skills/` subdirectory. Check at what depth the
agent looks for `SKILL.md`; if needed, point the agent at the clone's
`skills/` directory or create a link to it. The clone also contains the
skills' development materials and does not verify hashes. This method suits
skill maintainers and environments without npm.

## Updating

```sh
npx @kostysh/skills update                                          # CLI installations
git -C <clone> fetch --tags && git -C <clone> checkout <new-tag>    # clone
```

The CLI preserves locally modified and unmanaged directories and reports the
conflict with a non-zero exit code. Such a conflict is resolved manually.
