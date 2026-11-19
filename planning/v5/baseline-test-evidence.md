# V5-BASELINE test evidence

The independent test author used the [accepted public contract](baseline-manifest.md)
before seeing any baseline implementation. The [suite](../../tools/test/baseline-contract.test.ts)
uses the public process arguments, stdin, exit status and output. It generates
temporary Git worktrees with a test, runner, runner settings and a Unicode
fixture. Verify and hook tests get a manifest in the documented format so a
freeze failure cannot hide a failure in either command.

## Pre-implementation run

Linux, Node.js 24.15.0, npm 12.0.1 and Git 2.53.0. The old tools package
built, packed and installed as `@kostysh/development-methodology-tools@0.1.0`
from [the original pilot base](https://github.com/kostysh/development-methodology/commit/bcd98276d60bda3c13631f4dcc7d8195cb1b1857).
Tarball SHA-1: `528418890f6a241b0b3d4011c576b6fea0151c66`. The installed
package exposed `methodology-check-links` and had no `methodology-baseline`
bin entry or executable.

I copied only the new test into the isolated copy of the old tools package
and ran the following commands from that copy:

```sh
node --check test/baseline-contract.test.ts
./node_modules/.bin/tsc --ignoreConfig --noEmit --target es2024 --module nodenext --strict --types node test/baseline-contract.test.ts
METHODOLOGY_BASELINE_BIN="$old_install/node_modules/.bin/methodology-baseline" node --test --test-reporter=tap test/baseline-contract.test.ts
node --test --test-reporter=tap test/baseline-contract.test.ts
```

Syntax and strict type checks passed. Both test runs exited 1 with 27 failures
and zero passes. The installed run reported `spawnSync ... methodology-baseline
ENOENT` for every attempted operation. The built-entry run reported
`The package does not declare a methodology-baseline entry point`. This proves
that the public entry point was absent. The old package could not reach the
semantic assertions or later calls in a case.

| Clause | Public scenario and expected result | Old installed run |
| --- | --- | --- |
| BM1, BM5 | `--version` returns the package version with a newline and empty stderr. | 1 case reached command launch, ENOENT. |
| BM1, BM2, BM5 | Freeze from the Git root and subdirectory. Full SHA-1/SHA-256 object IDs, deduplication, byte sorting, literal paths, recursive selection, executable mode, stdout JSON and unchanged repository state. Reject bad paths, symlinks, gitlinks and invalid commit arguments. | 4 cases reached freeze launch, ENOENT. |
| BM1, BM3, BM5 | Verify accepts clean and independent committed work. Commit reads ignore index, worktree, checkout and Git replacement refs. Invalid input fails with exit 2. | Clean and replacement-ref cases reached verify launch, ENOENT. The invalid-ID case first reached freeze. |
| BM3, BM5 | Verify exits 1 and reports changed runner settings, fixture, nested additions, deletion, rename, mode change, symlink and ancestor displacement. | 9 cases reached verify launch, ENOENT. |
| BM3, BM5 | Candidate manifest replacement, deletion or mode change exits 1. Missing, malformed, invalid-version or inconsistent trusted manifests and unavailable source objects exit 2. | 4 cases reached verify launch, ENOENT. |
| BM3, BM5 | A shell write to a selected assertion is committed with local hooks skipped. Verify rejects that exact candidate and accepts the clean baseline commit. | Shell write and Git commit completed. Verifier launch for the changed candidate returned ENOENT. |
| BM4, BM5 | Claude Edit and Write and Codex raw apply_patch stdin. Deny selected edits and additions, manifest edits, ancestors, moves into the selection, symlink aliases, malformed or unsupported requests, out-of-worktree targets and unavailable trusted data. Allow independent paths and benign text referencing a protected path. | 6 cases reached hook launch, ENOENT. |

Test file SHA-256:
`580897630e83456561accbcfd083ffff1361a832299e263639a769e064aaf3ae`.
The counts above summarize the two local TAP runs.

## Old CI job replay

I ran the five shell steps from the
[old workflow](https://github.com/kostysh/development-methodology/blob/bcd98276d60bda3c13631f4dcc7d8195cb1b1857/.github/workflows/methodology-tools.yml)
in isolated copies, using the workflow's Node version. The original controls
and a controlled mutation both passed `npm ci --ignore-scripts`,
`npm run build`, `npm test` (7/7), `npm run test:packed` (1/1) and
`npm run check:links -- ..` (42 documents). The mutation replaced the
expected status, stdout and exact broken-link diagnostic in the old
`fails an inbound reference when only the target changes` test with
`assert.equal(check(root).status, 1)`.

The local replay shows that the old workflow's shell steps accepted a
weakened assertion. The [pilot results](pilot.md#pilot-results) cover the later
host and CI observations. No test dispute was raised during authorship. For a
change that displaces a selected descendant, a diagnostic may identify
the changed ancestor or the displaced path.

## Frozen pilot inputs

The test author supplied the independent contract suite before implementation.
The package owner then declared the future command in the package and lockfile,
and configured the existing archive smoke test to run the same public contract
against the installed binary. The test source digest above stays the same.
The manifest covers that test, the archive smoke, the package manifest and
lockfile, the TypeScript configuration and the existing package CI workflow.
The test creates its fixtures in disposable repositories. Its assertions,
fixture data and skip controls are all in the test file. This package has no
separate coverage threshold or exclusion file. Additional implementation tests
can use separate files.

## Accepted behavior and evidence limits

The installed package passed all 27 frozen cases. The [pilot report](pilot.md#pilot-results)
records native allowed and denied edits, the controlled failing hosted
comparison, the restored candidate and the final integration decision.
In a separate dispute exercise the specification owner rejected an assertion
that a documentation-only edit outside the selection must fail. The independent
test author committed that edit in a disposable repository and observed exit
0 and empty output from the built verifier. The frozen suite already expressed
that behavior. The pilot required no replacement baseline.

The original absence of the executable prevented inspection of version
output, manifest semantics and hook decisions before implementation.
The later tests and hosted violation establish the new behavior. The original
CI's acceptance of a weakened assertion documents the previous enforcement gap.
