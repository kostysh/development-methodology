# Disposable merge train acceptance on 20 November 2026

The installed 5.0.0 candidate integrated two real GitHub PRs into the
protected default branch with one full suite. Repository ID was
`1465349495`, target `master`. A separate HTTP read of the deployed test
site returned the tested commit and both delivered samples.
[Disposable project](https://github.com/kostysh/methodology-v5-acceptance)

## Distribution and isolation

A clean install used the staged tools archive with SHA-256
`77d9054f1dde76298151028b1a2d4fdddcc47962d7abe733ac9575d784eb7cb6`
offline, with lifecycle scripts disabled. The installed command reported
`5.0.0`. All 12 train cases passed with that installed package, with zero
skips. Node was 24.15.0, Git 2.53.0, GitHub CLI 2.96.0 and Docker 29.6.2.
This archive came from a snapshot of the implementation worktree. The
release needs its own archive digest and exact-source CI record.

The trusted verifier ran as UID 65534 with a read-only candidate snapshot,
no external network, no Git metadata and no writer token. It read both
sample files and checked their expected contents in the same full suite.
The separate return channel belonged to the verifier. A controlled Docker
regression also checked an inaccessible host-secret symlink, an unwritable
snapshot, absence of Docker and Git credentials and preservation of blob
bytes under a PR-supplied Git attribute.

## GitHub admission and write authority

The repository's push workflow checked the exact checked-out SHA, the
changed paths against the target, and the expected sample content.
Workflow ID was `424944890`, accepted workflow blob was
`92f8e7beb21974eb29c6f21baaa980f547b56ece`. The two successful check
runs matched the immutable workflow, branch, head, push event and check
suite. The initial workflow used too little history to calculate the PR
delta. Those runs failed. The corrected workflow fetched the merge base,
and only the corrected heads entered the train.

| PR | Frozen head | Successful CI |
| --- | --- | --- |
| [#1](https://github.com/kostysh/methodology-v5-acceptance/pull/1) | `2552015008fe56fa73fa3138ee4839e9a17b4ba2` | [Run 44730036893](https://github.com/kostysh/methodology-v5-acceptance/actions/runs/44730036893) |
| [#2](https://github.com/kostysh/methodology-v5-acceptance/pull/2) | `99a56919d5f88908531044773c5a8949b3532f54` | [Run 44730043166](https://github.com/kostysh/methodology-v5-acceptance/actions/runs/44730043166) |

The installation token could see exactly this repository. Update ruleset
`27722034` allowed only App ID `5847655` to update the target. Ruleset
`27722036` blocked force pushes and deletion with zero bypass actors.
Ruleset `27722037` froze updates and deletion on both PR branches with
zero bypass actors. The owner observed history versions `58769090`,
`58769092` and `58769094` respectively.

GitHub hid bypass actors and denied ruleset history to the administration-read
installation token. The owner exported the actor lists; the train matched
each export to the live repository ID, exact branch, effective rule ID,
source, conditions, rules, enforcement and fractional timestamp. A controlled
test changed the server timestamp by one millisecond and the verifier rejected
the export. This relies on GitHub updating that timestamp when the rule changes.

GitHub rejected an ordinary owner's fast-forward probe with GH013. The
branch remained at `33cdef47fc52886b483c994f00570f3c9d29117f`.
GitHub recorded the subsequent accepted write under
`kostysh-v5-train-acceptance[bot]`. [Rejected rule suite](https://api.github.com/repos/kostysh/methodology-v5-acceptance/rulesets/rule-suites/5255869251)
and [App rule suite](https://api.github.com/repos/kostysh/methodology-v5-acceptance/rulesets/rule-suites/5255900466).

## Results

The preliminary dry run used an isolated build and proposed both PRs. The
enabled run used the installed archive above. Its single full run passed on
`b020af1db9a5a6fea996eb0d2121461ee6f1c7b3`, tree
`05c3301f87fa27ee72ae84e83e0df6c1262f3b0e`. Independent reads returned
that commit and tree on `master`. Both GitHub PRs were `MERGED` at
11:49:24 UTC with their frozen heads. The local disposable static test site
served the same revision and the two responses `accepted alpha` and
`accepted beta`. [Integrated commit](https://github.com/kostysh/methodology-v5-acceptance/commit/b020af1db9a5a6fea996eb0d2121461ee6f1c7b3)

| Dispatch | Receipt | Queue entries / total wait | Full runs | Flaky tests | Total exclusions | Duration |
| --- | --- | --- | --- | --- | --- | --- |
| Dry batch | `c11f4e20-cf15-4107-a566-b7f48164d52f` | 2 / 3,877 ms | 1 | 0 | 0 | 30,356 ms |
| Enabled batch | `b385fece-123e-49dd-abc6-9388604d6c2e` | 2 / 164,459 ms | 1 | 0 | 0 | 29,271 ms |
| Empty scheduled slot | `801becbf-1b22-4f96-a2cb-1574e189bf2c` | 0 / 0 ms | 0 | 0 | 0 | 3,928 ms |
| Overlapping documentation dispatch | `a9479633-d844-456e-9e76-a8921f2cb99d` | skipped | — | — | — | — |

The final two invocations used the same installed command and process lock.
The documentation invocation recorded its skip within one millisecond and
never queued. The scheduled argument was invoked in a configured test
slot. GitHub's cron scheduler and a night-long runner installation were
outside this live trial. The morning report returned four receipts and an
empty remaining queue. Replaying all four observations preserved the
journal SHA-256 `eacad6920cdf5c802d115fdfdecec1f7c523959d7f5c33c3b77b8f535deefc30`.

The controlled regression suite covered all seven
[failure scenarios](../../defaults/merge-train.md#dry-run-cases), both
candidate revisions, an exhausted full-suite budget, a real Git lease
race to another candidate ancestor, infrastructure exhaustion, timeout,
two SIGKILL points, a pending merge-permission hold and recovery of the
deployment without republishing. These cases used disposable local Git
repositories and controlled provider responses. The GitHub batch, actual
protection rejection, App identity, overlap and HTTP deployment reads above
provide the provider and deployment observations. The trial supplies no
comparative evidence about delivery time or quality.
