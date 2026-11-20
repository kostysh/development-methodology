# Defaults: skills

These apply until the [profile](../PROJECT-PROFILE.md#skills) says otherwise.
The principles for working with skills are in the [skills chapter](../method/15-skills.md).
This is the only place in the package where specific skills are listed; the
profile records the set actually installed.

## Source

Repository: [`kostysh/skills`](https://github.com/kostysh/skills).
For methodology 5.0.0, use the [skills-v5.0.0 assets](https://github.com/kostysh/skills/releases/tag/skills-v5.0.0).
The catalog lists each skill's version, filename in its URL, and SHA-256.

## Stages and skills

| Stage | Skills | Result |
| --- | --- | --- |
| Intake, requirements owner decisions | `requirements-approval` | Questions to the owner, accepted decisions, and their transfer into the owning documents |
| Product | `prd-engineer` | PRD, product brief, PRD review |
| Architecture | `architecture-engineer` | Architecture brief, delta, PD, ADR, and other architecture artifacts |
| Delivery | `delivery-planner` | Delivery plan, task brief, backlog audit |
| Specification | `spec-engineer` | Implementation-ready SPEC and verification map |
| Protected baseline, where applicable | An independent test author with the accepted specification and a way to exercise the public boundary | Assertions traced to the specification. Send gaps to its owner before freezing. |
| Implementation | `implementation-discipline`, `error-fixer`, `git-engineer`, `gh-utility`, and stack skills | Change, tests, living documentation |
| Review | `code-reviewer`, `spec-conformance-reviewer`, `concept-conformance-reviewer`, `security-reviewer`, `web-ui-reviewer`, `gdpr-compliance` | Verdict and findings within the subject |
| UI and design | `web-ux-engineer`, `frontend-design` | Scenario, mockup, design handoff |
| Documentation | `documentation`, `docusaurus-repo` | Tutorial, how-to, reference, explanation, documentation site |
| Learning | `retrospective-analysis` | Retrospective and action plan |

Stack skills (`typescript-engineer`, `node-engineer`, `react-spa-engineer`,
`supabase-engineer`, `financial-calculations-engineer`, and others) are chosen
according to the project's technologies.

For a protected baseline, select a test author who can work within the
[specification-only assignment](../method/06-verification.md#protected-test-baseline).
Give the conformance reviewer the assertion map, the candidate's verified
baseline result and its uncovered criteria. Trace every criterion and focus
new inspection on gaps in the demonstrated operation and transport.

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
| UI | `web-ux-engineer`, `frontend-design`, `web-ui-reviewer` | User interface |
| Hosting and tools | `gh-utility`, `docusaurus-repo`, `error-fixer`, `concept-conformance-reviewer` | According to the services used and the need |
| Stack | Skills for the project's technologies | According to the profile |

The PRD statuses in `prd-engineer` (`draft`, `review`, `baselined`, `updated`,
`archived`) are mapped to the project's statuses in the profile. A typical
mapping: `review` → `draft` under review, `baselined` → `accepted`, `updated`
→ `accepted` with a change note.

## Install the v5 release

Download the exact catalog and the selected built archives into an empty
staging directory. This example installs one selected skill for Codex.
Repeat for the set in the project profile. Use `.claude/skills` for Claude
Code or `.agents/skills` for Codex. The example uses GitHub CLI, jq and GNU
coreutils. Run each step only after the previous one succeeds.

```sh
skill_name=code-reviewer
stage_dir="$PWD/.methodology/releases/skills-v5.0.0"
target_dir="$PWD/.agents/skills"
mkdir -p "$stage_dir" "$target_dir"
gh release download skills-v5.0.0 --repo kostysh/skills --dir "$stage_dir" --pattern catalog.json --skip-existing
skill_asset=$(jq -er --arg name "$skill_name" '.skills[] | select(.name==$name) | .url | split("/") | last' "$stage_dir/catalog.json")
skill_digest=$(jq -er --arg name "$skill_name" '.skills[] | select(.name==$name) | .sha256' "$stage_dir/catalog.json")
gh release download skills-v5.0.0 --repo kostysh/skills --dir "$stage_dir" --pattern "$skill_asset" --skip-existing
(cd "$stage_dir" && printf '%s  %s\n' "$skill_digest" "$skill_asset" | sha256sum --check)
skill_stage=$(mktemp -d "$target_dir/.new-XXXXXXXX")
tar -xzf "$stage_dir/$skill_asset" -C "$skill_stage"
test -s "$skill_stage/SKILL.md" && test ! -e "$target_dir/$skill_name" && mv -T "$skill_stage" "$target_dir/$skill_name"
```

For an update, compare an existing skill with its recorded archive. Keep
local edits and resolve differences with the owner. Move the previous
verified directory into a private backup before switching. Verify the skill
in a fresh agent session. To roll back, restore that directory, restart the
agent and verify the earlier skill version. An unqualified stable-catalog
installation selects the conventional stable release. Pin the v5 tag above
for this methodology.

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
