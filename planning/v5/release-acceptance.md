# Methodology v5 release acceptance, 20 November 2026

## Published distribution

| Delivery | Source commit | SHA-256 |
| --- | --- | --- |
| [Guide 5.0.0](https://github.com/kostysh/development-methodology/releases/tag/methodology-v5.0.0) | `24712f54bf894bf17028bee4e22bd7be745640cc` | `db891e528655534039e8bd306f1683349e86aa06f50624f2399088d8762a6a2b` |
| Tools 5.0.0, same release | `24712f54bf894bf17028bee4e22bd7be745640cc` | `432feb13e6ae9da28ef8992cbeb01cb4a05f67c96c1fe6e59045ffbbd9e9cfbc` |
| [Skills v5.0.0, catalog of 37 archives](https://github.com/kostysh/skills/releases/tag/skills-v5.0.0) | `4b0f21d68a209197e4ad2dad54133afa13b89257` | `060fd26552e556bfd6def86a3b82e399e18e884ca22afc7b22734aca146045ed` |

The [tools CI run](https://github.com/kostysh/development-methodology/actions/runs/44733398218) passed all 139 required cases. A separate package check installed the archive offline and ran the named cases through the installed commands. The gate rejects a missing, skipped or substituted case. The public download matched the CI artifact. The [27 controlled faults](control-acceptance.md) exercise the assertions for the frozen test baseline. The [runtime review](runtime-review.md) records the fixes for task attribution, shared state and publication authority.

The [skills release workflow](https://github.com/kostysh/skills/actions/runs/44735577234) built the publisher, packed and installed the archives, and published the tested bytes. An independent download matched every CI file, including the 37 archives, catalog, source commit and checksum manifest. The [CLI checks](https://github.com/kostysh/skills/actions/runs/44735299019) passed on Linux, macOS and Windows after fixes for a path alias on macOS and the Windows packaging timeout. Both GitHub releases use named prerelease tags. The adoption guide selects those tags explicitly.

The [independent skill re-audit](https://github.com/kostysh/skills/blob/4b0f21d68a209197e4ad2dad54133afa13b89257/docs/reviews/v5-solo-independent-reaudit.md) accepted the final skill changes. The first candidate passed both primary blind cases. A subsequent correction clarified local decision-record authority. In the additional case, both the first and final candidates wrote the pending decision in the authorized project register. The other three skill archives remained byte-identical across the correction. The [cases and scoring](https://github.com/kostysh/skills/tree/4b0f21d68a209197e4ad2dad54133afa13b89257/docs/reviews/v5-solo-trials) identify the versions and observations.

## Native hooks and recovery

Two isolated installations used the published tools under Node.js 24.15.0 on Linux. Each bound session executed two real tool calls and compacted its context once. Both clients delivered the saved state and a fresh Git snapshot. The first tool call after compaction retrieved the recorded launch commit, stdout, stderr and exit code 17 of an operation that ran once.

| Client and surface | Tool starts / finishes | Completed compactions | Usage records | Reported coverage gaps |
| --- | ---: | ---: | ---: | ---: |
| Codex CLI 0.171.0, stdio App Server | 2 / 2 | 1 | 6 | 0 |
| Claude Code 2.1.328, extension command in the VS Code Insiders 1.148.0 integrated terminal | 2 / 2 | 1 | 5 | 0 |

A second session on each client executed a tool. Its actions left the bound journal byte-identical. Replaying a bound compaction and stop also preserved both journals. The clients used deterministic local model endpoints. The editor ran on a private display with disposable profiles. The Claude graphical chat panel was outside this check. [Host setup and observations](native-acceptance.md)

## Merge train on GitHub

The final installed train integrated [PR 4](https://github.com/kostysh/methodology-v5-acceptance/pull/4) and [PR 5](https://github.com/kostysh/methodology-v5-acceptance/pull/5) into the protected test branch in one dispatch. The exact input heads were `708e04d3d7147db2c67e14946659c77f5681cb85` and `29cbc983b7086145317159e42f2d86ac7f4a486b`. Their [first admission check](https://github.com/kostysh/methodology-v5-acceptance/actions/runs/44735053703) and [second admission check](https://github.com/kostysh/methodology-v5-acceptance/actions/runs/44735058684) passed. One Docker full-suite run accepted the combined candidate.

GitHub recorded the dedicated App `kostysh-v5-train-acceptance[bot]` as the writer in [rule suite 5256520091](https://api.github.com/repos/kostysh/methodology-v5-acceptance/rulesets/rule-suites/5256520091). Both PRs reached `MERGED`. The protected branch reached [commit `e647db9`](https://github.com/kostysh/methodology-v5-acceptance/commit/e647db9f24c656517e0284a6bc12a9c5d4791024), tree `230c65dd38b9442b0f59b692e65de584dea030d7`. Independent Git and HTTP reads confirmed the deployed commit and both new sample files byte for byte. The dispatch left an empty queue. Its receipt was `9d829b61-9273-47ad-85c1-dbb4609aaf55`, SHA-256 `0e1733568517815e485a628eaa27b564ebcbe495e5dd6484c93e066a33b7c895`.

An earlier direct write by the repository owner failed the rule. The [first two-PR trial and seven failure scenarios](train-runtime-acceptance.md) document retry, exclusion, stale publication, process overlap and deployment recovery. The scheduled entry point ran in a configured slot. A hosted overnight cron invocation was outside this acceptance.

## Independent installation and first task

An independent adopter began with the released guide, an empty tools installation and a fresh clone using `.worktree/v5-cold`, the linked-worktree layout used by Passapure. The operator supplied the commissioned GitHub App, runner profile and test deployment. The adopter downloaded both named releases, installed two selected skills under the project's `.agents/skills` and installed the tools offline. The installed link checker accepted all 41 published guide files. The adopter used the published packages throughout the trial.

- **Automatic collection.** A bound Codex session produced actual tool and compaction records. A fresh foreign session in the same checkout and a replay of a real bound tool event both preserved the original journal bytes. After a second compaction, the saved checkpoint and fresh Git snapshot reached the next request, followed by another real tool action.
- **Delivery.** [PR 3](https://github.com/kostysh/methodology-v5-acceptance/pull/3) added a single 17-byte sample. [CI](https://github.com/kostysh/methodology-v5-acceptance/actions/runs/44734554991) passed on its exact head `47db06772a9dbfefbc3a41df523eccd09549527f`. The installed train initially rejected a group-writable operator rules file. After the owner set mode `0600`, one full suite passed and the train published [commit `1c0e59b`](https://github.com/kostysh/methodology-v5-acceptance/commit/1c0e59b6a0d79947a336f440085e9e640e951caf). Separate HTTP reads returned that revision and the precise sample including its final newline.
- **Skills and report.** A fresh Codex client discovered the two project skills. Each loaded into a native turn and guided a real read of Git or GitHub. Those reads reconciled the exact CI revision and the later branch advance after PRs 4 and 5. Repeating GitHub synchronization preserved the journal bytes. The task report returned 632,547 ms from its recorded start to acceptance, one CI attempt, two observed compactions and one matching train observation. The seven-day quality window was still open. No quality ratio was available for that delivery.
- **First-install rollback.** After hook removal, the independent recovery handler remained. The adopter restored the initial local paths and settings. A fresh session discovered zero project hooks and skills. The prior check accepted the exact sample and rejected the same missing newline as before installation. The local clone was clean. GitHub protections, writer and previously verified deployment remained consistent with the accepted deliveries.

This trial used a disposable project and deterministic model transport. It observed installation, use, integration, recovery and local rollback. It supplies no estimate of savings or production quality for Passapure.

## Upgrade and rollback with existing project tooling

A separate disposable clone began with a working project-owned npm hook and check, plus a project skill from the preceding stable release. Three fresh Codex clients loaded the active project configuration before, during and after the upgrade. The original skill 0.2.4 came from archive `39340ad09def674e19dc51e682f7e35b56669887273383b736137f63612d2e97`. The v5 skill 0.2.6 came from `20db5edcd1d26eb67ea20319455bbf24a8387f5e2f8359d6cfaa122d92ece85b`. Both archives matched their published catalogs.

The original hook recorded a real tool action. During the upgrade the v5 hook recorded a bound tool start and finish. After rollback, the fresh client discovered the original skill at its original path and loaded its original bytes. Its earlier hook recorded a new event and preserved the original journal prefix. The v5 journal retained its last bytes. The earlier executable, profile, hook settings and npm lockfile matched the saved copies. The restored check passed the exact sample and rejected the same known violation. Both Git checkouts were clean.
