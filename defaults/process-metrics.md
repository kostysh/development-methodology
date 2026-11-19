# Process metrics event contract

**Schema version 1.** Use this reference to choose event sources and assess
their coverage. Record project choices
in the [profile](../PROJECT-PROFILE.md#process-metrics). Use the comparison rules
in [chapter 14](../method/14-learning-and-recovery.md#effectiveness-check).

## Questions to answer

- Where does calendar time go between execution starting and the first linked PR
  opening? How much of this interval contains operator activity, agent activity,
  machine occupancy, or a verified block? Which intervals remain unexplained?
- How long does work take to reach acceptance? Which decisions, audits, tests,
  CI attempts, ref rewrites, and compactions contribute to the elapsed time?
- How much work does one accepted task consume, including automated permission
  reviews and input, cached input, and output tokens? Which controls activate?
- How much test disagreement and corrective work follows, and does the same
  quality outcome hold on comparable tasks?

## Journal format

Append one JSON object per event to a local JSON Lines journal. Version `1`
uses the following envelope. The event table is the allowlist for `data`.

| Field | Type and meaning |
| --- | --- |
| `schema_version` | Integer `1`. |
| `project_id`, `event_id`, `source_id` | Opaque strings. The source identifies one configured producer or adapter. The event ID identifies one occurrence within the project. |
| `event_type` | One event name from the table. |
| `occurred_at`, `observed_at` | UTC RFC 3339 timestamps. `occurred_at` describes the underlying transition, such as when work becomes blocked or can proceed again. Use `null` when the source cannot establish it. `observed_at` is when the adapter received or found the event. Label durations based on receipt times as estimates. |
| `actor_role` | `operator`, `agent`, `automation`, or `unknown`. |
| `task_id` | Stable task key as an opaque string, or `null` when attribution is unavailable. |
| `data` | Object containing only the fields listed for this event. |

Use project-issued opaque IDs or a restricted mapping from verified provider
identities. Keep raw locators and arbitrary input strings out of stored events
and diagnostics, including rejected values. SHA fields contain full Git object IDs.
Durations in milliseconds, counts, step numbers, and attempts are non-negative
integers. Exit codes are integers. `blocking` is Boolean. An `_at` suffix uses
the timestamp format above. Other categorical values use enumerations in the
table or a bounded vocabulary accepted in the profile. This includes model
names, suite, subject and operation types, and structured outcome codes. Fill
applicable fields only from evidence. Use `null` for an applicable field with
no evidence and omit fields that do not apply. Leave metrics unavailable when
an identity needed for their join is missing. Reports distinguish `complete`, `partial`,
`unavailable`, and `not_applicable` coverage by source, metric, and time window.
Count zero only over a window with adequate source coverage. Preserve positive
counts as lower bounds when the stream is incomplete.

Keep the journal and any ID mapping or read checkpoints outside task worktrees.
Resolve paths and source locators locally. Keep them in the source configuration
or a restricted mapping outside the journal. Exclude user and model text,
commands, tool arguments and results, email, credentials, URLs, file paths and
contents, environment variables, and headers. Map inputs to approved action types
before writing. Keep computed scores out of agent context. If collection fails,
record the coverage gap and continue task execution.

## Event types and fields

Paired events carry the same operation ID and the identifiers needed to join
them. A terminal event adds the stated outcome fields. A source may observe a
terminal event without its start.

| Metric | Events and `data` fields | Source and interpretation |
| --- | --- | --- |
| Task timing and attribution | `task.started`, `task.accepted` — `issue_id`, `worktree_id`, `execution_started_at`. Start adds `session_id`, `thread_id` for the initial binding. `task.switched` — `session_id`, `thread_id`, `previous_task_id`, `worktree_id` of the new task. `task.thread_bound` — `session_id`, `thread_id`, `worktree_id` when a separate thread joins an existing task. | The task owner or coordinator records actual execution start, thread assignments, switches, and acceptance. The event's `task_id` on a switch is the new task. Card creation and the first commit give other milestones. |
| PR timing | `pull_request.opened`, `pull_request.merged` — `repo_id`, `delivery_id`, `head_sha`. For merge also `merge_sha`. | Read from GitHub or the integration provider. Bind each delivery to the task. Attribute the pre-PR interval to the first linked PR opening after execution starts. Record a PR that was already open as such. |
| Activity and occupancy | `activity.started`, `activity.finished` — `operation_id`, `activity_type` (`operator`, `agent`, `machine`), `resource_id`, `action_type`. Finish adds `outcome`. | Use explicit operator actions or intervals, harness request or tool intervals, and runner or resource intervals. Report timestamps without a measured duration as point events. |
| Decisions and interventions | `decision.requested`, `decision.blocked`, `decision.resolved` — `decision_id`, `operation_id` of the dependent work. Request adds `blocking`. Resolution adds `outcome`. `operator.intervened` — `intervention_id`, `intervention_type` (`decision_request`, `correction`, `assignment`, `status_question`), `blocking`, `decision_id` when related. | Link an intervention to its request when both describe the same occurrence. Mark the start of a verified block, which can occur after the request. Resolve it when dependent work can proceed, even if a human reply arrives later. Independent activity can overlap the block. |
| Audits | `audit.started`, `audit.finished` — `audit_id`, `prior_audit_id`, `subject_id`, `subject_type`, `base_sha`, `head_sha`, related `rewrite_id` when known. Finish adds `outcome` (`completed`, `failed`, `cancelled`) and `verdict` when an audit produced one. | Read the audit procedure and its report. Count attempts, failed attempts, completed rounds, and distinct reviewed snapshots by subject and base/head. Distinguish a completed audit with a failing verdict from an audit that failed to produce a verdict. |
| Findings | `audit.finding.recorded` — `audit_id`, `finding_occurrence_id`, `observation_id`, `cause_id`, `finding_type` (`a`, `b`, `c`, `d`). | Read finding types from the [finding closure rules](../method/06-verification.md). A repeated observation in another audit gets a new occurrence ID and keeps the same observation ID after reconciliation. Use a cause ID only when the evidence establishes a common cause. |
| Tests and end-to-end runs | `test.started`, `test.finished` — `suite_id`, `attempt_id`, `checkout_sha`, `worktree_id`, `ci_job_id` when hosted by CI. Finish adds `duration_ms`, `outcome`, `exit_code`. | Use the actual runner. Record a cancelled or interrupted attempt as such, including when no exit code was captured. Count the runner attempt once, even when several tools launch, poll, or report it. |
| Train attempts | `train.observed` — `train_mode`, `train_result` and the optional counts and durations in [train observations](#train-observations). | Normalize an approved terminal receipt or lock skip. Bind the source to the issued alias for the pilot. |
| CI runs, jobs, and steps | `ci.run.started`, `ci.run.finished` — `repo_id`, `run_id`, `run_attempt`, `head_sha`. `ci.job.queued`, `ci.job.assigned`, `ci.job.started`, `ci.job.finished` — those run identifiers plus `job_id`. Run and job finishes add `outcome`. `ci.step.finished` — run and job identifiers, `step_number`, `started_at`, `outcome`, `failure_code`, `fixture_version`. | Read job and step times and terminal status from the provider. Use ordered step numbers within each job to identify its first failure. Get its allowlisted code and fixture version from structured runner output. Emit queue and assignment timestamps when the provider or runner supplies their actual meaning. A job start can bound assignment time without identifying it. |
| Ref rewrites | `ref.rewritten` — `repo_id`, `ref_id`, `old_sha`, `new_sha`, `operation_type`. | Use an observed Git update. Leave `operation_type` missing when the before and after IDs establish a rewrite and the operation is unavailable. The resulting audit's `rewrite_id` refers to the rewrite's `event_id`. Check the audit's head against the updated snapshot. |
| Compaction and recovery | `context.compacted` — `session_id`, `thread_id`, `turn_id`, `compaction_id`, `trigger` (`manual`, `auto`). `task.state_changed` — `operation_id`, `action_type`, `session_id`, `thread_id`, `turn_id`, `compaction_id` when part of recovery. | Emit one event per completed compaction. A plan step transition or actual task mutation can supply the first state change. Reading state or polling a runner alone leaves the task state unchanged. Calculate time and observed token use between these boundaries. Mark usage partial when a response straddles a boundary and its attribution is unresolved. |
| Context transfer | `session.forked` — `session_id`, `thread_id`, `source_thread_id`, `source_turn_id` at the copied boundary when known. `session.child_started` — `session_id`, `thread_id`, `parent_thread_id`, `parent_turn_id`. | Record the relationship and the inherited boundary. Attribute the child's own new work once, using root or parent turn correlation. Do not charge copied history as additional requests. |
| Tokens | `model.usage` — `provider_id`, `session_id`, `thread_id`, `turn_id`, `root_turn_id`, `parent_thread_id`, `response_id`, `model`, measured request `duration_ms` when available, `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`. | Use per-response usage from the provider or a source with equivalent attribution. Keep ambiguous uses unassigned. See normalization below. |
| Automated permission reviews | `permission.review_started`, `permission.review_finished` — `review_id`, `session_id`, `thread_id`, `turn_id`. Finish adds `outcome`. | Use a review lifecycle source. A request for permission, policy denial, and automated review are separate events. Count distinct review IDs and measure review time separately from operator wait. |
| Guard activations | `guard.activated` — `control_id`, `attempt_id`, `operation_id`, `head_sha`, `outcome`. | The guard emits an event when it evaluates its configured rule and reports the result. Use the attempt key once per control and report activations and blocking outcomes separately. |
| Test disputes | `test.dispute_raised`, `test.dispute_resolved` — `dispute_id`, `test_id`, `criterion_id`, `baseline_sha`. Resolution adds `outcome`. | Use the dispute procedure and count distinct raised disputes. Repeated discussion of the same dispute keeps its ID. |
| Seven-day rework | `delivery.follow_up_classified` — `delivery_id`, `follow_up_id`, `follow_up_at`, `follow_up_basis` (`verified_action`, `pr_opened_proxy`), `change_type`, `corrects_delivery` (Boolean). | Use structured GitHub and Git facts and a confirmed purpose classification. Count each distinct corrective follow-up in the seven-day interval. A later edit to the same file alone leaves the relationship unconfirmed. |

### Correlation and reporting

- Scope task, provider, and resource identifiers before joining. Resolve
  `task_id` at occurrence time using explicit task and thread links, task
  switches, and parent or root turn lineage. Preserve the original attribution
  for in-flight work when a thread switches tasks. Leave ambiguous events
  unassigned. A shared directory, temporal proximity, or a current branch
  alone cannot identify the task.
- Build event IDs using immutable source occurrence keys. Use an occurrence key
  per completed compaction even when several share a turn. Assign project-owned
  operation IDs before dispatch so a transport retry reuses the original ID.
  Give an actual new attempt its own ID. Serialize concurrent appends and accept
  duplicate delivery idempotently. Treat conflicting repeats as a coverage issue.
  Choose a primary source for each fact and reconcile projections or replays
  before counting. Use provider run ID, run attempt, job ID, step number, and
  observed SHA for CI. Keep stale-HEAD and cancelled attempts in effort totals.
  Count their results only for the revision and attempt they actually ran on.
- Join `model.usage` by provider and response identity. For a Claude Code
  `api_request` event, a stable request ID may identify the response when that
  request produced exactly one measured response. Choose this stream or the
  transcript as the source for that request. Combine them only when a verified
  mapping proves they describe the same response. With no such identity,
  leave the usage unjoined. Add each response's reported delta once.
  Usage from incomplete responses can count when the
  provider reports a stable identity and usage. When sample data offers only a
  cumulative counter, report its verified scope and coverage separately. Keep
  the normalized `input_tokens` field as total input. Cached reads and cache
  writes are component counts within that total. For Codex,
  `input_tokens` includes cached input. For Claude Code monitoring, add
  `input_tokens`, `cache_read_tokens`, and `cache_creation_tokens` to obtain
  total input. `output_tokens` is the reported total output. Keep any reasoning
  breakdown separate to avoid adding it twice. Token counts alone establish no
  monetary cost. [Codex usage model][codex-usage] · [Claude Code token conventions][claude-usage]
- Report calendar elapsed time and the union of attributable intervals within
  each activity type. Preserve overlaps across types and preserve parallel
  job or runner totals when measuring effort or machine occupancy. Calculate
  unexplained time as the measured calendar window outside the union of
  verified activity and wait intervals. Report incomplete source coverage and
  open endpoints.
- For rework, use the first verified corrective action as `follow_up_at`.
  Count it from the recorded merge time up to but excluding 168 hours later
  in UTC. If the first action is unavailable, use the linked corrective PR's
  opening time as `pr_opened_proxy`. Report proxy counts separately and use
  the same basis when comparing windows. A window is open until its deadline.
  After that deadline, incomplete coverage or unresolved classifications
  still make the result partial.

## Train observations

Create a dedicated task alias for the pilot and bind a `normalized` source to
that `task_id`. Record one `train.observed` per terminal train attempt or
overlapping start skipped because the lock was held. Use a stable opaque
`event_id` across all PRs in the attempt and all replays. Use a new ID for
each new attempt or skip. Set the occurrence to the terminal result or lock skip.

| Field in `data` | How to record it |
| --- | --- |
| `train_mode` | Required. Use `dry` or `enabled`. |
| `train_result` | Required. Use `completed` when the train reached a terminal decision, including a hold. Use `interrupted` for a stopped train, including a timeout, and `skipped` for an overlapping start that did not acquire the lock. |
| `queue_entries`, `queue_wait_ms` | Report the number of distinct entries with measured queue waits and the sum of those waits from admission to selection. Use the same sample for both fields. Record two zeros for a verified empty sample. |
| `excluded_conflict`, `excluded_test`, `excluded_interaction`, `excluded_dependency`, `excluded_other`, `excluded_unknown` | Count distinct returned PRs by one primary cause each. A reproducible failure attributable to one PR counts as `excluded_test`. A failure reproduced only in combination counts as `excluded_interaction`. Use `excluded_unknown` when a verified exclusion has no established cause. |
| `full_suite_runs` | Count full suite attempts that started, including infrastructure retries. |
| `flaky_tests` | Count distinct tests classified as flaky by a verified same-candidate retry under the train's policy. |
| `duration_ms` | Report verified elapsed time from start to terminal result. |

Keep measurements as non-negative safe integers. Use zero for an established
measurement, and omit or use null for unavailable measurements. Supply both queue
values when measured and leave both unknown otherwise. A skipped start carries
only mode and result. Keep raw receipts and PR and test identities outside the
journal. A missed dispatch or empty queue supplies no evidence of a skipped start.

Read the pilot task's `summary`. When it has observations in the task window or
declared train coverage, `train.attempts` lists the reconciled rows by
`event_id` with mode, result and available measurements. Compare the modes
separately. When `queue_entries` is positive, divide `queue_wait_ms` by that
count to get the mean wait for the measured entries.

Declare complete `train.observed` coverage only for a verified pilot source
window. `train.skipped_starts` reports a complete count, including zero, when
that coverage spans the task window through acceptance or the report cutoff.
If a recorded window endpoint is disputed or based on receipt time, the
report withholds the attempts and the count until the window can be established.
With incomplete coverage, exact known skips form a lower bound and a missing
count stays null. An unresolved conflict excludes the disputed attempt and
leaves a coverage gap when the occurrence can fall within the window. The collector reads
observations supplied by the adopter.

## Source adapters and evidence

Classify support as **documented**, **observed**, or **synthetic** in the
adapter's evidence record. Documented support comes from the provider's
contract or pinned source. Observed support records the host and build, the
entry point exercised, and which allowlisted facts appeared. A sanitized
fixture exercises parsing or a controlled failure. Use the supported surface
itself to confirm a live invocation and record known gaps alongside successes.

| Surface | Mapping and verification boundary |
| --- | --- |
| Codex hooks and App Server | For compaction counts, import `codex_app_server` `item/completed` notifications with a `contextCompaction` item and its stable ID. The version-specific `item/autoApprovalReview/*` notifications supply review ID and timings. `thread/fork` gives lineage when available. The `PostCompact` hook supplies a turn and trigger, but needs a separate occurrence receipt for reliable counting. A synchronous `SessionStart` matching `compact` can inject recovery context before the next request. It has no hook-input turn ID. [Codex hooks][codex-hooks] · [App Server][codex-server] · [Review notification schema][codex-review] |
| Codex local rollout | The pinned source writes `session_meta`, `turn_context`, per-response `token_usage_record`, and `token_count` snapshots. Usage records carry response, thread, session, root turn, and turn IDs plus separate cache counters. Rolling snapshots have no response ID. This release persists `compacted` markers and treats guardian review events as transient. Pin the parser to the actual rollout producer and check these fields on a task-owned source sample. The transcript format is internal and the PATH CLI can differ from the producer. [Release usage writer][codex-writer] · [Persistence policy][codex-rollout] |
| Claude Code hooks and monitoring | For compaction counts, import the documented `claude_code.compaction` monitoring record. Count successful events using session, native timestamp and process sequence together. A resumed session can reuse sequence numbers. Use `api_request` for usage and request duration. The `PostCompact` hook supplies session and trigger, but needs a separate occurrence receipt. Choose one primary compaction source. `SessionStart` with `source: "compact"` adds recovery context. A fork needs an explicit source relationship. A permission denial or tool decision alone cannot establish a complete automated-review lifecycle. [Claude Code hooks][claude-hooks] · [Monitoring][claude-monitoring] · [Compaction events](https://code.claude.com/docs/en/monitoring-usage#compaction-event) |
| Claude Code CLI and VS Code panel | The panel bundles its own CLI. The panel and standalone CLI share local conversation history and project settings in the same project and profile. Use one Claude Code adapter for the shared sources. Record the engine version for each client the project uses, and verify IDE-only interactions when a metric relies on them. Check the allowlisted shape and live event path on the selected surfaces. [VS Code client and CLI][claude-vscode] |
| CI and GitHub | Use workflow jobs for job and step status and timestamps, and the provider's run attempt for reruns. Use verified queue transitions and runner assignment events where exposed. A completed job payload alone leaves queue and assignment transitions unverified. Use the PR and push records for PR timing and observed ref changes. Use the existing task or audit record for acceptance and the structured runner for suite and failure facts. [Workflow jobs][github-jobs] · [GitHub webhooks][github-webhooks] |

Use a local allowlist filter before retaining or exporting telemetry. Keep
prompt, response, request-body, and tool-detail logging disabled for this
measurement. Verify on a task-owned sample that the selected adapters emit the
expected normalized events, handle cancellation and repeat delivery, and report
missing intervals. Schema approval, adapter verification in both harnesses, and
the measured adoption pilot are separate milestones.

## Collect one task

1. Agree the task, time window, data owner, allowed sources and journal
   location. Take the [historical baseline](../ADOPTION.md#7-accept-the-profile)
   before enabling collection. Choose one primary source per fact.
2. Install a verified build of the companion. Create a private local profile
   using the package's example. Give the task a stable alias. Set paths for
   the task, audit or development records the project actually keeps. The
   [companion instructions](https://github.com/kostysh/development-methodology/tree/v5/tools)
   explain the profile, supported inputs, installation and recovery. Record
   the chosen commit, package version and integrity value with the project.
3. Record `task.started` and any subsequent `task.switched` through the
   installed `methodology-metrics record PROFILE` command. Use
   `methodology-metrics collect PROFILE SOURCE` to import an approved local
   input. A project-scoped hook may call `methodology-metrics hook PROFILE SOURCE`
   with the documented payload. Verify an allowed event, a replay and a
   malformed or missing source. A passive hook reports a gap and returns
   control to the task. Check the journal for approved fields before use.
4. At acceptance, record `task.accepted`. An operator reads
   `methodology-metrics summary PROFILE TASK --as-of UTC` and compares the
   timing, counts and gaps to the manual chronology. Recheck corrective work
   seven days after merge. Remove the local hook if the owner ends the pilot.

[codex-hooks]: https://learn.chatgpt.com/docs/hooks
[codex-server]: https://learn.chatgpt.com/docs/app-server
[codex-writer]: https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/core/src/session/mod.rs#L5698
[codex-usage]: https://github.com/openai/codex/blob/rust-v0.170.0/codex-rs/protocol/src/protocol.rs#L2588
[codex-rollout]: https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/rollout/src/policy.rs
[codex-review]: https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L1483
[claude-hooks]: https://code.claude.com/docs/en/hooks
[claude-monitoring]: https://code.claude.com/docs/en/monitoring-usage#events
[claude-usage]: https://code.claude.com/docs/en/monitoring-usage#api-request-event
[claude-vscode]: https://code.claude.com/docs/en/vs-code#switch-between-extension-and-cli
[github-jobs]: https://docs.github.com/en/rest/actions/workflow-jobs
[github-webhooks]: https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_job
