# SKS Zellij UI

The MAD and Naruto Zellij UI uses one orchestrator pane, one live monitor pane, and a fixed set of dynamically bound viewport panes. It does not create one pane per agent. A mission can grow from 3 workers to 100 workers while the pane count stays stable.

```text
orchestrator | swarm monitor
             | viewport 1/N -> highest-priority active slot
             | viewport 2/N -> pinned or auto-bound slot
             | viewport 3/N -> auto-bound slot
             | viewport 4/N -> idle or next active slot
```

The monitor renders the whole fleet as a top-style table: running, verifying, queued, done, failed, generation, flush count, recent high-activity rows, and a footer summarizing hidden rows. Each viewport reuses the compact slot renderer from worker telemetry and binds to the most useful worker at that moment. Pins override automatic binding.

## Modes

| Mode | Use |
| --- | --- |
| `compact-slots` | Default worker-slot view with concise status, task, progress, file, blockers, and log tail. |
| `dashboard-plus-slots` | Slightly taller slot frames for missions that need more live context. |
| `full-debug` | Adds session, loop, gate, and event details for diagnostics. |

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `SKS_ZELLIJ_UI_MODE` | `compact-slots` | `compact-slots`, `dashboard-plus-slots`, or `full-debug`. |
| `SKS_ZELLIJ_COLOR` | enabled | Set `0` to disable color. `NO_COLOR=1` also disables color. |
| `SKS_ZELLIJ_VIEWPORTS` | `4` | Number of fixed viewport panes, clamped to `0..6`. `0` means monitor only. |
| `SKS_ZELLIJ_MONITOR_ROWS` | `12` | Maximum visible activity rows in the monitor, minimum `4`. |
| `SKS_ZELLIJ_VISIBLE_PANES` | legacy/debug only | Legacy worker-pane cap used only when `SKS_ZELLIJ_LEGACY_WORKER_PANES=1`. |
| `SKS_ZELLIJ_LEGACY_WORKER_PANES` | disabled | Set `1` to restore the old worker-pane creation path for debugging. |
| `SKS_ZELLIJ_MONITOR_PANE` | enabled for MAD/Naruto | Set `0` to hide the monitor pane. |
| `SKS_ZELLIJ_REFRESH_MS` | `1000` | Watch-pane refresh interval, minimum `500`. |
| `SKS_ZELLIJ_MOUSE_MODE` | Zellij default | Passed through for operator/session customization. |
| `SKS_ZELLIJ_KEEP_SESSION` | reset auto MAD sessions | Set `1` to keep an existing same-name session. |

## CLI Flags

`sks --mad --zellij-compact-slots`, `sks --mad --zellij-dashboard`, and `sks --mad --zellij-full-debug` select the UI mode for the launch.

Use `SKS_ZELLIJ_VIEWPORTS=5 sks --mad` to start with five fixed viewport panes plus the monitor.

Use `sks zellij pin slot-003 --viewport 2` to keep a slot in a viewport. Use `sks zellij unpin slot-003 --viewport 2` to return it to automatic binding.
