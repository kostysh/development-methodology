# Collector pilot on the methodology branch

The owner approved the stage 5 protected test manifest as the next
methodology task on `v5`. It is identified locally as
`V5-BASELINE`. It has an observable result. The built tool must accept a
clean baseline and detect a changed protected test or runner setting even
when a shell writes the file. The implementation has a natural branch, CI,
review, acceptance and integration history. Stage 5 owns its full contract.

| Decision | Authorized boundary |
| --- | --- |
| Integration | One issue and one PR into `development-methodology/v5`, using a temporary pilot worktree and topic branch. Record the accepted commit, actual merge time and worktree removal. |
| Evidence | Use only this task's declared agent sessions and child sessions, issued task events, Git refs, PR metadata, test exits, CI job/step metadata and review decisions. Inspect only allowlisted fields locally. Raw prompts, transcripts, command bodies, headers, credentials and source files stay out of the journal and repository. |
| Storage | Keep the private profile, identity key and journal outside Git in a task-specific local state directory. Configure any needed hooks only for the pilot worktree. Stop importing a shared session when its attribution becomes ambiguous. |
| Historical comparison | Before starting collection, record the observable project Git and CI milestones and missing sources. Independently reconstruct the pilot using the previous process's data sources. Compare the same window and denominator with the instrumented chronology. Keep the original I1 study as a calibration case. An unavailable historical denominator leaves the numerical cross-project comparison open. |
| Checks | Match issue, PR, revisions, worktree, sessions and explicit task switches. Record pre-PR activity, actual decision blocks, concurrent work, retries and any cancelled or stale attempts. Separate controlled exercises from events that occurred in delivery. A missing event stays unobserved. |
| Follow-up | At actual merge plus 168 hours, classify subsequent changes by their confirmed purpose. The owner reviews coverage, disagreement with the manual chronology and rework, then decides whether to retain the collector. Until then the pilot remains open. |

The owner authorized task-only collection and worktree-local hooks on
2026-11-19. The observer keeps a private manual chronology and a local
journal. On independent acceptance and green checks, the authorized target
for the temporary `pilot/v5-baseline-manifest` branch is `v5`.
Execution began at 18:40:09 UTC. [Issue 1](https://github.com/kostysh/development-methodology/issues/1)
opened at 18:42:50 UTC. The historical preflight identified a prior v5
package-check duration, with task acceptance, operator activity and
seven-day rework unavailable from the permitted earlier evidence. These
observations serve different measures. The general package contains no
project-specific pilot records.
