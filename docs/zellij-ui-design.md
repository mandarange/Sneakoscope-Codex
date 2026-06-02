# Zellij lane UI design

The Zellij lane frame is produced by `composeLaneFrame` in
`src/core/zellij/zellij-lane-renderer.ts`. It renders a single SKS worker lane's
state as a compact, width-safe, color-optional text frame. The function is pure
(no I/O) so gates can render it deterministically at any width.

## Information structure

The frame is a header row plus dash-titled sections:

- **SKS Lane** — header line `SKS Lane: <slot>` identifying the lane slot.
- **Mission / Mode / Fast / Workers / Codex child** — top-level status rows for
  the mission id, run mode, fast-mode state, worker count, and the Codex child
  process state.
- **Work** — `Current` (active file), `Queue` (pending work), `Patch` (patch
  state).
- **Safety** — `Lease` (write lease), `Protected` (protected paths), `Rollback`
  (rollback availability).
- **Blockers** — at most 3 blockers (`ZELLIJ_LANE_MAX_BLOCKERS`). When there are
  more, the overflow collapses to `+N more → <report>` pointing at the proof
  artifact. With no blockers the row reads `none`.
- **Reports** — `proof: <report path>` pointing at the lane proof artifact.
- **Keys** — footer command palette (see below).

## Width safety

- Default width is 80 columns (`ZELLIJ_LANE_DEFAULT_WIDTH`); the frame stays
  readable with no wraps or overflow at 80, 100, and 120 columns.
- Long values and paths use middle-ellipsis (`middleEllipsis`) so the head and
  tail of a path stay recognizable (e.g. `/Users/…/lane.json`).
- No rendered line exceeds the configured width.

## Color

- ANSI color is optional. `NO_COLOR` is respected — when it is set (and
  non-empty), color is disabled.
- Color is applied to **status tokens only**, never to whole lines. The status
  palette is: `ok` (green), `active` (cyan), `warning` (yellow), `blocked`
  (red).
- The screen proof strips ANSI before asserting, so the frame must be fully
  readable with color removed.

## Footer commands (must be real)

Every `sks ...` token in the footer is a real, runnable command (enforced by
`scripts/zellij-ui-design-check.mjs`). The palette is:

```
Ctrl+q detach · sks doctor --fix · sks zellij status · sks agent rollback-patches
```

`Ctrl+q` is the Zellij detach keybind; the remaining tokens are SKS commands.
The footer wraps onto additional lines when the width cannot hold the whole
palette.

## Runtime and dispatch

Every generated Zellij lane has a companion runtime manifest:

- `zellij-lane-runtime.json` at the mission agent ledger root.
- `lanes/<slot>/runtime.json` for each visible slot.
- `lanes/<slot>/command-inbox.jsonl`, `command-ack.jsonl`, and
  `command-outbox.jsonl` for nonblocking lane coordination.
- `lanes/<slot>/pane-id.json` for the current pane id and its evidence source.

The command bus is JSONL-first instead of FIFO-first so a writer never blocks
when a pane has not finished booting. The lane renderer acknowledges newly seen
commands into `command-ack.jsonl`; operators can queue commands with
`sks zellij dispatch --mission <mission> --slot slot-001 --text "..."`. Passing
`--write-pane` additionally uses Zellij `write-chars` only after the supervisor
has a reconciled real pane id.

The layout injects `SKS_ZELLIJ_*` env vars for the lane's ledger, state dir,
command bus, heartbeat, pane-id record, drain signal, dispatch throttle, and
nice level. Lane commands run through `nice -n 10` by default on Unix-like
systems so heavy parallel renders do not starve the interactive terminal UI.

## Example frame (80 columns, color stripped)

```
SKS Lane: executor-1
Mission      mad-M-20260530
Mode         active
Fast         on
Workers      3 active
Codex child  running
Work ───────────────────────────────────────────────────────────────────────
Current      src/core/zellij/zellij-lane-renderer.ts
Queue        2 pending
Patch        clean
Safety ─────────────────────────────────────────────────────────────────────
Lease        held
Protected    .sneakoscope/, dist/
Rollback     available
Blockers ───────────────────────────────────────────────────────────────────
  +1 more → .sneakoscope/reports/lane-executor-1.json
Reports ────────────────────────────────────────────────────────────────────
  proof: .sneakoscope/reports/lane-executor-1.json
Keys ───────────────────────────────────────────────────────────────────────
Keys: Ctrl+q detach · sks doctor --fix · sks zellij status · sks agent rollback-patches
```

## Enforcing gates

| Gate | Enforces |
|------|----------|
| `zellij:ui-design` | footer commands are real; section structure and labels are present |
| `zellij:lane-renderer` | `composeLaneFrame` is width-safe at 80/100/120 with middle-ellipsis on long paths |
| `zellij:screen-proof` | the frame is readable with ANSI stripped; `NO_COLOR` disables color; only status tokens are colored |
