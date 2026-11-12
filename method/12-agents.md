# Agents, roles, and coordination

Applies when AI agents are used and work is delegated. The same ownership and
verification boundaries are useful for a team of people. The prototype does
not require a specific model, product, or mandatory parallelism. The default
skill set, its installation, and replacement are described in
[skills](15-skills.md).

## Choosing the work and the tool

The main executor first establishes whether delegation is permitted and
whether separate work is needed. A short search is usually cheaper to do
yourself. A helper is useful for a bounded result, context isolation, or a
mandatory independent check, when the coordinator can continue other useful
work.

Before a new launch, check the existing helpers: currency of their context and
profile, whether they are busy, and their independence. Do not create a
duplicate just because a name is taken. Distinguish the executor from the
auditor: preparing a decision or fixing code remains execution even under the
role name `review`.

The profile sets the permitted models, reasoning, concurrency, and budget. The
choice matches the complexity of interactions and the uncertainty, not the
number of files. Check the actual launch settings; the text of the task does
not replace a technical parameter. Unavailability of a mandatory profile is
reported explicitly, without silent substitution. Slow CI is not by itself a
reason to switch the model.

Skills are used according to the question being solved. Read the current
instruction, use its tools within the permitted boundary, and report that you
used it. The availability of a skill does not require a separate agent or an
additional audit. A conflict with a direct assignment is resolved by the
instruction hierarchy, not by the executor's convenience.

## Team composition

The working mode is set in the [profile](../PROJECT-PROFILE.md#roles-and-independence).

**`solo`** — one human owner and agents. The stage roles are combined in the
owner. Review independence is ensured by a separate executor or agent context
without the author's history. The owner may accept a document prepared by an
agent on the owner's instruction; the acceptance is recorded in the usual way.
If the owner is unavailable, work that requires the owner's decision waits;
the rest of the permitted work continues.

**`team`** — several people. For each role the profile names an owner, a
deputy, and a response time. Rules:

- The author does not accept their own document and does not give the final
  review verdict on their own work.
- If the owner has not responded in time, the deputy decides. If the profile
  has named a safe default in advance for a class of decisions, the executor
  may apply it with deferred confirmation; irreversible actions are not
  performed this way.
- A dispute between author and reviewer is resolved by the owner of the
  document class or of the violated rule. The decision and its basis are
  recorded in the owning document, not only in the PR discussion.
- One document is edited by one executor at a time; the order is set by the
  plan or the document owner.
- A new participant reads: the methodology README → the profile → the root
  entry points → the index of their module → the current descriptions of
  their area.

Regardless of the mode, no role makes decisions beyond its authority in the
profile.

## Delegation package

Hand over a minimally sufficient package:

- the exact goal, scope, and expected output;
- the assignment and the owner's important clarifications;
- sources with stable locators and an available snapshot;
- repository/worktree, branch/revision, and the necessary context;
- permitted reads/writes, write set, and prohibitions;
- verification criteria, evidence, budget, and the stop boundary.

Do not copy secrets, mail, or unnecessary data. An independent auditor does
not inherit the author's reasoning history; the auditor reads the primary
sources independently. Passing on the author's full chat is not an
independent review.

## Ownership and parallelism

The coordinator owns the scope, sequencing decisions, integration,
checkpoints, and claims of completion. A helper does not get the right to
publish, merge, stop other people's resources, or extend the task without a
separate basis. Nested delegation counts toward the overall limit and is
permitted only according to the profile; it does not serve as a way around
restrictions.

Writing executors have non-overlapping write sets or an explicit sequence.
Shared contracts, the lockfile, migrations, CI, the methodology, and a single
owning artifact usually require serialization. This order is set in the
delivery plan before tasks start, not discovered at merge. Different
worktrees do not remove a semantic conflict. Runtime resources also have a
separate owner.

The profile sets a limit on the number of tasks simultaneously awaiting an
owner's decision. When the limit is reached, do not start new work that will
require the owner's decision. Continue the work that does not.

A limit is a ceiling, not a target. On a quota or resource incident, reduce
optional parallelism; do not cancel a mandatory independent check and do not
buy resources automatically.

## Receiving the result

Wait for an event when your own work has reached a dependency; avoid frequent
polling. Do not interrupt a mandatory audit for the sake of speed. A helper's
response contains the conclusion, locators, checks, unknowns, and the limit of
the claim, not a log of every command.

The coordinator checks the scope and evidence before integration. Findings do
not become new requirements without authority. After a material delta, pass
on the new version and the changed area; do not repeat an unchanged review
without a reason.

After the work, confirm that the helper has finished and its resources are
cleaned up. `interrupt` does not prove that a slot has been freed or an
external process has finished. If the system does not support closing an
agent, honestly record the observed terminal state and the limitations.

## Context recovery

Before a handoff, a hard stop, or the end of a stage, save a compact
[handoff](../templates/handoff-and-recovery.md): decisions, sources, exact
refs, states, evidence, unfinished operations, and the next permitted step.

After a crash/compaction, first re-read the last material assignments and the
handoff, then check the listed mutable surfaces. A summary helps find facts
but does not replace them. If the history or the necessary state is
unavailable, name the specific gap; do not infer permission from an
assumption.

If the state matches, continue from the stated step without rediscovering all
the accepted sources. A discrepancy makes the affected part stale, and it
must be restored before any mutation. A new message usually refines the
current goal; an accompanying question does not cancel the remaining
permitted work.
