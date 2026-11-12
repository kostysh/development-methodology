# UI, design, and text values

Applies to the user interface and its design artifacts. The concrete editor,
component library, tokens, and languages are set by the project profile. A
mockup creates no product authority and does not prove a runtime
implementation.

## From behavior to presentation

First establish the accepted scenario: actor, reachable entry, actions,
states, result, and applicable failures. Then choose the presentation,
components, and visual direction. Similarity to someone else's screen is not
a source of requirements.

Check four dimensions: structure, components/patterns, visual tokens, and the
standard UX states. For a material change, map source, target, evidence, and
disposition in the existing design handoff. The applicable loading, empty,
error, denied, unavailable, success, and recovery states are derived from the
contract, not added as a new feature for the sake of a checklist.

Functional gaps must be closed before polish. `pending_runtime` can be an
honest handoff status for a mockup, but it is not completion of a UI
capability. Do not create a mandatory mockup for a backend/docs-only task.

## Reuse and sources

Use accepted components/patterns if they fit the task. Treat a missing variant
as a gap and resolve it with the owner; do not create a local copy of an
existing control or a generic library for possible future use.

Distinguish the owners of the design library, runtime components, and tokens.
Reconcile their correspondence without automatically declaring any of them
superior to the accepted behavior contract. When changing a reusable
component, keep stable references/IDs where possible and check the consumers.

An isolated presentational component must not accidentally require app
providers, credentials, or runtime storage. A story/component preview checks
local variants, but not the working of a whole user journey.

Editor formats are handled by a supporting tool. Before publication, tie the
observed state of the editor to the exact saved file and revision. An
export/screenshot or a non-empty file does not by itself prove that exactly
the reviewed variant was published. On a stale state, do not bypass the
format's owner with an arbitrary edit of the binary/source.

## Forms and contract ownership

Reuse the accepted request/response contract or its safe projection. Do not
create a second domain schema with a different meaning. Client validation
improves feedback, but the server/data boundary enforces its rules again.
Field errors are tied to fields; a non-field error gets a separate clear
message. Editable fields and partial/full update follow the accepted
specification.

Check reactive changes of enabled/disabled, validation, navigation, and async
state. Tests wait for the causal observable of an action: a control, URL,
response, or cache result. A random re-render, `sleep`, and an unrelated
network request are not a reliable wait. Finish timers, listeners, DOM/cache,
and unclosed async resources after each test.

## Proportionate UI evidence

| Change | Required check |
| --- | --- |
| Only text, color, or spacing without a change in behavior | Real viewing of the affected states at the applicable screen sizes; no new interaction/accessibility impact; mandatory package gates |
| Handler, navigation, validation, form submit, async/recovery, accessibility semantics | A reproducible scenario browser test and a direct walkthrough of the same path; applicable network/console and persisted-state checks |
| End-to-end path across roles/API/storage/provider | A real agreed path of one record in the required environment, independent sessions, and an authoritative reload |

If spacing/color changes contrast, focus, reading order, or hit target, the
change is no longer only visual. A full UI inventory and a full journey suite
are needed for the corresponding scope/risk, not for every typo. Screenshots,
unit tests, and API interception do not replace interactive evidence.

## Text and languages

Before drafting, determine the class of text and its language: UI,
user-facing API message, email, documentation, source quote, technical
identifier, or diagnostic. Technical keys/routes/status values are not
translated together with prose.

User-facing copy is stored next to the owner of the behavior, in an agreed
place, separate from complex logic. A shared module is needed only for truly
shared strings. A global catalog or runtime i18n is created on an accepted
need, not as a side effect of extracting strings.

Do not use an OpenAPI description or an internal diagnostic as accidental UX
text. Check the actual display of errors and the preservation of the response
shape. Source quotes keep their original language; the surrounding
interpretation follows the project language. Evidence uses safe
synthetic/masked data.
