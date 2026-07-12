# Runtime Migration: tmux To Zellij

SKS 1.18.13 removes the tmux pane/session runtime. Zellij is now the only supported lane runtime.

- Use `sks --mad` for MAD-SKS Zellij launch.
- Use `sks naruto status latest` and `sks naruto subagents latest` for the official Naruto workflow. `sks team open-zellij` and `sks team attach-zellij` remain legacy helpers for old Team cockpit lanes only; pane count is not subagent evidence.
- Use `sks zellij-lane --mission <id> --slot <slot> --ledger-root <path>` inside layouts.
- Install Zellij manually when doctor reports it missing. On macOS: `brew install zellij`.

There is no tmux fallback or compatibility shim. The `sks tmux` command exists only as a removal notice.
