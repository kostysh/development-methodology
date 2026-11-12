# Sources, authority, and the boundary of work

This section owns the general rules. Concrete roles, sources, languages, and
permissions are defined by the [profile](../PROJECT-PROFILE.md).

## Outcome and authority

Before non-trivial work, name: the assignment, the expected result or the
invariant to be preserved, the consumer, the verifiable boundary, the permitted
changes, and the non-goals. A result can be behavior, a proven conclusion, or a
requested document. Do not present support for a future feature as a working
feature.

Check the current instructions and decisions already made. Do not ask again
for an action that is already permitted. Analysis does not authorize
implementation; an edit does not authorize publication. A broader direct
assignment may cover several stages in advance. An explicit stop and agreed
checkpoints remain in force.

Choose routine reversible mechanics yourself. Pass a material unresolved
question to the owner before dependent actions; continue the rest of the
permitted work. Do not create a new approval gate out of your own
interpretation of a recommendation. If a rule stops the work, state its exact
source, content, applicability, and the condition for continuing.

## Owners of truth

| Decision | Owner |
| --- | --- |
| Obligation of the customer, the contract, or the initiator | Accepted primary materials and the decisions of the authorized owner |
| Goal, users, scenarios, priorities, and product scope | Accepted product brief / PRD |
| System boundaries, constraints, and technical choice | Architecture and accepted decisions |
| Behavior, states, errors, public/data contracts | Specification |
| Slices, dependencies, and order of work | Delivery plan and task brief |
| The result that actually works | The real implementation and evidence from the required environment |
| Process rules | The canonical methodology section and the accepted profile |
| Navigation | AGENTS files, indexes, and the tracker; they link to the owners |

This is a division of authority, not an unconditional ranking of files. Code
shows actual behavior but does not override an accepted requirement. A mockup
helps imagine the interface but does not create a new scenario. The `accepted`
status of a derived document does not prove agreement with the primary source.

Record a contradiction with exact references to both sides. Do not pick the
convenient reading. Keep the original baseline; formalize a change of an
obligation as a separate accepted decision with a boundary, consequences, and
a supersession history. For a project without a contract the initiator may be
the primary owner; do not invent a fictitious customer or contractual process.

## Completeness and semantic traceability

Before claiming completeness, bound the set of sources. In an existing working
document, list the material and its material blocks, the date, currentness,
availability, authority, conflicts, and the grounds for inclusion/exclusion.
Reconcile the blocks with the actual content, tables, attachments, and messages.

Statements that have been read keep their conditions, exceptions, modality,
values, and relations. Every material statement receives an outcome:
requirement, decision, check, conflict, accepted defer, or a justified
`not_applicable`. Assign an owner to every open action.

Check both directions: source → decision/requirement → task → evidence, and
every material derived requirement → its exact accepted original basis. For a
derived requirement, explain its applicability, necessity, and removal
condition: which obligation would stop being met if it were removed.

Security, architecture, law, and operations may set obligations in their own
area. If they change a product scenario or acceptance, agree this with the
product owner. A document created within the current chain of work cannot by
itself authorize extending that same chain.

The number of rows and the absence of empty cells do not prove completeness.
An unread or disputed material source leaves the affected conclusion
incomplete. Reuse accepted traceability after checking that it is current; a
new source reopens only the affected area.

## Materiality and rigor

A choice is material if it changes observable behavior, a public/data
contract, permissions, privacy, monetary rules, a provider, deploy/recovery,
authority, or the acceptance boundary. A significant `unknown` requires
research or an owner's decision; it must not be treated as a safe `no`.

| Risk | Indicators | Route |
| --- | --- | --- |
| Low | Local, reversible, clear result, material boundaries do not change | Assignment, narrow check, and mandatory gates |
| Medium | Several parts, coordination, or a noticeable regression risk | A ready contract, dependencies, self-check, and one independent review; an additional review subject only on a named trigger |
| High | Permissions, data, money, external effects, hard-to-reverse change | Accepted decisions, negative acceptance, independent checks, and recovery |

Triggers for an additional review subject: permissions, secrets, or a trust
boundary — security; schema or existing data — data and migrations; personal
data — privacy; new interactive behavior — UI. The absence of a trigger is
recorded in one line, not by a separate review.

The materiality of a choice determines who owns the decision, not the depth of
the route. A change of observable behavior within an accepted contract does
not by itself move the task to the next risk level.

The shortened route is permitted only when all low-risk indicators hold at
once, the owner is clear, and isolation and acceptance are in place, and there
is no stricter direct requirement. It does not cancel a mandatory gate. The
size of a diff does not reduce risk. A change to UI behavior, to a document's
authority, or to an end-to-end scenario additionally switches on the
corresponding methodology section.

## Change closure

For a material change, review all classes: product, architecture,
specification, plan/tasks, design, code/data, tests/evidence, living
documentation, tracker, published status. Record the result only for the
affected ones; the rest are confirmed with one line "reviewed, not affected".
A full table with the owner, the result `changed`, `verified_unaffected`, or
`blocked`, and the basis for each class is needed for high-risk work and for a
change to an accepted requirement.
The form is in the [decision template](../templates/decision-and-change.md).

Search by old and new names and IDs, not only within the chosen diff. For a
value that passes through several layers, trace input → normalization →
persistence → projection → consumer → authoritative reload. A missed required
surface or `blocked` forbids acceptance of the dependent result.

The overall project goal helps detect a pointless or insufficient task, but it
does not grant the right to add neighboring features. Prefer the most direct
solution that fully preserves the accepted obligations.
