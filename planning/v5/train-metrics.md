# Merge train observations

Stage 6 plan step 13 requires measurements of queue wait, exclusions by
cause, flaky tests, full suite runs per train, train duration, and skipped
starts. Use the existing local schema-v1 collector and task summary for these
observations. The producer obtains the facts from an approved run receipt and
verifies its attribution before preparing the normalized row.

## Record an observation

Create an issued opaque task alias for the pilot. Bind an existing normalized
source to that alias, for example
`"train": {"kind":"normalized","task_id":"pilot_1"}`. Use the alias as the
envelope's `task_id`, and a stable issued `event_id` for the attempt. Set
`event_type` to `train.observed`. Record one terminal observation per train
attempt or overlapping-start skip. A batched train uses one event ID across
all its PRs and all replays. Use one authoritative producer and reuse the
event ID for its retries. Give a new train attempt or overlap skip a new ID.
Use the ordinary occurrence and observation timestamps. The occurrence is
the terminal result or the lock skip.

| Field in `data` | Meaning |
| --- | --- |
| `train_mode` | Required. `dry` or `enabled` records the actual mode. |
| `train_result` | Required. `completed` means the train reached a terminal decision, including a decision to hold integration. `interrupted` covers a stopped train, including timeout. `skipped` is an observed start skipped because another train held the lock. |
| `queue_entries`, `queue_wait_ms` | Count and sum of verified queue waits from admission to selection for distinct entries in this attempt. Build the pair from the same sample. Use zero for an established empty sample and leave the pair unknown when the timing is unavailable. |
| `excluded_conflict`, `excluded_test`, `excluded_interaction`, `excluded_dependency`, `excluded_other`, `excluded_unknown` | Counts of distinct returned PRs by one verified primary classification per PR. `excluded_test` means reproducible failure attributable to one PR. `excluded_interaction` means a failure reproduced only in combination. Use `excluded_unknown` when the exclusion is established and its cause is unresolved. |
| `flaky_tests` | Count of distinct tests classified flaky by the verified same-candidate retry under the train's policy. |
| `full_suite_runs` | Count of observed full-suite attempts. Count a full-suite infrastructure retry if it actually starts. Targeted retries or diagnostic prefix tests count separately in the runner's own records. |
| `duration_ms` | Verified elapsed train time from start to terminal result. |

Use nonnegative integers for the optional measurements and report zero only
when established. Use null or omission for unavailable measurements. Leave
measurements out of skipped rows because the train never started. Keep only the
fixed fields above. PR and test identities, provider locators, arbitrary
strings, free-text causes and raw receipts stay outside the journal. An empty
queue or a missed dispatch does not imply an overlapping-start skip. Verify
the source window before declaring completeness.

Use the existing `methodology-metrics record PROFILE` with one normalized
JSON object per input line. Valid records survive invalid rows in the same
batch. A replay with the same occurrence and a later observation timestamp
counts once. Conflicting replays produce a gap and exclude that occurrence.

## Read the pilot

Use `methodology-metrics summary PROFILE PILOT --as-of UTC`. The optional
`train` section contains `attempts` and `skipped_starts`. Each row names its
opaque `event_id` and reports mode, result, and available measurements.
Interpret the queue mean, if needed, as wait sum divided by the positive
observed sample count. Compare dry and enabled rows separately. Keep unknown
fields unavailable.

With neither valid attempt rows nor relevant declared coverage, the optional
section is absent. To report a verified empty interval, declare complete
coverage for `train.observed` on the pilot-bound source over the task's
summary window. Then `attempts` is empty and `skipped_starts` reports
`{"status":"complete","value":0}`. Incomplete coverage gives known positive
skipped starts as a lower bound (`status: "partial", lower_bound: true`) and
unavailable counts as null. Coverage and observations apply only to the
selected pilot and summary window.

This path measures supplied observations. Stage 6 activation still requires the
adopter's trigger, train, dry nights and operational acceptance.
