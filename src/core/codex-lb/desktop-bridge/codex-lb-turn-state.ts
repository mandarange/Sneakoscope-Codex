import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

/**
 * `x-codex-turn-state` values Codex-LB issued, per thread and key.
 *
 * Codex echoes back the turn-state its last response carried, so the sticky
 * account binding inside a turn survives the bridge. Codex-LB honours only the
 * values it issued under the same key and answers any other with 502
 * `turn_state_owner_unavailable` — and a thread can carry one from the official
 * backend, or from before a key change. Only values this bridge saw Codex-LB
 * issue for the same thread and key travel to it; the rest are dropped.
 * In memory only: a turn-state outlives no restart that would need it.
 */
const MAX_THREADS = 4_096;
const MAX_VALUES_PER_THREAD = 8;
const issued = new Map<string, string[]>();

function scope(threadId: string, keyFingerprint: string): string {
  return `${keyFingerprint}\u0000${threadId}`;
}

function headerValues(value: string | string[] | number | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
  return values.map((entry) => entry.trim()).filter(Boolean);
}

export function rememberCodexLbTurnState(threadId: string | null, keyFingerprint: string, headers: IncomingHttpHeaders): void {
  const values = headerValues(headers['x-codex-turn-state']);
  if (!threadId || !values.length) return;
  const key = scope(threadId, keyFingerprint);
  const kept = (issued.get(key) ?? []).filter((value) => !values.includes(value));
  issued.delete(key);
  issued.set(key, [...kept, ...values].slice(-MAX_VALUES_PER_THREAD));
  while (issued.size > MAX_THREADS) issued.delete(issued.keys().next().value as string);
}

/** Leaves a client turn-state on a Codex-LB request only when Codex-LB issued it for this thread and key. */
export function admitCodexLbTurnState(headers: OutgoingHttpHeaders, threadId: string | null, keyFingerprint: string): void {
  const values = headerValues(headers['x-codex-turn-state'] as string | string[] | number | undefined);
  if (!values.length) {
    delete headers['x-codex-turn-state'];
    return;
  }
  const known = threadId ? issued.get(scope(threadId, keyFingerprint)) : undefined;
  if (values.length === 1 && known?.includes(values[0]!)) return;
  delete headers['x-codex-turn-state'];
}

export function forgetCodexLbTurnStates(): void {
  issued.clear();
}
