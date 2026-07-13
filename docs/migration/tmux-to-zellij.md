# Runtime Migration: tmux To Zellij

SKS 1.18.13 removes the tmux pane/session runtime. Zellij is now the only supported lane runtime.

- Use `sks --mad` for MAD-SKS Zellij launch.
- Use `sks naruto status latest`, `sks naruto subagents latest`, and `sks naruto proof latest` for the official Naruto workflow.
- Legacy Team observation is read-only (`log`, `tail`, `watch`, `lane`, `status`). `sks team open-zellij`, `attach-zellij`, and `cleanup-zellij` were removed; Zellij pane count is never subagent evidence.
- The fixed right-side monitor/viewport panes now refresh exact official-subagent activity from supported Codex rollout files. They show only redacted phase/file progress and remain display-only; structured parent outcomes still decide completion.
- Use `sks zellij-lane --mission <id> --slot <slot> --ledger-root <path>` inside layouts.
- Install Zellij manually when doctor reports it missing. On macOS: `brew install zellij`.

There is no tmux fallback or compatibility shim. The `sks tmux` command exists only as a removal notice.
