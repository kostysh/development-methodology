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

## Packed runner correction

On Node.js 24.15.0 a nested `node --test` inherited
`NODE_TEST_CONTEXT=child-v8`, skipped every selected file and returned 0.
The original package check accepted that exit status. Its other installed
command checks did execute. Earlier green hosted runs cannot establish how
many nested contract cases ran.

The corrected runner clears that inherited marker, selects the built-in TAP
reporter, and requires a successful exit and a positive pass count for
each suite. Restoring the marker in a controlled run again skipped the
tests and the outer gate failed on the missing count. On the stock 0.4.0
archive, 27 installed baseline tests and eight recovery tests passed. All
four new train tests failed on the absent event or coverage declaration.
The unchanged canonical suite also passed its 91 existing tests and failed
the four new tests. Their deeper assertions became reachable on implementation.

A separate top-level test process reinstalled each exact archived version
and ran its frozen suites. The 0.3.0 pilot archive passed 27 of 27.
The corrected 0.4.0 recovery archive passed 35 of 35. Both reported zero
skips. These later runs establish the installed behavior of those archives.

## Accepted observation package

The independent author froze four public cases before implementation.
The [trusted manifest](train-metrics-baseline.json) covers their bytes and
the build, test and CI inputs at the corrected runner revision.

The initial independent code review found that a conflict outside the pilot
window or a failure on another task could influence its skipped-start count.
It also found an unrelated coverage declaration and sub-millisecond boundary
cases. Six regression cases failed on the first implementation, then passed.
A delta review exposed two further false counts involving disputed task
acceptance and a rejected receipt on a second source for the same pilot.
Both failed before correction. The final independent check passed. A
disputed window withholds uncertain rows and counts. An unrelated task
can retain its own verified zero.

The integrated 0.5.0 build passed 103 canonical tests. The installed smoke
reported 27 baseline, eight recovery and four train contract cases. Its
tarball SHA-256 was
`0023e519004966ca835ea57978a3bdd700b2bc58ae02a1c7e99038336f0345ed`.
An isolated upgrade from 0.4.0 and rollback reproduced the earlier task
summary and preserved the train journal separately. The trials used
synthetic terminal receipts. The owner deferred the write-capable train
and nightly operations until an adopter demonstrates the trigger.
