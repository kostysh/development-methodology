# Changelog

These entries are for a project that updates its copy of the package
([update procedure](ADOPTION.md#updating-the-methodology)). Each version
states what requires action in the adopting project.

## 0.4 — 2026-11-12

Rule layers, document kinds, parallel work, teams.

- Three layers: principles in `method/`, defaults in the new directory
  [`defaults/`](defaults/) ([documentation](defaults/documentation.md),
  [skills](defaults/skills.md)), project values in the profile. Chapters 13
  and 15 no longer contain paths, prefixes, skill names, or commands.
- The "stage → skill" table has a single owner, `defaults/skills.md`;
  it was removed from chapter 13 and from the `AGENTS.md` template.
- Documents are divided into descriptions of the current state (PRD,
  architecture brief, SPEC) and point-in-time records (decisions, deltas,
  plans, validation). A description is edited together with the change to the
  system; a record is replaced by a new one. An accepted delta is carried into
  the brief; a completed plan is archived. A rule on which documents the
  executor reads.
- A core set of seven types: PRD, architecture brief, architecture delta,
  decision record (PD), delivery plan, SPEC, validation record. Other types are
  switched on in the profile. Documents by risk level.
- A new document's ID is provisional until merge; on a conflict the document
  merged second is renumbered; uniqueness is checked before merge. Alternative:
  the tracker task number.
- `solo` and `team` modes: acceptance, deputies and response times, disputes,
  reading order for a new participant.
- [WORKFLOW.md](WORKFLOW.md) with three routes; "Steps" blocks in chapters
  04, 05, 06, 07, 13, and 15.
- The whole package was translated from Russian to English; the rules did not
  change. Heading anchors changed accordingly, and the profile mode value
  `команда` became `team`.

Actions when updating from 0.3: in the profile, fill in numbering, the switched-on
extended types, and the "Roles and independence" section; determine the kind of
existing documents; in the root `AGENTS.md`, replace the skills table with a
link to the profile; if several SPEC versions exist for one area, merge them
into one current description or mark the earlier ones `superseded`. Update
links into the methodology that point to section anchors.

## 0.3 — 2026-11-12

Lifecycle documentation and skills.

- New chapter [agent skills](method/15-skills.md): the `kostysh/skills`
  source, ownership split between skill and project, skills per stage,
  recommended set, installation via CLI and by cloning, updating, working
  without skills.
- [Documentation and artifacts](method/13-artifacts-and-communication.md):
  documents by stage; default `docs/` layout, ID scheme, and metadata;
  statuses and acceptance; persistence rules; module index; living documentation.
- Lifecycle, verification, and change closure take living documentation into account.
- Profile: sections "Documentation and artifacts" and "Skills".
- Templates: module index, local `AGENTS.md` for a documentation area; routes to
  documentation and skills in the `AGENTS.md` template; rows for artifacts,
  living documentation, and skills in the handoff; a living-documentation row
  in the affected-surfaces table.
- Adoption: skill installation, documentation setup, adoption completion
  criteria, methodology update procedure.
- [Glossary](GLOSSARY.md).
- The prototype's `VALIDATION.md` was removed.

Actions when updating from 0.2: fill in the two new profile sections, install
skills, extend the root `AGENTS.md` with routes and the skills table, add a
living-documentation row to the affected-surface forms in use.

## 0.2 — 2026-11-12

Nested review and re-check cycles were reduced.

## 0.1 — 2026-10-28

First portable version, extracted from the methodology of the originating project.
