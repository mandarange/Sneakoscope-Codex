import { nowIso } from '../fsx.js';

// non-interactive contract: any subprocess-invoking system can gate readline prompts on agentModeActive() without hanging.

export function agentModeActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKS_AGENT_MODE === '1';
}

export type StreamEventKind = 'start' | 'progress' | 'partial' | 'result' | 'error';

export interface StreamEvent {
  event: StreamEventKind;
  ts: string;
  data: unknown;
}

const STREAM_EVENT_KINDS: readonly StreamEventKind[] = ['start', 'progress', 'partial', 'result', 'error'];

// Real-time consumers (e.g. a Slack bot relaying progress) parse stdout line-by-line;
// one write per event keeps events from interleaving mid-line under backpressure.
export function emitStreamEvent(event: StreamEventKind, data: unknown, out: NodeJS.WritableStream = process.stdout): void {
  if (!STREAM_EVENT_KINDS.includes(event)) throw new Error(`invalid stream event kind: ${String(event)}`);
  const line: StreamEvent = { event, ts: nowIso(), data };
  out.write(JSON.stringify(line) + '\n');
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
