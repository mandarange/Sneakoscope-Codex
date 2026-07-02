# Orchestration Layers

SKS has four orchestration surfaces. New work should choose the highest layer that matches the user concern.

## User Entry Points

- `$Team` / `sks agent run`: default code-changing and multi-step execution route. It owns task decomposition, worker scheduling, integration, verification, and final proof.
- `$Naruto` / `sks naruto run`: high-throughput Team-derived route for many parallel work items. It should use the native agent kernel and canonical stop-gate evaluation rather than carrying separate gate logic.

## Internal Implementations

- `src/core/agents/**`: native worker kernel, scheduler, lifecycle, ledgers, patch queue, worktree handling, and trust reports. New execution mechanics usually belong here.
- `src/core/zellij/**`: terminal UI/harness visibility for workers. Zellij gates are harness gates and must not block the release preset unless the user-facing concern is specifically terminal UX.

## Placement Rule

- User-visible workflow behavior belongs in Team/Naruto commands and route policy.
- Worker lifecycle, retry, timeout, and patch mechanics belong in `agents`.
- Visual pane rendering, launch layout, and telemetry presentation belong in `zellij`.
- A new feature must document whether it is user-facing orchestration or internal harness support before adding a gate.

Long term, Naruto should continue converging on the native Team/agents kernel so stop-gates, lifecycle, telemetry, and proof contracts are shared instead of duplicated.
