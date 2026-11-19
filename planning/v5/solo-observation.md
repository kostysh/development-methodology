# Prospective solo decision observation

The owner opened a 14-day observation window for `v5` from **November 19,
2026 at 20:25 UTC to December 3 at 20:25 UTC**. Enroll a future task
explicitly as solo before observing it. The study opened with zero enrolled
tasks. Keep the default decision classes empty throughout observation.

1. Give a designated solo task an opaque local alias and private
   [collector profile](../../defaults/process-metrics.md). Bind its normalized
   manual sources to that alias. Retain the decision type and the actual start
   and end of a block. Technical IDs only pair and deduplicate events.
   Do not access conversation histories. The existing team tasks are outside
   this sample.
2. Classify a decision when it arises. Use `material_reversible` for a
   material choice with an evident reversible default, `material_other` for
   other material choices, `permission` for an observed permission request,
   and `unclassified` when the category is unclear. Use the class as the
   manual source name. Record no question, answer, command, or work content.
3. Use `decision.requested` with its observed blocking flag. Emit
   `decision.blocked` only when the dependent operation actually stops,
   and `decision.resolved` when it can proceed. A later response or elapsed
   night alone cannot establish a wait. Keep an unknown time missing.
   Use the same opaque decision and operation IDs on the paired events.
4. At the cutoff, report enrolled tasks, observed decisions by type,
   actual blocking intervals, missing endpoints, and overnight overlap
   where observable. Overlapping intervals count once in elapsed time.
   Record unobserved permission checks as unknown. With sparse or
   incomparable observations, leave the decision open. Only the owner can
   authorize classes for the separate one-month pilot.

In a disposable setup, the existing collector measured a 10-second block
after a request initially allowed independent work. It recognized all five
replayed events and rejected a row for an unenrolled task. These fixture
results validate the recording route. They do not enter the study journal.
