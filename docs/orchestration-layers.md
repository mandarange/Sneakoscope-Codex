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

## Compatibility Implementations

- `src/core/commands/naruto-command-legacy.ts` and `src/core/agents/**` retain
  historical process-swarm and agent-kernel behavior where still supported.
- Legacy Naruto behavior is loaded only with
  `SKS_NARUTO_LEGACY_PROCESS_SWARM=1`; it is never an automatic fallback.
- `src/core/zellij/**` is terminal UI and harness support. Pane count is not
  official subagent execution evidence.

## Placement Rule

- Public Naruto behavior belongs in the thin command, subagent policy modules,
  route policy, and hook evidence handling.
- Official model, budget, prompt, and event semantics belong in
  `src/core/subagents/**`.
- Legacy scheduler, patch, and process mechanics stay isolated from the default
  Naruto hot path.
- Visual pane rendering and telemetry presentation belong in `src/core/zellij/**`
  and must not become a default release blocker.
