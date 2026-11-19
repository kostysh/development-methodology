# Independent recovery baseline

The test author started at 2026-11-19T19:35:53Z. The test ran before
recovery implementation source edits, against a private clone of
`4437f9cbd082141f9a73e38426dbaff95db24ec8`. The host ran Linux x86-64,
Git 2.53.0, Node.js 24.15.0 and npm 12.0.1. The companion package was
`@kostysh/development-methodology-tools` 0.3.0. The test oracle was the Stage 8
public recovery contract, Stage 8 of the plan and requirements B1–B8.

## Executed baseline

- A lockfile install and clean build passed. The unchanged `npm test` passed
  81 tests. The unchanged `npm run test:packed` passed after moving npm's
  cache from the sandbox's read-only default to private scratch space.
- With the frozen test in the clone's `tools/test/`, `npm test` ran 89
  tests. The existing 81 passed. All eight recovery tests stopped at the
  absent manifest bin.
- A fresh installation of the baseline tarball outside the checkout resolved
  all three existing bins. The tarball had no recovery output and invoking
  the expected installed `methodology-recovery --version` failed to spawn
  with `ENOENT`. Running the suite against that exact installed path also
  failed all eight tests with `ENOENT`. Archive SHA-256
  `05ef635d8b3d0718503a82b7b552adea1c30b8e632d6f00e48b9807ef431435a`.
- A separate counting copy of the typed suite reached 445 passing fixture
  assertions in each run. The packed run also passed eight absolute-path
  assertions. Each run reached eight failing dispatch assertions and zero
  later R1–R4 behavior assertions.
- The final typed suite passed `node --check` and standalone strict
  TypeScript checking with the package's ES2024, NodeNext, Node types,
  verbatim module, and JSON module settings.

## Observed prior manual route

On an independent linked worktree, an in-flight local fixture process waited
at a barrier. The saved handoff held its output and exit locators and the
current revision. The fixture moved HEAD while the session was simulated as
paused. The process then finished with stdout `fixture check did not pass`
and exit 7. Following the original chapter 12 route, the observer read the
assignment and handoff, checked the clean checkout, and found the saved
`4437f9c` and live `fc6e3df` revisions differed. The runner PID was gone. The
saved exit and stdout established the failed check on the old revision.
The observer held mutations and left the completed run as recorded. The
runner and disposable worktree were cleaned up.

## Frozen verification handoff

The [installed and built contract suite](../../tools/test/recovery-contract.test.ts)
was frozen at 2026-11-19T19:45:07Z.

| Version | Test SHA-256 |
| --- | --- |
| Initial plain-JavaScript suite | `baa026ac548cc3a484fa9bb8bcdfe04e2a5050db5e9adb244de5f823005a5cc7` |
| Frozen strict-TypeScript suite | `1ecf6bfecfb6b88cfb15489a763a7aa9645150149ad923b36198e4ccf5a1ed9b` |

Both versions kept the same eight cases and baseline verdict. The second
version added types and preserved the test behavior.
Run `npm run build` and `npm test` from `tools/`. To exercise the packed
package, install its tarball into an isolated location and run the same
test file with `METHODOLOGY_RECOVERY_BIN` set to the absolute executable path
of the installed bin. Require a positive executed-test count for each
installed suite. The [runner correction](train-metrics.md#packed-runner-correction)
records why the original smoke result could not establish this.

The eight cases cover binding and command errors, private UTF-8 state and
line limits, index and ref preservation, unsafe destinations, competing
writers and interrupted input, fresh Git counts and ref drift, resource
ownership and expiry, passive hook and explicit recovery, provider identity
and stale CI, and metadata-only output. The writer test observes the
filesystem at sampled points and interrupts a process before stdin EOF.
The resources test reads an actual Linux process identity and uses
fixture-owned records. The provider test runs an isolated `gh api` double
from the CLI's PATH. REST is the transport selected by the fixture and the
implementation handoff. The fixture examines request targeting and record
interpretation for that read-only integration only. Live GitHub, credentials
and other `gh` interfaces were outside the observed boundary.
Hook packets use documented native input and output. Host dispatch and the
agent's actual first action still require observed sessions.
[Codex](https://learn.chatgpt.com/docs/hooks#sessionstart) ·
[Claude Code](https://code.claude.com/docs/en/hooks#sessionstart) ·
[GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request) ·
[GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)

This baseline gives no real-task timing or token comparison. The three host
drills, real-task pilot, delivery-revision CI, and reinstall or rollback
checks remain outside the independent baseline observation.

The independent baseline observation and type pass ended at 2026-11-19T19:46:15Z.

## Accepted implementation

The first build at `28fc8deb` passed the eight frozen recovery cases and
the existing 81 tests. The independent reviewer identified two snapshot
errors. Git counts could differ when a worktree used an external ignore
file. A configured GitHub repository had no branch-publication result
before the first PR. Each [regression test](../../tools/test/recovery-implementation.test.ts)
failed against the earlier installed archive and passed against the
corrected archive at [c8aae8e0](https://github.com/kostysh/development-methodology/commit/c8aae8e0c546376132bee41d829a674637b5dfc7).

- The canonical suite passed 91 tests. The original package smoke installed
  and invoked the public commands. A later check found that its nested test
  runner had skipped the contract files. A fresh, direct installed run on
  the exact 0.4.0 archive passed 27 protected-baseline and eight recovery
  cases, with zero skips. The
  [recovery manifest](recovery-baseline.json) still matched its trusted tree.
- A live read of the named GitHub repository matched the published branch
  OID before a PR was selected. A historical PR and a run with no matching
  PR association returned partial data and a named gap. The worktree
  snapshot agreed with Git when its user configuration supplied the
  ignore file.
- A private consumer installed the corrected 0.4.0 archive, rolled back
  to 0.3.0, verified baseline protection and reinstalled 0.4.0. The
  0.4.0 archive integrity was
  `sha512-V5uKJiPqOIpocWXcJBr4m+1JAbMQt4iN3L6ypZhMoDUg+/xHCQIwVxOWj5OOovVRGs5P5gc9khIfjVeGKzfs+Q==`.
- The [three-job pilot and host drills](recovery-pilot.md#observations)
  give the observed results for Codex and Claude Code. The independent
  [skill re-audit](https://github.com/kostysh/skills/blob/53beaffbc97c65e0a33d26071353fb7f1fd674b4/docs/reviews/evidence/v5-task-recovery/review-0.2.11.md)
  accepted the corrected long-run handoff that retains both output streams,
  the terminal status and the launch revision.
