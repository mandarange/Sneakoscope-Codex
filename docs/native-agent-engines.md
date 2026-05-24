# Native Agent Engines

SKS 1.16.0 release note.

Native agents support four backend modes:

| Backend | Purpose | Parallel Claim |
| --- | --- | --- |
| `fake` | Fixture/selftest output | Never |
| `process` | Local process-shaped worker execution | No real Codex parallel claim |
| `codex-exec` | Prepared Codex exec worker command with JSON schema output | Allowed only when real execution succeeds |
| `tmux` | Session/lane adapter surface | Requires lane evidence before real claims |

The codex-exec backend prepares workers with `--json`, `--output-schema schemas/codex/agent-result.schema.json`, `--output-last-message`, `--ephemeral`, `--ignore-user-config`, and `--ignore-rules`. It defaults to dry-run preparation unless explicitly allowed to run for real.

The tmux backend writes an `agent-tmux-report.json` plan with a native-agent overview pane and self-closing worker pane policy. If tmux is not launched, the result remains a structured blocker rather than a real parallel execution claim.

Removed legacy multi-agent engines are not a release-supported diagnostics or route-finalization surface; Team/Research/QA/Review route finalization relies on native `agents/agent-proof-evidence.json`.
