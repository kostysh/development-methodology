# Documentation, artifacts, and communication

A reader needs a document to act, decide, verify, or preserve knowledge. It is
not created for the formal completeness of a tree. A canonical rule has one
owner; navigation and templates link to it.

This section defines when a document is needed, what kind it is, and how it
is accepted, changed, and read. The directory layout, ID prefixes, and
metadata format are set by the [defaults](../defaults/documentation.md) and
the [profile](../PROJECT-PROFILE.md#documentation-and-artifacts). The content
structure of PRDs, SPECs, decisions, plans, and reports is set by
[skills](15-skills.md).

## Steps

1. Decide whether a separate document is needed: by the [risk level](#documents-by-risk-level)
   and the [persistence rules](#persistence-rules). If not, record the result
   in the task, PR, or handoff.
2. Determine the [kind](#descriptions-and-records). Edit a description of the
   current state in place; create a record as a new one.
3. Take the location and ID from the profile, add metadata and links to sources.
4. Write the content following the stage's skill, in the language set by the profile.
5. Leave the status as `draft` and pass the document to the owner of its class
   for acceptance.
6. Update the module index and the links from related documents.
7. Check whether [living documentation](#living-documentation) is affected.

## Document classes

| Class | Purpose |
| --- | --- |
| Primary material | The origin of a requirement: accepted obligations (baseline) and other materials (inputs) |
| Stage artifact | Product, architecture, delivery, specification: future work depends on its content |
| Validation | Accepted evidence, post-merge verification, retrospective |
| Transient evidence | Relates to one run, task, or PR; lives in the task, PR, or handoff |
| Module index | Navigation across the artifacts of one module |
| Design artifact | Mockup, component library, tokens, export |
| Living documentation | The current structure of the system: READMEs, runbooks, API reference, user documentation |
| Methodology and profile | The project's process rules |

Primary material keeps its provenance and original language. An internal
explanation does not rewrite the baseline. Material from inputs does not
become a requirement until the owner has accepted it in a stage artifact.
Personal and confidential data are not put into the repository without an
explicit decision of the owner.

Documents are grouped by class and type, not by the name of the agent or
skill that created them. Empty directories and placeholder artifacts are not
created.

## Descriptions and records

Every stage artifact belongs to one of two kinds.

| Kind | What it is | How it changes |
| --- | --- | --- |
| Description of the current state | What the system must do and how it is structured now: PRD, architecture brief, SPEC, quality scenario, ASR, module index | One current document per area. A change of behavior or a boundary edits it in the same task, with a change note and acceptance of the changed part. Earlier revisions are kept by Git history |
| Point-in-time record | Why and when something was decided or done: decision (PD, ADR), architecture delta, plan, task brief, backlog audit, validation, retrospective, review report | Not edited after acceptance, except for status and supersession links. A new decision is a new record with a `supersedes` link |

Rules that follow from this:

- An accepted architecture delta is carried into the architecture brief in
  the same task. The delta remains a record with the rationale and a link to
  the changed brief.
- A description is not split into version files. A separate new SPEC is
  needed for a new area of behavior, not for a new revision of an old one.
- A completed plan gets the status `archived` with a note on how it ended and
  where the unfinished obligations went.
- Documents are not moved when their status changes, so that links do not break.

## What to read

By default the executor reads the current descriptions of their area,
starting from the module index or the profile's navigation. Records are read
via a link from a description or a task when the rationale of a decision is
needed. `superseded` and `archived` documents are read only via a direct link
or on request: they explain history but do not set current requirements.

## Documents by stage

The stages and their sufficient outputs are defined in the
[lifecycle](02-lifecycle.md); the skills for the stages are in the
[defaults](../defaults/skills.md#stages-and-skills).

The core set is the seven types marked in the table. The project switches on
extended types row by row in the profile; if a type is not switched on, its
content is written into a document of the core set.

| Stage | Artifact | Kind | Set | A separate file is needed when | Otherwise |
| --- | --- | --- | --- | --- | --- |
| Product | PRD | Description | Core | Scope, requirements, or acceptance must outlive the task | Assignment in the task |
| Product | Product brief | Description | Extended | Early framing before a PRD | Draft PRD |
| Product | PRD review | Record | Extended | The review changes future work | Verdict in the PR or handoff |
| Architecture | Architecture brief | Description | Core | A new system, a major module, choice of stack | A PRD section for a simple system |
| Architecture | Architecture delta | Record | Core | A bounded change to the existing architecture | A single decision record |
| Architecture | Decision record (PD) | Record | Core | A significant technical choice that will be repeated or revisited | A line in the delta or task |
| Architecture | ADR | Record | Extended | The project needs a separate form for hard-to-reverse decisions | A PD marked as irreversible |
| Architecture | Check, quality scenario, spike, ASR, handoff item | Check, spike, handoff — record; QS, ASR — description | Extended | Later executors need the type separately | A section of the brief or delta |
| Delivery | Delivery plan | Record | Core | A feature or project of several tasks | A task in the tracker |
| Delivery | Module plan, task brief, backlog audit | Record | Extended | A task is executed outside the plan; an audit changes planning | A section of the plan |
| Specification | SPEC | Description | Core | The executor would otherwise invent material behavior, a contract, or a migration | Acceptance in the task |
| Implementation | Code, tests, living documentation, development log | — | — | Always for a change of behavior | Development log in the PR, task, or handoff |
| Acceptance | Validation record | Record | Core | A post-merge or target-environment result is needed by future work | Evidence in the task or PR |
| Learning | Retrospective | Record | Extended | A full retrospective or a systemic failure | A targeted analysis in the task |
| Navigation | Module index | Description | Extended | The project is divided into modules | Navigation in the profile |

A new fact returns to the narrowest owner according to the
[feeding-back rule](02-lifecycle.md#feeding-information-back). A document is
changed by the owner of its stage; an executor of another stage proposes a
change rather than silently editing someone else's decision.

## Documents by risk level

The risk level is determined according to [chapter 01](01-authority-and-scope.md#materiality-and-rigor).

| Risk | Default documents |
| --- | --- |
| Low | Stage artifacts are neither created nor changed; a record in the task or handoff. Living documentation follows its own rule |
| Medium | An edit to the current description (SPEC; PRD or architecture brief when their area changes) or an entry in the delivery plan. A new significant technical choice gets a decision record |
| High | An accepted SPEC and a decision record before production code; an architecture delta when system boundaries change |

Regardless of the risk level, a change to an accepted requirement edits the
PRD or the baseline decision with the product owner's acceptance.

## Identifiers

Links between documents use IDs: a file name may change, an ID does not. The
prefix and numbering scheme is set by the profile; by default see the
[defaults](../defaults/documentation.md#numbering).

The ID of a new document is provisional until the document is merged into the
integration branch. The number is taken from a fresh base. If two branches
took the same number, the document merged second is renumbered: it is still
in `draft`, and no accepted documents link to it. Renumbering updates the
links within the same branch. The uniqueness of new IDs is checked before
merge ([integration](07-integration.md#candidate-freshness)).

Internal IDs of requirements and criteria are local to their document.
Simultaneous editing of one document by different executors is serialized by
the plan ([agents](12-agents.md#ownership-and-parallelism)).

## Statuses and acceptance

| Status | Meaning | Transition |
| --- | --- | --- |
| `draft` | The document or its change is in progress | → `accepted` after review and the owner's decision |
| `accepted` | The current source for dependent work | → `superseded`, `deprecated`, or `archived` |
| `superseded` | Replaced; `superseded_by` names the successor | Final |
| `deprecated` | No longer applies; a replacement is named or explicitly absent | → `archived` |
| `archived` | Kept as history, or completed (a plan) | Final |

A status describes the lifecycle of the document, not the readiness of the
product. Acceptance is the decision of the class owner named in the profile,
after review according to the risk route ([verification](06-verification.md)).
The acceptance record contains the date, who accepted, and a link to the
decision, PR, or message.

The author does not accept their own document. In the `solo` mode
([team composition](12-agents.md#team-composition)), the owner may accept a
document that an agent prepared on the owner's instruction; this is recorded
in the same way. An agent does not move a document to `accepted` on its own
judgment.

Dependent work relies on `accepted`. Research, preparation, and review are
permitted on a `draft`; implementation against a `draft` only if the
assignment directly permits it, and this is stated in the handoff. The
`accepted` status of a derived document does not prove agreement with the
primary source.

Changing an accepted document:

- description, clarification without a change of meaning — an edit and a
  change note;
- description, material change — an edit in the task that owns the change, a
  change note, and acceptance of the changed part; until acceptance,
  dependent work relies on the previous revision;
- record — a new record with a supersession link; the previous one gets the
  status `superseded`;
- an obsolete document of either kind — `deprecated` or `archived` with a
  link to the replacement.

Do not rewrite history silently. A link to your own new document does not
authorize it to extend the original task.

## Persistence rules

Save an artifact in the repository if:

- future executors must read it before implementation;
- it is the source of truth for scope, architecture, order, behavior, or verification;
- it records a significant accepted decision;
- it contains a task that will be executed outside the current PR;
- it changes how future work is verified, accepted, or sequenced.

Keep the result transient if it is:

- a one-off review comment;
- a list of the commands of the current PR;
- a low-risk architecture check without future consequences;
- a self-check or development log of a single task;
- a repetition of what is already in a canonical artifact.

Move transient evidence into a persistent document if it revealed:

- a discrepancy with product, architecture, delivery, specification, or baseline;
- a post-merge verification result that future work needs;
- a recurring process failure;
- a security, data, operations, or rollback risk;
- a decision that will need to be revisited.

An ordinary PASS does not require a separate report if the scope, reviewer,
and verdict are already saved in the handoff.

## Module index

If the project is divided into modules, a module index links all of a
module's artifacts. The index contains the module's scope, current state, and
links to the current descriptions and important records; requirements and
decisions are not copied into it. The form is in the
[template](../templates/module-index.md). The index is updated by whoever
creates, accepts, or replaces an artifact of the module.

## Living documentation

Living documentation describes the system as it is now: package and module
READMEs, `CONTRIBUTING.md`, runbooks, the environment contract, API
reference, user documentation, release notes. The owner and location of each
class are set by the profile.

A change updates living documentation in the same task if it changes:

- an install, run, check, or release command;
- a configuration parameter or secret (name, type, whether required);
- a public contract, error, or data format;
- user-observable behavior described in the documentation;
- an operational procedure, precondition, or recovery method.

If none of these conditions holds, the line "living documentation: reviewed,
not affected" in the handoff is enough. Generated documentation is updated by
the standard generator, not by hand-editing the output. An outdated
instruction is fixed or explicitly marked; a contradiction with the code
counts as a defect.

Commands and promised results are verified in the required version and
environment; lint and working links do not prove that an instruction is
actually correct.

## Form by the reader's task

- A tutorial helps a newcomer walk a verified path with a visible result.
- A how-to solves a specific task with preconditions, steps, and an outcome.
- A reference describes the exact contract, constraints, and errors.
- An explanation explains relations, reasons, and trade-offs.
- An overview links these forms and leads to the owners.

This is an editorial organization, not an obligation to create four folders.
A mixed document is split only when this improves the reader's work.

## Language and text

Before the first draft, choose the language mode according to the profile:
communication, project prose, UI/API/email, source quotes, and technical
identifiers. Write ordinary prose in the required language from the start; a
final language pass verifies this step but does not replace it.

Write directly: first the result, then the reason and the necessary evidence.
Prefer a concrete actor, stable terms, and short sentences. Keep conditions,
exceptions, and uncertainty. A table is useful for comparison, a list for
sequence; do not break up a connected thought for the sake of formatting.

Technical names are not translated arbitrarily. User-facing copy belongs to
[its owner](11-ui-and-design.md), not to a shared documentation catalog.

## Updates and drift

New knowledge changes the narrowest correct artifact. First change the owner
of the rule, then the related links, navigation, module indexes, templates,
and affected consumers. Do not create a second version of a rule in a
root/local AGENTS file or in an issue.

A transient finding becomes persistent according to the
[persistence rules](#persistence-rules).

## Messages and external status

The development log keeps decisions, assumptions, deviations, gaps found in
product/architecture/spec, failures, checks, and the next step. It lives in
the PR, task, or handoff. A second-by-second log of commands is not needed.
During long work, report a material result, uncertainty, and what is being
checked next.

The final report is self-contained: result, scope, checks, links,
limitations, and any unfinished obligation. If only a supporting artifact has
been proven, state this directly; special labels are needed where confusion
would otherwise arise.

An external status selects safe results that the reader can understand. Do
not publish internal issue bodies, raw logs, correspondence, or personal data
as customer evidence. A progress report does not replace runtime acceptance.
Publishing and sending a message require existing authority for the exact
audience and content.

If the status is built from an external tracker, check its freshness after
the last affecting mutation according to the [closure rules](04-task-management.md).
A report file, a successful build, and an actual publication are separate claims.
