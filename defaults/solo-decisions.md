# Solo decisions awaiting confirmation

The owner chooses reversible decision classes and the pending limit in the
[profile](../PROJECT-PROFILE.md#roles-and-independence). For `established_ui`,
follow an existing screen for an unspecified internal layout detail and cite
the screen. For `generic_error`, reuse the applicable generic message that
discloses no data and cite its source.

## Apply a default

Act within the delegated class and the pending limit. Exclude irreversible
actions, external effects, security, access rights, personal data, public
contracts, migrations, dependencies and customer commitments. For an
unselected class, exclusion, ambiguous scope or full register, ask the owner
in the project conversation. Explain the decision and the consequences of
the alternatives. Continue other permitted work while waiting.

Keep the decision, basis, alternatives, reversal cost, dependent work and
impact in the project's register. Use its existing format or the optional
local command. For the command, use a private ledger directory (0700).
In a workspace-write session, choose an ignored writable directory for
local notes, such as `.methodology/solo/`. Keep its policy at a stable path
and give the policy mode 0600. A shared-account example follows.

```json
{
  "repository": "example/project",
  "branch": "integration",
  "pending_limit": 2,
  "ledger": "/absolute/path/to/worktree/.methodology/solo/decisions.sqlite",
  "classes": ["established_ui", "generic_error"]
}
```

Submit the proposal to `methodology-solo propose PROFILE` on stdin.

```json
{"id":"D1","task":"T1","decision_class":"generic_error","scope":"certain","exclusions":[],"choice":"Use the existing generic save error","basis":"Staff editor, save form §2","alternatives":"Showing the raw error could disclose data","reversal_cost":"Change one string and its assertion","dependent_work":"Editor feedback on PR 8","impact":"Internal staff screen, stored data unchanged","next_action":"implement"}
```

Use `investigate` or `implement` for `next_action`. A held proposal returns
exit 1 and its reason. Reuse its ID when capacity becomes available. A reused
ID with different proposal content returns exit 2. Run
`methodology-solo summary PROFILE` to see pending and held choices.

## Record the owner's reply

A normal chat reply settles the question. Record the choice and a reference
to that message in the register. Update the owning document and dependent
work. If the owner changes a choice, retain the earlier answer and verify
the correction on the affected revision. With the optional command, pass
the answer on stdin. The command finds the original proposal and records
the time. The owner gives the answer once.

```sh
printf '%s\n' '{"id":"D1","status":"confirmed","owner_source":"Project chat, message 14"}' |
  methodology-solo answer "$profile"
printf '%s\n' '{"id":"D1","status":"changed","choice":"Use the revised save message","owner_source":"Project chat, message 22"}' |
  methodology-solo answer "$profile"
```

The example shows a later correction to the first reply. The summary shows
the current choice and the message history. Replaying a message preserves
the later correction. The local register supports implementation and
handoff. For sensitive publication, the authorized publisher uses the
project's existing protected PR approval or required check for the exact
revision. Running the local file gate on a shared account holds publication.

## Existing independent coordinator

Projects that already operate an isolated coordinator can keep a supplemental
decision gate alongside their protected integration checks. Keep candidates
and agents outside the coordinator's policy, ledger and owner inbox. Use the
existing decision owner's protected policy and approvals file. Both files
and their immediate directories must have that owner's actual UID. Publish
them as regular single-link files readable by the coordinator. Keep the
directories and files free of group or other write permission. The
coordinator must have a different effective UID and no write access to
either file or parent directory. Its own ledger directory must have mode
0700. Use the ordinary chat procedure on a one-account project.

In this policy, add the absolute `approvals` path and the explicit numeric
`approvals_owner_uid`. Configure each selected class as
`{"allow_merge": true}` or `{"allow_merge": false}` inside a `classes`
object. The setting governs pending delegated choices for that class.
The coordinator checks the actual file ownership and access on batch
installation and at publication.

1. Initialize the protected approvals file with `[]`. Run
   `methodology-solo install-batch PROFILE`. When upgrading a 5.0.0 ledger,
   independently verify the intended batch and install it again. The earlier
   receipts remain in the database as historical records. The gate holds
   until the verified batch is installed.
2. Bind every affected task to its exact PR revision using
   `methodology-solo bind PROFILE TASK PR HEAD`. Bind tasks without decisions
   too. Rebind after the head changes.
3. For an owner's confirmed choice, include `id`, proposal `digest`,
   `status: "confirmed"`, UTC `at`, `owner_source` and the owning `document`
   in the batch. A reversal has `status: "changed"`, `choice`, `rework` and
   `superseded_head`. It holds the affected PR until the owner records the
   separately verified replacement as `verified_head` and the coordinator
   binds that head. Keep previous receipts when replacing the owner file
   atomically and run `install-batch` to commit the updated batch.
4. The authorized publisher runs `methodology-solo gate PROFILE REPOSITORY
   BRANCH PR HEAD` for each included PR. It holds the profile's shared Linux
   file lock across final checks, the Git update and readback. The train
   supports this through `mergeGate`. Writers take the exclusive lock.
   Exit 75 means another operation holds it. Retry after that operation
   finishes. Stop publishers and the coordinator before replacing the
   profile inode. The gate holds if the protected source is missing,
   unreadable, inconsistent, or has lost its independent ownership.

For optional coordinator metrics, add
`"metrics":{"profile":"/private/metrics.json","sources":{"T1":"decisions"}}`
with a trusted direct metrics source bound to the task. The coordinator emits
the application and installed receipt timestamps. The decision register
retains the wording. A committed batch with a metrics error reports
`metrics_sync: "pending"`. Run the summary after restoring the collector.
