# External adoption review follow-up

The independent review tested `methodology-v5.0.0` and reported four
adoption blockers. Its original SHA-256 is
`72e031849aa367d574770e6da8772c219e39830bc5b73fdf63cb423fc2094e2f`.
The 5.0.0 acceptance record describes its own setup. It does not establish
readiness for a fresh installation in an existing project.

The [5.0.1 release](https://github.com/kostysh/development-methodology/releases/tag/methodology-v5.0.1)
passed the installation and return-to-service checks below. Its source is
`cad54a019986d0e599616a0b0b54caa57c4fe425`. The [tag workflow](https://github.com/kostysh/development-methodology/actions/runs/44745918246)
tested the installed tools and recorded the provenance of the checksum manifest.
The [release record](trials/5.0.1-release.json) lists the published hashes and suite counts.

| Review item | Change in 5.0.1 | Acceptance observation |
| --- | --- | --- |
| B1, D6. Sandbox metrics and test execution | A workspace task spools observations. The coordinator imports them into a private journal. A wrapped test runs once per invocation and returns its own exit code when collection fails. | In a real Codex workspace sandbox the coordinator imported seven observations. An immediate replay added zero. The test returned its original failure code. [Installed test record](trials/5.0.1-solo-metrics.md) |
| B2, D9. Train commissioning and controls | One branch rule covers all immutable submissions. An author fixes the editable task branch and submits a new head under the same task key. The release supplies the review and check workflow, exact-head results exporter, baseline workflow, verifier recipe and PostgreSQL example. | The train returned [#6](https://github.com/kostysh/methodology-v5-acceptance/pull/6) after reproducing its PostgreSQL failure. The App merged its correction [#7](https://github.com/kostysh/methodology-v5-acceptance/pull/7) and dependent [#8](https://github.com/kostysh/methodology-v5-acceptance/pull/8) after a combined PostgreSQL run. Two forty-minute suites and credential renewal across expiry used a controlled clock. The stand had no deployment configured. [Machine record](trials/5.0.1-train.json) |
| B3. Existing project files | The adoption command stages a new release outside the project. It verifies the manifest and refuses an occupied destination. The guide archive excludes the maintainer's root instructions. | A fresh consumer installed the public release against a disposable copy of 21 actual Passapure guidance files, its existing entry points and a populated test profile. File contents, Git refs and index matched after install and rollback to the published 5.0.0. Both an occupied directory and a dangling symlink were refused. A new Codex client discovered the correctly pinned skill in its linked worktree. [Cold install and rollback](trials/5.0.1-cold.json) |
| B4. Solo owner authority | The agent acts on a delegated choice. If the owner needs to decide, the agent asks once and records the chat reply. Publication uses the project's existing independent authority. | An ordinary account recorded and corrected a reply. Neither a chat note nor a receipt writable by that account could release the optional machine gate. [Installed test record](trials/5.0.1-solo-metrics.md) |
| D5, D8, D10. Native hooks and recovery | The operator binds a visible session ID from a terminal. The selected client must deliver a callback. The installer stores machine paths privately, writes portable commands in project settings and removes its own registrations on rollback. | On the frozen archive, Codex CLI, Claude CLI and the Claude VS Code panel recorded tool lifecycles and compaction, delivered recovery state and excluded a foreign session. Rollback removed the generated panel settings. These runs used a deterministic local model endpoint. [Client records](trials/5.0.1-native.json) |
| D7. Mandatory test inventory | The release owner keeps the reviewed inventory digest outside the candidate. CI checks it before executing candidate code. The package check verifies all 150 named test results from 18 suites. | Deleting a mandatory test and its list entry together in a disposable copy returned exit 1 with the inventory-mismatch diagnostic. [Machine record](trials/5.0.1-required-tests.json) |
| D11. Traceable evidence | The records identify the exact archive, client surface, model transport and observable result. | In a separate Claude CLI turn a local Qwen model chose the Read tool and returned an unpredictable value from the test file. Its server template accommodated a later system-role message. The graphical panel and Codex runs above used a deterministic endpoint. [Client records](trials/5.0.1-native.json) |
| D12. Links, provenance, time and runner status | Packaged links use the release tag. A summary defaults to the current instant. Resource contention returns 75. | The fresh installer verified the manifest against the tagged workflow, then checked both archives and the source commit listed in it. A current report included a task accepted 55 ms before it returned, in the same second. The explicit whole-second cutoff excluded it. A competing local runner exited 75. [Release checks](trials/5.0.1-release.json) |

Between the two release tags, the core chapters grew from 2,151 to 2,157
lines. The adoption guide fell from 296 to 270 lines. The default procedures
grew from 1,185 to 1,493 lines, chiefly for train commissioning and metrics.

Use an operator shell with writable GitHub CLI and npm caches for installation.
Each project supplies its own profile, trusted checks, runner and test suite
for the components it enables. The Passapure trial covered installation,
skill discovery and rollback on copied project material. Its production
workflow and deployment were outside the trial. Process effectiveness
requires comparable tasks and remains unmeasured.
