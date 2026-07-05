// non-interactive contract: any subprocess-invoking system can gate readline prompts on agentModeActive() without hanging.

export function agentModeActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKS_AGENT_MODE === '1';
}

export interface InteractiveInputRequiredResponse {
  ok: false;
  error: 'interactive_input_required';
  question: string;
  non_interactive_hint: string;
}

export function interactiveInputRequiredResponse(question: string, nonInteractiveHint: string): InteractiveInputRequiredResponse {
  return {
    ok: false,
    error: 'interactive_input_required',
    question,
    non_interactive_hint: nonInteractiveHint
  };
}

// Existing gate-skipping env vars (see src/core/update-check.ts, src/core/update/update-migration-state.ts) that
// agent mode should also imply are set once the later integration step wires SKS_AGENT_MODE into the CLI entrypoint.
export const AGENT_MODE_ENV_PASSTHROUGH: readonly string[] = [
  'SKS_UPDATE_MIGRATION_GATE_DISABLED',
  'SKS_DISABLE_UPDATE_CHECK'
];
