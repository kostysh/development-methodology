# Defaults: documentation

These apply until the [profile](../PROJECT-PROFILE.md#documentation-and-artifacts)
says otherwise. The rules — whether a document is needed, its kind, statuses,
acceptance, ID stability — are in the [documentation chapter](../method/13-artifacts-and-communication.md).

A project with an existing structure records in the profile how its
directories map to the document classes and does not relocate documents en
masse to match the names. A directory is created together with the first
real document.

## Layout

```text
docs/
  development-methodology/   methodology and project profile
  baseline/                  accepted primary obligations
  inputs/                    other primary materials and their register README.md
  product/
    prds/                    core set
    briefs/  reviews/        extended set
  architecture/
    briefs/  deltas/  decisions/                         core set
    adrs/  checks/  quality-scenarios/  spikes/  asr/  handoff/   extended
  delivery/
    plans/                   core set
    task-briefs/  backlog-audits/   extended set
  specifications/
  validation/
    retrospectives/          extended set
  design/
  modules/
    MOD-0001-<slug>/README.md
  operations/                runbooks and environment contract
```

## IDs and file names

Core set:

| Prefix | Artifact | File |
| --- | --- | --- |
| `PRD-0001` | PRD | `docs/product/prds/PRD-0001-<slug>.md` |
| `ARCH-0001` | Architecture brief | `docs/architecture/briefs/ARCH-0001-<slug>.md` |
| `ARCH-DELTA-0001` | Architecture delta | `docs/architecture/deltas/ARCH-DELTA-0001-<slug>.md` |
| `PD-0001` | Decision record (pattern decision) | `docs/architecture/decisions/PD-0001-<slug>.md` |
| `DP-0001` | Delivery plan | `docs/delivery/plans/DP-0001-<slug>.md` |
| `SPEC-0001` | Specification | `docs/specifications/SPEC-0001-<slug>.md` |
| `VAL-0001` | Validation record | `docs/validation/VAL-0001-<slug>.md` |

Extended set — switched on row by row in the profile:

| Prefix | Artifact | File |
| --- | --- | --- |
| `PB-0001` | Product brief | `docs/product/briefs/PB-0001-<slug>.md` |
| `PRD-REVIEW-0001` | PRD review | `docs/product/reviews/PRD-REVIEW-0001-<slug>.md` |
| `ADR-0001` | ADR | `docs/architecture/adrs/ADR-0001-<slug>.md` |
| `ARCH-CHECK-0001` | Architecture check | `docs/architecture/checks/ARCH-CHECK-0001-<slug>.md` |
| `QS-0001` | Quality scenario | `docs/architecture/quality-scenarios/QS-0001-<slug>.md` |
| `SPK-0001` | Spike brief | `docs/architecture/spikes/SPK-0001-<slug>.md` |
| `ASR-0001` | Architecturally significant requirement | `docs/architecture/asr/ASR-0001-<slug>.yaml` |
| `AHI-0001` | Architecture handoff item | `docs/architecture/handoff/AHI-0001-<slug>.yaml` |
| `MDP-0001` | Module delivery plan | `docs/delivery/plans/MDP-0001-<slug>.md` |
| `T-0001` | Standalone task brief | `docs/delivery/task-briefs/T-0001-<slug>.md` |
| `BA-0001` | Backlog audit | `docs/delivery/backlog-audits/BA-0001-<slug>.md` |
| `RETRO-0001` | Retrospective | `docs/validation/retrospectives/RETRO-0001-<slug>.md` |
| `OPS-0001` | Runbook | `docs/operations/OPS-0001-<slug>.md` |
| `MOD-0001` | Module index | `docs/modules/MOD-0001-<slug>/README.md` |

Internal IDs live inside the owning document: `PRD-R-001`, `PRD-NFR-001`,
`AC-001`, `SPEC-R-001`, `VS-001`, `MI-001`, `T-001`.

## Numbering

By default the number is the next free one for its prefix on a fresh base of
the integration branch. A number is never reused, even if the document is
deleted. The procedure for number conflicts is in the
[identifier rules](../method/13-artifacts-and-communication.md#identifiers).

An alternative for high parallelism, switched on in the profile: the
artifact number equals the tracker task number (`SPEC-0142` for task `#142`).
A conflict is then impossible, but the numbers have gaps.

## Metadata

A persistent Markdown artifact starts with front matter unless the skill's
template or the profile defines an equivalent block:

```yaml
---
id: SPEC-0001
title: <title>
artifact_type: specification
kind: description           # description | record
status: draft
owner: <role or participant>
language: <prose language>
module: MOD-0001            # if any
source:                     # primary materials and accepted bases
  - docs/baseline/<file>#<section>
related: [PRD-0001, ARCH-DELTA-0001, DP-0001]
supersedes: []
superseded_by: []
accepted: null              # after acceptance: date, who accepted, link to the decision
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

A description of the current state keeps a short `Change notes` section at
the end of the document: date, gist of the change, task or PR, who accepted it.
For YAML artifacts the same fields sit at the top level.
