# Instructions for maintaining this methodology prototype

This directory contains a reusable development methodology, not an application
or the policy of its hosting repository. Start with [README.md](README.md),
[ADOPTION.md](ADOPTION.md), and [PROJECT-PROFILE.md](PROJECT-PROFILE.md).

## Scope

- Keep only reusable process guidance, adoption instructions, and blank templates.
- Do not import application code, contracts, product requirements, customer data,
  task registers, designs, migrations, workflows, environment files, credentials,
  or historical project evidence.
- Preserve the difference between a general principle, a conditional practice,
  and a project-specific choice. Keep the latter in the project profile.
- The originating project is provenance only, never an operational dependency;
  a reader must be able to adopt the package without access to it.
- Keep three layers apart: principles in `method/`, concrete default choices
  (directory layout, ID scheme, metadata, skill names, install commands) in
  `defaults/`, and project values in the profile. A chapter may reference a
  default but must not restate it.
- Artifact content formats belong to the skills. Do not copy skill templates
  into this package. Specific skill names appear only in `defaults/skills.md`,
  `PROJECT-PROFILE.md`, and `CHANGELOG.md`.
- Phrase a new rule as an action to take. Use a prohibition only when it
  prevents a named failure, and state that failure.
- When a chapter changes, keep its "Steps" block and `WORKFLOW.md`
  consistent with it.
- Do not install tools or skills, create trackers, provision environments, or
  change global agent configuration while maintaining these documents. Skill
  installation is an adoption step that needs the adopting project owner's
  permission.

## Change and verification

- Read the owning chapter before editing. Change the canonical rule first;
  update navigation and affected templates without creating duplicate rules.
- A template is inert until an adopting project supplies its actual context.
  Do not execute placeholder commands or infer approval from this prototype.
- Write all prose of this package in English. When translating or rewording,
  preserve meaning exactly: conditions, exceptions, modality, and limits of a
  claim. Preserve technical identifiers.
- Record every released change in `CHANGELOG.md` with the actions an adopting
  project must take, and bump the version in `README.md`.
- Check relative links and anchors, terminology against `GLOSSARY.md`, scope
  leakage, consistency of conditional gates, that skill names appear only where
  allowed, and that skill names and install commands still match the skills
  repository. Review what a future reader must do,
  not only whether a file exists.
- Report structural checks and walkthroughs separately from real-world adoption
  or measured process effectiveness. Do not claim either without evidence.
- Follow the hosting repository and current user request for Git, publication,
  permissions, review, and integration. The example policies inside this package
  do not activate themselves for its maintenance task.
