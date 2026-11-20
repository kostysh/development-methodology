# External adoption review follow-up

The independent review tested `methodology-v5.0.0` and reported four
adoption blockers. Its original SHA-256 is
`72e031849aa367d574770e6da8772c219e39830bc5b73fdf63cb423fc2094e2f`.
The 5.0.0 acceptance record describes its own setup. It does not establish
readiness for a fresh installation in an existing project.

| Review item | Change in 5.0.1 | Acceptance observation |
| --- | --- | --- |
| B1, D6. Sandbox metrics and test execution | A workspace task spools observations. The coordinator imports them into a private journal. A wrapped test runs once per invocation and returns its own exit code when collection fails. | In a real Codex workspace sandbox the coordinator imported seven observations. An immediate replay added zero. The test returned its original failure code. [Installed test record](trials/5.0.1-solo-metrics.md) |
| B2, D9. Train commissioning and controls | A single rule protects immutable submissions. To correct a return, edit the task branch and resubmit a new head under the same task key. The release includes the review/check publisher, exact-head results exporter, baseline workflow, verifier image recipe and PostgreSQL example. The runner renews its scoped App credential when needed. | Exercise a returned submission and its correction on a real protected branch. The installed test uses a controlled clock for two forty-minute suites. |
| B3. Existing project files | The adoption command stages a new release outside the project. It checks every artifact and refuses an occupied destination. The guide archive excludes the maintainer's root instructions. | Check the original project README, filled profile and instructions before and after an installation, a repeated installation and rollback. |
| B4. Solo owner authority | The agent acts on a delegated choice. If the owner needs to decide, the agent asks once and records the chat reply. Publication uses the project's existing independent authority. | An ordinary account recorded and corrected a reply. Neither a chat note nor a receipt writable by that account could release the optional machine gate. [Installed test record](trials/5.0.1-solo-metrics.md) |
| D5, D8, D10. Native hooks and recovery | The operator binds a visible session ID from a terminal. The selected client must deliver a callback. The installer stores machine paths privately, shares portable commands in project settings and removes its own registrations on rollback. | Verify collection, native compaction, recovery, unrelated sessions and rollback on the selected client. |
| D7. Mandatory test inventory | The release owner records the reviewed inventory digest outside the candidate. CI checks it before executing candidate code. The installed-package check also checks the actual named test results. | Deleting a mandatory test and its inventory row together in a disposable copy returned exit 1 with the inventory-mismatch diagnostic. |
| D11. Traceable evidence | Match all release acceptance observations to their tools archive digest. Record model transport, client surface and observable result separately. | Older observations are historical. The correction record retains only task-scoped, sanitized observations. |
| D12. Small defects | Packaged links use the release tag. The adoption command verifies the checksum manifest against the tagged GitHub Actions build. A summary defaults to the current instant. Resource contention returns 75. | Verify the release manifest at download, same-second task completion in a default report and contention on a real runner lock. |

These are verification results and project commissioning requirements.
Adopters select their own controls, decision classes and client surfaces.
Project-wide time saved requires comparable tasks and remains unmeasured.
