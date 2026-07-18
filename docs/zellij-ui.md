# SKS Zellij UI

The MAD and Naruto Zellij UI uses one orchestrator pane, one live monitor pane, and a small fixed set of dynamically bound viewport panes. It does not create one pane per agent. The default is one viewport and automatic layout expansion is capped at three, so subagent visibility does not consume the whole terminal.

```text
orchestrator | subagent monitor
             | viewport 1/N -> highest-priority active slot
             | viewport 2/N -> pinned or auto-bound slot
             | viewport 3/N -> auto-bound slot
```

The monitor renders the whole fleet as a top-style table: running, verifying, queued, done, failed, generation, flush count, recent high-activity rows, and a footer summarizing hidden rows. Each viewport reuses the compact slot renderer and binds to the most useful thread at that moment. Pins override automatic binding.

Official Codex subagent hooks feed the telemetry surface. `SubagentStart` creates a `running` row, `SubagentStop` changes it to `verifying`, and only a trustworthy structured parent thread outcome may change it to `completed` or `failed`. While a child is running, supported Codex activity is tailed from the exact rollout whose first `session_meta.payload.id` matches the hook `agent_id` and whose source is an official subagent. The pane shows bounded, redacted phase labels and safe progress details such as commentary, tool/MCP/web-search phase, patch count, and current file; raw reasoning, command arguments, and tool output are not rendered. Concurrent threads are never correlated through shared `session_id` or `turn_id`.

The rollout tail is display-only and never contributes completion proof. Unsupported versions, a mismatched id, a non-subagent rollout, ambiguous format, or missing files simply leave lifecycle/elapsed telemetry in place rather than fabricating progress. The bridge mirrors route telemetry into the owning Zellij host mission, includes the observed role/model/reasoning and bounded result tail, starts a new generation when a thread id is reused, and keeps recent completed work visible for 60 seconds. Ambiguous stop text never becomes a successful row by itself.

## Modes

| Mode | Use |
| --- | --- |
| `compact-slots` | Default worker-slot view with concise status, task, progress, file, blockers, and log tail. |
| `full-debug` | Adds session, loop, gate, and event details for diagnostics. |

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `SKS_ZELLIJ_UI_MODE` | `compact-slots` | `compact-slots` or `full-debug`. |
| `SKS_ZELLIJ_COLOR` | enabled | Set `0` to disable color. `NO_COLOR=1` also disables color. |
| `SKS_ZELLIJ_VIEWPORTS` | `1` | Number of fixed viewport panes, clamped to `0..3`. `0` means monitor only. |
| `SKS_ZELLIJ_MONITOR_ROWS` | `12` | Maximum visible activity rows in the monitor, minimum `4`. |
| `SKS_ZELLIJ_MONITOR_PANE` | enabled for MAD/Naruto | Set `0` to hide the monitor pane. |
| `SKS_ZELLIJ_REFRESH_MS` | `1000` | Watch-pane refresh interval, minimum `500`. |
| `SKS_ZELLIJ_MOUSE_MODE` | Zellij default | Passed through for operator/session customization. |
| `SKS_ZELLIJ_KEEP_SESSION` | reset auto MAD sessions | Set `1` to keep an existing same-name session. |

## CLI Flags

`sks --mad --zellij-compact-slots` and `sks --mad --zellij-full-debug` select the UI mode for the launch. The Zellij surface uses compact slot and viewport panes only.

Use `sks --mad --zellij-viewports 3 --zellij-refresh-ms 750` (or the matching environment variables) to start with the maximum three fixed viewport panes plus the monitor and a 750 ms render interval.

Use `sks zellij pin slot-003 --viewport 2` to keep a slot in a viewport. Use `sks zellij unpin slot-003 --viewport 2` to return it to automatic binding.
