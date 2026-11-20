# Solo decisions awaiting confirmation

The owner chooses classes and a pending limit in the [profile](../PROJECT-PROFILE.md#roles-and-independence). For `established_ui`, follow an existing screen for an unspecified internal layout detail. Cite the screen. For `generic_error`, reuse a generic message that discloses no data. Cite the applicable wording or convention. Choose pending merge permission separately for each class. Omitted classes have no delegated authority.

Exclude irreversible actions, external effects, security, access rights, personal data, public contracts, migrations, dependencies and customer commitments. Record any applicable exclusion in the proposal. When the evidence does not establish a single class, mark the scope ambiguous. The agent continues independent work.

## Set up the decision register

Use the installed `methodology-solo` on a trusted coordinator. Keep its profile and ledger outside candidate worktrees. Create a private ledger directory (0700). The decision owner prepares a separate approvals file, initially containing `[]`, in an owner-controlled directory. Give the coordinator read access to that file and the profile. Run the proposing agent and candidate under a different account or on an isolated host, with no write access to the profile, approvals file, its parent directory or the ledger. Only the trusted coordinator runs ledger commands on their behalf. The policy's owner UID is the default receipt-source UID. Set numeric `approvals_owner_uid` when the decision owner uses another account. The installer checks the directory and regular file owners, permissions and link count; a proposal or stdin payload cannot act as an owner receipt.

Run `methodology-solo install-batch PROFILE` before first publication and when upgrading an existing ledger. It validates the complete owner-authored file and commits all receipts together. A failed validation preserves the existing batch. A committed batch with a metrics error returns its installed count and `metrics_sync: "pending"`. Run the summary after fixing the metrics source. A prepared file becomes effective only after a successful install. Keep the profile at one stable inode throughout active operation; gate readers and every mutation take a Linux file lock on that inode. Stop the coordinator and all publishers before replacing the profile on disk.

```json
{
  "repository": "example/project",
  "branch": "integration",
  "pending_limit": 2,
  "ledger": "/private/coordinator/decisions.sqlite",
  "approvals": "/private/owner/approvals.json",
  "classes": {
    "established_ui": {"allow_merge": true},
    "generic_error": {"allow_merge": false}
  }
}
```

For automatic metrics, add `"metrics":{"profile":"/private/metrics.json","sources":{"T1":"ops"}}`. Each source is bound to the corresponding task. The coordinator records application, confirmation and reversal at their original timestamps. Retrying a command reconciles the journal with the durable decision. The journal receives technical identifiers and classes. The decision register holds the wording and alternatives.

## Apply a default

Send a proposal to `methodology-solo propose PROFILE` on stdin. The following example illustrates the required fields.

```json
{"id":"D1","task":"T1","decision_class":"generic_error","scope":"certain","exclusions":[],"choice":"Use the existing generic save error","basis":"Staff editor, save form §2","alternatives":"Showing the raw error could disclose data","reversal_cost":"Change one string and its assertion","dependent_work":"Editor feedback on PR 8","impact":"Internal staff screen, stored data unchanged","next_action":"implement"}
```

The coordinator checks the agent's classification against the source before submission. `next_action` is `investigate` or `implement`. A successful proposal returns its digest. An ambiguous, excluded, unselected or over-cap proposal returns exit 1 with its reason and remains visible as held. A held proposal can be submitted again after capacity becomes available. A reused ID with different content returns exit 2. Submitted decisions remain associated with their tasks.

Bind every affected task to its exact PR revision using `methodology-solo bind PROFILE TASK PR HEAD`. A task with no decisions still needs an authenticated binding when the gate is enabled. Rebind every affected task after a head change. A standalone `methodology-solo gate PROFILE REPOSITORY BRANCH PR HEAD` reads the installed decision and returns a point-in-time answer.

For a train, configure `mergeGate` as the absolute installed binary, `gate`, and the trusted profile. The train holds that profile's shared lock from the first final PR check through the target update and readback. Proposal, binding and owner installation acquire its exclusive lock. Exit 75 means the other operation holds the lock. Retry after it finishes. If the owner installation succeeds first, the new decision governs the merge. An installation attempted during publication returns busy; it can succeed after publication.

For an ordinary integration, the authorized publisher holds the same shared lock across both the gate and the actual Git operation. The following example illustrates one PR on a protected target with an immutable source head. Supply the verified repository, base, candidate, PR and head plus the approved solo entry point and policy in the named environment variables. App credentials belong to the trusted publisher.

```sh
flock --shared --nonblock --conflict-exit-code 75 --no-fork "$SOLO_PROFILE" \
  sh -eu -c '
    "$SOLO_BIN" gate "$SOLO_PROFILE" "$REPOSITORY" "$BRANCH" "$PR" "$HEAD_OID"
    git merge-base --is-ancestor "$HEAD_OID" "$CANDIDATE"
    git merge-base --is-ancestor "$EXPECTED_BASE" "$CANDIDATE"
    exec git push "--force-with-lease=refs/heads/$BRANCH:$EXPECTED_BASE" \
      "$APPROVED_REMOTE" "$CANDIDATE:refs/heads/$BRANCH"
  '
```

Check each included PR under the same lock for a batch. Preserve the project's other mandatory checks and read back its final ref and PR states. A gate exit of 1 holds the merge and exit 2 requires correction of the policy or its inputs.

## Confirm or reverse in a batch

Run `methodology-solo summary PROFILE` for the morning report, also on projects without a train. Share pending and held choices, scope, cost, consequences, and dependent work with the decision owner. Give a recommendation and the consequence of each alternative. State what confirmation permits.

The owner confirms each exact digest or changes the choice and opens a rework task. Transfer the outcome to the owning document and cite the owner's actual response. Keep previous receipts when atomically replacing the owner-authored source file. Run `methodology-solo install-batch PROFILE` and check for exit 0 before telling the owner that the decision took effect. For example, an approved receipt has `id`, `digest`, `status:"confirmed"`, `at` (UTC), `owner_source` and `document`. A reversal uses `status:"changed"` and also identifies the owner's `choice`, `rework` and the `superseded_head`. The gate holds the dependent merge until the owner records the separately checked replacement commit as `verified_head` and the coordinator binds it to the PR. Run the summary after each installed batch to read its outcome and reconcile metrics.
