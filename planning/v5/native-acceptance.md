# Native metrics and recovery verification, 20 November 2026

The verification used the installed commands from a temporary
`@kostysh/development-methodology-tools@0.5.0` tarball with SHA-256
`e1194cc4cdbcb41f11807674d6df24d736b8fe3df9c5d39f0587eb8f9c575072`.
The release build has its own artifact identity. Node.js was 24.15.0 on Linux.
Each client ran in a new private home and linked Git worktree. A local
deterministic provider supplied model responses, including tool calls.
The real clients executed the tools, performed compaction, dispatched the
installed hooks and persisted their own session records.

| Native client and operation | Observed journal and independent readback |
| --- | --- |
| Codex CLI 0.171.0, stdio App Server. Installed project hooks, listed and trusted their exact hashes in the disposable home. Bound the thread by submitting the one-time challenge. Executed a shell tool, called `thread/compact/start`, then executed the recovery tool. | Two tool starts, two finishes, one completed compaction, six usage events and zero coverage gaps. Both native command items completed with exit 0. A different thread ran a successful shell command in the same project and left the journal byte-identical. Replaying the bound compaction and stop selectors, including delayed collection, also left it byte-identical. |
| VS Code Insiders 1.148.0-insider with the Anthropic Claude Code extension and CLI 2.1.328. Invoked the extension's `claude-vscode.terminal.open` command with `claudeCode.useTerminal` in an isolated off-screen editor and private desktop session. The integrated terminal resolved `claude` on its temporary PATH to the extension's bundled binary. Submitted the challenge, executed Bash, invoked `/compact`, then executed the recovery tool. | One usage event after binding. The first Bash brought usage to three, tool starts to one and finishes to one. Compaction produced one completed boundary. The second Bash brought usage to five, tool starts to two and finishes to two. The foreign conversation's Bash left all counts unchanged. Replaying the approved compaction and stop selectors left the journal byte-identical. Zero coverage gaps. |

The Codex worktree needed both its local `.codex/` discovery directory and
the corresponding main checkout's hook file. On Claude, the client can flush
a boundary after the synchronous compaction hook returns. The installed
collector's delayed projection and the terminal session-end hook reconciled
the durable record. A separate native Claude CLI drill observed two completed
compactions and a failed tool invocation.

For each client the installed synchronous `SessionStart` recovery hook
supplied the saved task state and fresh Git snapshot after compaction.
The fixture started its external operation once. The deterministic provider
selected the recovery command when it observed the packet. Its first tool
after compaction read the original launch commit, stdout, stderr and exit
status 17. All four saved facts appeared together in the actual tool output.
This exercises host delivery and saved-result access. The graphical Claude
chat panel and independent live-model judgment were outside these runs.
Earlier live recovery jobs have their own [evidence](recovery-pilot.md).

A separate anonymous `github-sync` read of the public
[pilot PR](https://github.com/kostysh/development-methodology/pull/2)
recorded one opening, one merge, two run starts and finishes, two job starts
and finishes, and 22 terminal steps on its selected head. GitHub returned an
empty PR list on those historical runs. The collector verified the unique
commit-to-PR link, head repository, branch and SHA. A repeat read added zero
journal bytes. These observations measure collector behavior on the named
inputs. They do not measure an improvement in delivery time or cost.
