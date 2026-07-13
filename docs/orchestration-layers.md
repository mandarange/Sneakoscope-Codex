# Orchestration Layers

SKS separates the public Codex workflow from compatibility runtimes and visual
harness surfaces.

## User Entry Points

- `$Naruto` / `sks naruto run`: the canonical Codex official subagent workflow.
- `$Team`, `$Work`, `$Swarm`, `$ShadowClone`, and `$Kagebunshin`: compatibility
  aliases that route new work to the same Naruto workflow.
- `sks agent run`: a separate agent-runtime command retained for its documented
  mission and patch-queue surfaces; its process evidence is not Naruto proof.

## Official Naruto Path

- `src/core/subagents/**`: task profiles, model selection, thread budgets,
  official delegation prompts, event correlation, and completion evidence.
- `src/core/hooks-runtime.ts`: records official `SubagentStart` and
  `SubagentStop` events and evaluates them at the parent Stop boundary.
- `src/core/commands/naruto-command.ts`: a thin facade for argument parsing,
  official configuration, delegation context, mission artifacts, and status.

The current parent agent owns decomposition, integration, verification, and the
final answer. Codex owns the agent threads. App sessions do not create a nested
Codex process; standalone CLI use may create one parent process only.

## Separate Runtime And Historical Evidence

- The historical Naruto process-swarm command and its environment opt-in are
  removed. Public Naruto cannot load a custom scheduler, pool, process swarm,
  patch queue, or alternate model fanout.
- `src/core/agents/**` supports the separate explicit `sks agent` and MAD-SKS
  runtimes plus read-only interpretation of old mission artifacts; it is not a
  Naruto execution fallback.
- `src/core/zellij/**` is terminal UI and harness support. Pane count is not
  official subagent execution evidence.

## Placement Rule

- Public Naruto behavior belongs in the thin command, subagent policy modules,
  route policy, and hook evidence handling.
- Official model, budget, prompt, and event semantics belong in
  `src/core/subagents/**`.
- Scheduler, patch, and process mechanics used by separate explicit runtimes
  must remain unreachable from the Naruto hot path.
- Visual pane rendering and telemetry presentation belong in `src/core/zellij/**`
  and must not become a default release blocker.
