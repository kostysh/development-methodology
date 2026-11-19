# Set up task recovery

For an adopting project that uses agents, select a tested release of the
companion and record its command and host version in the [project
profile](../PROJECT-PROFILE.md#tools-and-checks). The
[task state template](../templates/task-state.md) supplies a starting point.
The [chapter 12 steps](../method/12-agents.md#context-recovery) govern its use.

1. Bind a trusted local JSON profile outside the worktree to one task.
   Set `task_id` to its filename-safe alias, `worktree` to the absolute Git
   worktree root and `line_limit` to the positive line limit the project
   accepts. Add an ignore rule for `.methodology/task-state/` before writing
   the first file. Keep the profile, task state and retained outputs private.
2. Send the updated Markdown on stdin to `methodology-recovery write PROFILE`.
   The writer replaces `.methodology/task-state/<task_id>.md` atomically.
   Use a single designated writer for a task. A rejected update leaves
   the preceding file available. Check the accepted size when recovering
   a file that an editor changed directly.
3. Run `methodology-recovery snapshot PROFILE` for current Git facts. In the
   profile, select the base ref, GitHub repository and applicable issue, PR
   or run IDs, and authoritative records for owned resources. Record type,
   ID, owner, lease where applicable and how to read each source. A
   configured but unavailable fact appears as a gap. Review CI against the
   actual candidate revision. A lease that expired or a PID that vanished
   needs an independent outcome or cleanup readback.
4. Configure the installed `methodology-recovery hook PROFILE` as a
   synchronous `SessionStart` command with the `compact` matcher. Bind it
   only to the intended worktree and verify hook discovery and trust on the
   actual client. Trigger a compaction and observe both packet delivery
   and the agent's first action. Repeat during a long run with saved
   stdout, stderr, exit status and launch revision. Try an interrupted
   session and a missing or oversized state file.
   [Codex hooks](https://learn.chatgpt.com/docs/hooks#sessionstart) ·
   [Claude Code hooks](https://code.claude.com/docs/en/hooks#sessionstart).

## Manual recovery

If the hook is unavailable, start with `methodology-recovery recover PROFILE`.
If the command itself is unavailable, read the task state, fetch the same
current facts from their owners and identify any gaps. If the file is
missing or too large, recover the scope, constraints and next step from
the task, accepted plan and operator instructions. Restore a valid file.
Keep dependent work on hold until its facts and authority agree. Use
saved outputs and exit status to recover a finished run. Give the operator
its result through the [checkpoint report](../templates/checkpoint-report.md).
