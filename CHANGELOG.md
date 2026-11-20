# Changelog

These entries are for a project that updates its copy of the package
([update procedure](ADOPTION.md#updating-the-methodology)). Each version
states what requires action in the adopting project.

## 5.0.3

- Schedule the night train as a standalone project task in Codex. Give the
  task access to the fixed train trigger. The protected runner retains the
  App key and performs verification, integration and test deployment.
  Check one clock-triggered receipt with the operator offline.
- Replace an earlier recurring GitHub workflow or OS cron entry when enabling
  the Codex schedule. The packaged GitHub dispatcher accepts a scheduled
  request for the current UTC slot. Choose the optional system cron entry
  only where Codex scheduling is unavailable. [Train setup](defaults/merge-train.md)

## 5.0.2

- Install 5.0.2 in a fresh release directory. Keep the existing filled
  profile. Choose pinned guide links or an offline guide copy in a fresh
  project directory. Verify links from the project's actual entry points.
  The paired skill release is `skills-v5.0.0`. [Adoption](ADOPTION.md#5-connect-the-instructions)
- Configure the installed task coordinator once. Use `methodology-task
  begin` and `finish` for native hooks, optional recovery, workspace
  observations and the final task report. Record acceptance only at the
  project's agreed boundary. [Task commands](defaults/process-metrics.md#begin-and-finish-a-task)
- Keep the usual GitHub identity for PRs. Configure the independent
  reviewer, trusted App publisher and any protected verification paths.
  To keep dependencies across replacement PRs, migrate the selected
  numeric references to stable task keys. Commission an actual scheduled
  start and verify the outcomes while the operator is offline.
  [Train](defaults/merge-train.md) · [Review policy](defaults/controls.md#protect-the-review-policy)

## 5.0.1

- Install the guide and tools in a fresh version directory, keep the filled project profile in its existing location and verify the CI checksum manifest before extracting. Use the paired `skills-v5.0.0` release. [Installation and update](ADOPTION.md#2-place-and-configure)
- Select native sessions from the operator terminal, check project and hook trust and verify a real callback. Register recovery through the installed command. Use the operation spool for sandboxed task measurements and import it from the coordinator. [Metrics](defaults/process-metrics.md#connect-a-native-client) · [Recovery](defaults/task-recovery.md)
- Keep normal owner decisions in the project conversation. Record their source. Use existing independent publication authority when required. [Solo decisions](defaults/solo-decisions.md)
- Configure the reference admission and baseline workflows and verifier for the project's actual suite. Use one immutable submission namespace, resubmit corrected work, and configure renewable GitHub App access for long trains. A busy shared-resource runner returns 75. [Train](defaults/merge-train.md) · [Controls](defaults/controls.md)

## 5.0.0 — 2026-11-20

- Reviewers classify each finding using the [closure rules](method/06-verification.md#closing-review-findings).
  Adopt the updated review form and choose the matching review skills. A
  deterministic fix needs a failing-before and passing-after check through
  the required operation and transport. Preserve the applicable domain review.
- Install the versioned guide, tools and project-local skill archives using
  the [release procedure](ADOPTION.md#2-place-and-configure). Save the old
  version for rollback. Connect the selected clients' native hooks, bind an
  authorized task and verify a tool action and compaction in the journal.
  Apply the [event and reporting procedure](defaults/process-metrics.md).
- Configure the optional [solo decision register](defaults/solo-decisions.md)
  and its merge gate, then exercise a batch confirmation and a reversal.
- Select applicable [deterministic controls](defaults/controls.md). Verify
  the installed command against a known violation and a clean candidate
  before transferring a check out of manual review.
- Update the UI skill selection in the profile. The current catalog retired
  `pencil-dev`. Projects with an earlier pinned copy can record their chosen
  replacement when they update. [Catalog and update behavior](https://github.com/kostysh/skills/blob/082e6d78720c87e047e2ad08be45a4528259876c/README.md).
- For the [protected test baseline](method/06-verification.md#protected-test-baseline),
  update the profile and plan entry point. Set up a trusted hook and required
  CI, then [pilot the route](ADOPTION.md#8-verify-on-one-task) on a medium-risk
  behavior change before adopting it.
- When selecting the [merge train](method/07-integration.md#merge-train),
  install the command, protect its target and [commission it](ADOPTION.md#commission-the-merge-train)
  using an exact-commit check and independent provider readback.
- Replace links to the former combined handoff form with the
  [checkpoint report](templates/checkpoint-report.md) for people and the
  [task state file](templates/task-state.md) for the agent. Set its line
  and byte limits, select a tested recovery command, and verify the host and manual
  fallback using the [setup guide](defaults/task-recovery.md).

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
