# Resolution of the independent 5.0.1 re-review

The original English report has SHA-256
`e4a68ca3eb706327a7e56d1ecb9f9cca0bb38d44b07896a273967bc7f002524f`.
It reviewed guide and tools commit `cad54a019986d0e599616a0b0b54caa57c4fe425`.
The original findings and evidence are retained unchanged by their author.
The [previous resolution](external-review-resolution.md) covers the earlier
sandbox metrics, safe installation, train and solo findings.

| Finding | Change in 5.0.2 | Acceptance boundary |
| --- | --- | --- |
| N1. The usual PR author cannot approve their own PR | The usual account opens the PR. A separate agent reviews the exact base and head. The existing App publishes that verdict from the trusted coordinator. | Check the actual GitHub author and publisher IDs, exact commits, review and admission. Rejected, stale or superseded reviews hold the PR. |
| N2. Manual setup and teardown for each task | One project setup, then `methodology-task begin` and `finish` manage the selected hooks, session binding, spool, recovery and report. | Verify a real client callback through the installed command, the wrapped test's actual exit, final import, repeat finish, late compaction and rollback. Client trust remains an explicit action. |
| N3. Project profile and guide links have different destinations | Each entry point uses its own relative project profile link. The guide can use the installed tag or a fresh, versioned offline copy. | Follow chapter and profile links in both layouts and compare every pre-existing project file before and after the install. |
| N4. Corrected submissions leave stale PR dependencies and protected refs | The trusted configuration accepts stable task keys. Superseded submissions drop out. Projects can retain closed refs or retire an exact closed ref during an authorized maintenance window. | A corrected prerequisite and an already merged prerequisite resolve. An ambiguous or missing task holds the dependant. Retirement is an optional owner operation. |
| N5. Real token rollover and test deployment | Exercise two elapsed 40-minute suites on the disposable stand, then commission the released train from a clock-triggered run with no operator reply. | Verify distinct token issues across the validity window, the accepted and excluded PRs, actual protected ref, and a separate read of the serving test revision. Distinguish the version used for each run. |
| N6. A candidate can edit its workflow's inventory check | A trusted installed control checks the exact Git objects and the externally approved inventory digest. On protected paths it also requires the coordinator's reference to the owner's affirmative message. | Remove an inventory entry or a workflow, use stale base evidence, and omit the owner's decision. Check that the ordinary PR still integrates and the morning report identifies the holds. |

## Maintaining this repository's v5

The maintainer continues opening PRs through their usual GitHub account.
For changes after the release, use a PR with the required `verify` job.
Before merging, the coordinator runs the released
[review-policy command](../../defaults/controls.md#protect-the-review-policy)
from a trusted Git object repository against the current base and head.
Use the [approved policy](maintainer-review-policy.json) from the previously
accepted release. Keep this copy and the installed command outside the PR.
For an intended inventory change, show the owner the added or removed cases
and exact revision, receive their reply and install the new approved digest.
Re-read the checks and merge only the verified head.

GitHub enforces the PR and CI when its branch rule is active. The
coordinator enforces the chat decision at its own merge boundary. A manual
merge with the owner's GitHub credentials can pass the native branch rule
without that chat decision. The disposable acceptance App remains scoped
to its stand. An adopting project's scheduled train uses its own configured
publisher and writer and can leave an unanswered PR until morning.
