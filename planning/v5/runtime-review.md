# Runtime review of the v5 release candidate

The independent reviewer built the change in a separate directory. The
orchestrator and implementation owners corrected the following reproduced
failures and the reviewer repeated the affected operations.

| Failure | Result after correction |
| --- | --- |
| Replaying a reversed solo decision returned its original implementation authority. | Replay returns a hold and includes the owner's replacement choice. |
| Enabled publication accepted mutable source heads. | Enabled configuration requires verified update and deletion restrictions. The writer verifies the frozen source before its final head read and applies an exact lease to the target. |
| A second PR could pass its final check after the owner revoked the first PR's permission. | When the reversal was installed first, neither PR merged. When publication acquired the shared lock first, installation returned retryable exit 75. After the two-PR write the owner installed the reversal and the gate held. The lock also survived coordinator death during an in-flight Git push. |
| Nonterminal artifacts could move backwards in their lifecycle and a superseded record's contents could be rewritten. | The guard rejects invalid transitions and changed contents or mode on terminal records. |
| A Git rebase reported no rewrite because HEAD had two identical reflog entries. | The real post-rewrite hook associated the supplied old/new pair with the named branch's actual movement. |
| Re-reading a revised GitHub PR invalidated the original opening time. | The same PR opened once across A, B and replay of B. The stored opening survives the merge and the comparison retains the first-PR interval. |

The review reached **PASS** for the corrected runtime boundaries. Race
tests used real disposable Git repositories and installed commands. The
[GitHub trial](train-runtime-acceptance.md) supplies the separate provider
readback. The [native client trials](native-acceptance.md) identify their
editor routes and model transport. Archive-level acceptance checks the
named required cases, passing count and zero skips.
