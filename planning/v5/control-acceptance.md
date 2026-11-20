# V5 control acceptance evidence

On November 20, 2026, an isolated Linux workspace built the companion with
Node.js 24.15.0, npm 12.0.1, Git 2.53.0 and util-linux 2.41.3. A consumer
installed the draft tools archive into an empty directory with install
scripts disabled. It ran 44 cases through the installed controls, links and
baseline commands. All passed with zero skips. The local draft archive's
SHA-256 was `8038877448a4c2a118c258e55edae31f0d6aa30bc15ed170141a9e355ffd0def`.
Release CI owns the tested release archive and checksum.

## Register readback

| [Control](../../defaults/controls.md#common-checks) | Observed clean and rejection cases |
| --- | --- |
| Links and anchors | A real Git worktree under `.worktree/task` previously made the parent check fail for another candidate's broken link and anchor. With the fix, the parent accepts all three own pages and the checker still reports the nested worktree's missing target when run with that checkout as the root. A changed heading in `.worktree/reference.md` fails the inbound link from the parent. An unchanged test case also rejects duplicate explicit anchors. [Link cases](../../tools/test/check-links.test.ts) |
| Artifact IDs and lifecycle | The whole candidate passes with unique IDs, a retained archive, an archive note and a reciprocal successor. An unchanged base record can collide with a new artifact. The command also rejects a reused retired ID, reassigned committed identity, edited or absent archive, absent archive note, unresolved successor, missing reciprocal link, unsupported metadata keys and a candidate without the trusted base. [Control cases](../../tools/test/controls.test.ts) |
| Git target and staging | The fixture accepts the exact checkout, branch, remote, Unicode staging path and a literal path beginning with `:`. It rejects the wrong checkout, branch and remote, multiple push destinations, an ignored path, a symlink escaping the worktree and an undeclared staged filename containing a newline. A real push to a disposable bare remote succeeds on an exact lease. A second push on the stale lease exits 1 and readback retains the first writer's commit. [Control cases](../../tools/test/controls.test.ts) |
| Required checks and thresholds | The gate accepts successful exact-candidate results and a skip explicitly requested by policy. It rejects ambiguous, missing, stale, cancelled and unapproved skipped results. Exit 6 blocks even if the producer includes a success message. A changed threshold of 70 blocks against a policy of 80 even with a measured 95. A score below the effective threshold also blocks. The receipt producer and integration gate belong to the adopter's trusted CI. [Control cases](../../tools/test/controls.test.ts) |
| Protected tests | The installed verifier accepts unchanged inputs and independent implementation. Separate shell writes and commits with hooks skipped change a fixture, exclusion, coverage threshold and skip control. The verifier exits 1 with each selected path. Historical hosted CI, protected editor calls and semantic fault tests are recorded below. [Control cases](../../tools/test/controls.test.ts) |
| Shared resource | Separate processes share the same lock directory and reject a second operation on the same identity before it starts. A different identity can proceed while the first holds its lock. `SIGKILL` of the invoking process triggers cleanup through its supervisor and the next runner then succeeds. `SIGKILL` of the supervisor releases the file lock and the persistent marker blocks the next operation. Failed reconciliation preserves the hold. Successful cleanup/readback releases it. [Control cases](../../tools/test/controls.test.ts) |
| Exit status and cleanup | A check exits 7, cleanup succeeds and the calling command still exits 7. The persisted result records both outcomes. Timeouts exit 124 and still clean up. An unexpected descendant returns 125 even when the primary exits 0 and the runner is able to reap it. The interruption case also reads back the owned listener after cleanup. [Control cases](../../tools/test/controls.test.ts) |
| Read-only credentials and evidence | The process fixture injects synthetic writer credentials and contact details into the launcher. The executed child sees neither variable. Its injected token, email address, full command and payload are absent from output and the persisted result. The historical CI job uses a read-only token and checkout with credential persistence disabled. The adopter verifies host access and release-writer isolation in its own runner. [Control cases](../../tools/test/controls.test.ts) · [Pinned CI workflow](https://github.com/kostysh/development-methodology/blob/eb975b39a70ac3229b59bd0e99210f1de1941f40/.github/workflows/pilot-baseline-check.yml) |
| Distribution | Locked install and installed public commands passed. Changing the locked `github-slugger` version caused `npm ci` to reject the mismatch. Removing the baseline hook runtime module from a duplicate tarball made the installed command exit 1 with `ERR_MODULE_NOT_FOUND`. Altered archive bytes failed `sha256sum --strict --check`. These probes used local copies. |

The shared-resource tests used independent runners on one Linux host. A
multi-host adoption must verify its shared locking filesystem before relying
on that boundary. The artifact command accepts the documented metadata subset
and rejects ambiguous syntax. A different metadata format needs an equivalent
project-owned check. Cleanup for resources beyond the owned process group
depends on the cleanup and reconciliation commands the project supplies.

## Frozen test semantics

The [frozen test file](../../tools/test/baseline-contract.test.ts) retained
its accepted SHA-256
`580897630e83456561accbcfd083ffff1361a832299e263639a769e064aaf3ae`.
A fresh offline npm installation of the existing v0.5.0 archive with
SHA-256 `0023e519004966ca835ea57978a3bdd700b2bc58ae02a1c7e99038336f0345ed`
ran all 27 frozen cases with exit 0 and zero skips. This archived distribution
preceded the selected-controls implementation.

For each case, a disposable copy of the installed package received one
controlled change to the verifier implementation. The original test file ran
the matching case through the mutated executable. Each run reported one
assertion failure with exit 1. There were no launch, module load, syntax or
skipped-test failures. The original test file and accepted manifests were
unchanged.

| Frozen case | Semantic change detected |
| --- | --- |
| Installed version | Reported a different version. |
| SHA-1 freeze | Preserved caller ordering instead of canonical sorting. |
| SHA-256 freeze | Rejected full SHA-256 IDs by assuming the SHA-1 length. |
| Invalid and nonregular selections | Resolved a case mismatch to an existing selection. |
| Invalid commit arguments | Expanded an abbreviated source commit. |
| Clean and independent candidate | Protected implementation content outside the declared selection. |
| Exact Git object reads | Used Git replacement objects in comparisons. |
| Changed runner settings | Skipped the runner configuration entry. |
| Changed fixture | Skipped the selected fixture blob. |
| New nested test | Omitted additional protected paths. |
| Deleted test | Omitted missing entries. |
| Renamed test | Allowed a selected file to move out of the selection. |
| Runner mode | Ignored mode-only differences. |
| Symlink replacing test | Accepted a symlink in place of a selected test. |
| Symlink replacing selected root | Skipped the displaced protected children. |
| File replacing ancestor | Skipped the selection below the blocking ancestor. |
| Replaced manifest | Ignored changes to the candidate manifest blob. |
| Absent manifest | Accepted manifest deletion. |
| Manifest mode | Ignored a mode-only change to the manifest. |
| Committed shell write | Omitted changed selected assertions from committed candidates. |
| Invalid trusted manifests | Treated an unsupported manifest version as valid. |
| Protected Claude calls | Allowed Claude edits to protected files. |
| Independent Claude call | Denied an unrelated Claude path. |
| Codex hunk paths | Ignored the destination of a move. |
| Codex benign patch text | Parsed text inside an addition as a protected hunk header. |
| Physical-path aliases | Compared lexical paths without resolving symlinks. |
| Malformed and unavailable hook inputs | Allowed a hook request when its trusted manifest was absent. |

The [historical hosted rejection](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/2)
reported exit 1 and the [restored run](https://github.com/kostysh/development-methodology/actions/runs/44595706387/attempts/3)
reported success. The original pilot links them to candidates
`3178c84e97462ef5954976e142456ed716d0c61b` and
`cd2aa689564fbaacf87fa108114678a05556ff60`. Local replay using the installed
verifier and historical trusted baseline `537d54bfa1c1581ec27cc626b72a6f56514dfca5`
confirmed exit 1 with the protected test path and exit 0 with empty output,
respectively. The [pilot report](pilot.md#pilot-results) records the observed
native edits and exact candidate inspection. The new fixture test separately
commits the fixture, exclusion, threshold and skip changes and verifies them
using the same command contract.

## Comparable timing and dispute histories

The installed `methodology-metrics compare` read two dated, synthetic
histories with complete dispute source coverage. Actual recorded start to
acceptance was 600,000 ms before and 180,000 ms after. Distinct disputes
were two before and one after. The command returned known differences of
−420,000 ms and −1 dispute. Against a history with only an acceptance event
and no dispute coverage, both differences returned `insufficient_data` with
a null value. This exercise verifies the calculations and missing-data
behavior. The [historical pilot](pilot.md#pilot-results) has incomplete
records for an actual improvement claim.
