/**
 * A thread that moves to another route target mid-conversation.
 *
 * Codex sends the whole history when the model changes, and that history holds
 * items only the producing account can read: reasoning `encrypted_content`,
 * output-replay `encrypted_content` on messages and `encrypted_function_args`
 * on function calls (both sent only to an "OpenAI" provider, which the bridge
 * always is to Codex), a native `compaction` item, response ids. Forwarded to
 * another provider — or to another identity behind the same API — they fail as
 * "could not be verified", `invalid_encrypted_content` or an unknown
 * `previous_response_id`, and no upstream repairs that.
 *
 * Reasoning is dropped for the rest of a moved thread's life: nothing records
 * which reasoning item came from which account, and a reasoning item is
 * optional context, while a foreign one is a hard failure. A native compaction
 * item cannot be dropped — it IS the conversation before it — so a move that
 * would carry one is refused instead, with Codex's non-retryable
 * `invalid_prompt` so the user reads why instead of watching retries.
 *
 * Pure: the forwarders decide when a request is a move (security.ts pins).
 */
import { DesktopBridgeError } from './types.js';
import { isNativeCompactionItem } from './compaction-adapter.js';

type JsonObject = Record<string, unknown>;

export interface ThreadRouteMove {
  from: string;
  to: string;
}

export const PROVIDER_HANDOFF_NATIVE_COMPACTION_REFUSED = 'bridge_thread_handoff_after_native_compaction';

const ROUTE_TARGET_NAMES: Readonly<Record<string, string>> = {
  openai: 'your ChatGPT account',
  'codex-lb': 'Codex-LB',
  openrouter: 'OpenRouter',
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function targetName(id: string): string {
  return ROUTE_TARGET_NAMES[id] ?? id;
}

export class ProviderHandoffRefusedError extends DesktopBridgeError {
  constructor(readonly move: ThreadRouteMove) {
    super(PROVIDER_HANDOFF_NATIVE_COMPACTION_REFUSED);
  }

  /** What Codex shows the user; provider names only, never request content. */
  userMessage(): string {
    return `This thread was compacted on ${targetName(this.move.from)}, and that compaction can only be read there. `
      + `Switch back to the model you were using, or start a new thread to continue on ${targetName(this.move.to)}.`;
  }
}

export function carriesNativeCompaction(payload: JsonObject | null): boolean {
  return Boolean(payload && Array.isArray(payload.input) && payload.input.some(isNativeCompactionItem));
}

/** Refuses a move whose history holds a compaction only the previous route can read. */
export function assertProviderHandoffAllowed(payload: JsonObject | null, move: ThreadRouteMove | null): void {
  if (!move || move.from === move.to || !carriesNativeCompaction(payload)) return;
  throw new ProviderHandoffRefusedError(move);
}

/** The HTTP answer to a refused move: Codex maps a 400 `invalid_prompt` to a non-retryable error showing the message. */
export function providerHandoffRefusalBody(error: ProviderHandoffRefusedError): string {
  return JSON.stringify({
    error: { type: 'invalid_request_error', code: 'invalid_prompt', message: error.userMessage(), param: error.code },
  });
}

/** The Responses WebSocket answer to a refused move; the socket stays open for the next create. */
export function providerHandoffRefusedEvent(error: ProviderHandoffRefusedError, responseId: string, publicModel: string): JsonObject {
  return {
    type: 'response.failed',
    response: {
      id: responseId,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: publicModel,
      status: 'failed',
      error: { code: 'invalid_prompt', message: error.userMessage() },
    },
  };
}

/**
 * Removes what only the thread's previous route can read: every reasoning item,
 * any other `encrypted_content`, a function call's `encrypted_function_args`,
 * and — on the request that makes the move — a `previous_response_id`, which
 * names a response the destination never saw. Compaction items are left to the
 * caller (expanded or refused before this).
 */
export function stripProviderBoundItems(payload: JsonObject | null, moving: boolean): boolean {
  if (!payload) return false;
  let changed = false;
  if (Array.isArray(payload.input)) {
    const input: unknown[] = [];
    for (const item of payload.input) {
      if (isObject(item) && item.type === 'reasoning') {
        changed = true;
        continue;
      }
      if (isObject(item)) {
        // One item can carry both: a replayed function call has its output
        // `encrypted_content` and its `encrypted_function_args`.
        let next = item;
        if ('encrypted_content' in next && !isNativeCompactionItem(next)) {
          const { encrypted_content: _foreign, ...rest } = next;
          next = rest;
          changed = true;
        }
        if (next.type === 'function_call' && 'encrypted_function_args' in next) {
          const { encrypted_function_args: _foreign, ...rest } = next;
          next = rest;
          changed = true;
        }
        input.push(next);
        continue;
      }
      input.push(item);
    }
    if (changed) payload.input = input;
  }
  if (moving && payload.previous_response_id !== undefined) {
    delete payload.previous_response_id;
    changed = true;
  }
  return changed;
}
