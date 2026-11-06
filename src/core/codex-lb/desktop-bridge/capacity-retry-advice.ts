/**
 * Retry advice on a provider route's model-capacity failure.
 *
 * Codex shows "Selected model is at capacity. Please try a different model."
 * for a Responses failure coded `server_is_overloaded`, and retries one only
 * while it carries `Retry-After` advice: the failure's `error.headers`, or the
 * top-level `headers` of a WebSocket `error` event. Without advice it is
 * terminal and the whole turn ends (codex-rs 0.163 `CodexErr::retry_delay`;
 * test `websocket_overload_retries_only_while_it_has_retry_after`).
 *
 * Codex-LB re-emits an upstream failure it does not replay as its own
 * `response.failed`, built without `headers`, so on the gateway route every
 * momentary capacity blip reached Codex without advice and killed the turn:
 * five turns in twenty minutes of one thread on 2026-10-19, each re-run by
 * Codex Desktop's turn-level capacity retry, while the requests between them
 * were served. The bridge restores the advice the gateway drops, so Codex retries
 * the request within its own stream retry budget. Advice the upstream already
 * sent is kept as sent, and the official route is never touched: there the
 * backend's own choice to omit advice stands.
 *
 * Both transports need it. After five advised WebSocket failures Codex moves
 * the session to HTTPS for good, where the same failure arrives as an SSE event.
 */
import { Transform } from 'node:stream';

/** The failure code Codex renders as "Selected model is at capacity". */
export const MODEL_CAPACITY_ERROR_CODE = 'server_is_overloaded';

/**
 * Codex-LB's own overload advice. Codex's default five stream retries then
 * wait about 25 s for capacity before the turn fails as it did before.
 */
export const MODEL_CAPACITY_RETRY_AFTER_SECONDS = 5;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Codex reads `Retry-After` in any letter case and with any value shape. */
function carriesRetryAfter(headers: unknown): boolean {
  return isObject(headers) && Object.keys(headers).some((name) => name.toLowerCase() === 'retry-after');
}

/**
 * Adds `Retry-After` to a capacity failure that carries no advice, in the slot
 * Codex reads, and reports whether the event changed. Headers of a shape Codex
 * would not read are left as they are.
 */
export function adviseModelCapacityRetry(event: JsonObject): boolean {
  const error = event.type === 'response.failed' ? (isObject(event.response) ? event.response.error : null)
    : event.type === 'error' ? event.error
      : null;
  if (!isObject(error) || error.code !== MODEL_CAPACITY_ERROR_CODE) return false;
  if (event.type === 'error' && carriesRetryAfter(event.headers)) return false;
  const headers = error.headers ?? {};
  if (!isObject(headers) || carriesRetryAfter(headers)) return false;
  error.headers = { ...headers, 'Retry-After': String(MODEL_CAPACITY_RETRY_AFTER_SECONDS) };
  return true;
}

/**
 * The frame to relay in place of an upstream WebSocket frame, or null to relay
 * it unchanged. Nearly every frame is a delta, so a byte check precedes any parse.
 */
export function modelCapacityAdvisedFrame(frame: Buffer): Buffer | null {
  if (!frame.includes(MODEL_CAPACITY_ERROR_CODE)) return null;
  let event: unknown;
  try {
    event = JSON.parse(frame.toString('utf8'));
  } catch {
    return null;
  }
  return isObject(event) && adviseModelCapacityRetry(event) ? Buffer.from(JSON.stringify(event)) : null;
}

/** Only a plain event stream can be read; a compressed one passes as sent. */
export function isAdvisableEventStream(headers: { 'content-type'?: string | undefined; 'content-encoding'?: string | undefined }): boolean {
  const encoding = String(headers['content-encoding'] || 'identity').trim().toLowerCase();
  return /^text\/event-stream\b/i.test(String(headers['content-type'] || '')) && encoding === 'identity';
}

/** Rewrites the complete SSE events in `events` that carry an unadvised capacity failure. */
function adviseSseEvents(events: Buffer, onAdvised: () => void, onEvent?: (event: JsonObject) => void): Buffer {
  if (!onEvent && !events.includes(MODEL_CAPACITY_ERROR_CODE)) return events;
  // Event boundaries are ASCII, so splitting the decoded text never cuts a character.
  const parts = events.toString('utf8').split(/(\r?\n\r?\n)/);
  let changed = false;
  for (let index = 0; index < parts.length; index += 2) {
    const block = parts[index]!;
    if (!onEvent && !block.includes(MODEL_CAPACITY_ERROR_CODE)) continue;
    const lines = block.split(/\r?\n/);
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (!isObject(event)) continue;
    // Observers see only complete, bounded events and cannot break forwarding.
    try { onEvent?.(event); } catch { /* Diagnostics are best-effort. */ }
    if (!adviseModelCapacityRetry(event)) continue;
    const newline = block.includes('\r\n') ? '\r\n' : '\n';
    parts[index] = [...lines.filter((line) => !line.startsWith('data:')), `data: ${JSON.stringify(event)}`].join(newline);
    changed = true;
  }
  if (!changed) return events;
  onAdvised();
  return Buffer.from(parts.join(''));
}

/**
 * Passes an SSE stream through, holding back only an event whose terminating
 * blank line has not arrived yet. Advice is best-effort: events over 1 MiB
 * pass through unchanged, even if the upstream never sends their blank line.
 * The next event can still receive advice. This bounds our private buffer;
 * normal stream backpressure continues to bound queued downstream writes.
 */
export function modelCapacityAdvisingSse(onAdvised: () => void, onEvent?: (event: JsonObject) => void): Transform {
  const maxEventBytes = 1024 * 1024;
  let carry: Buffer = Buffer.alloc(0);
  let passthrough = false;
  // Keep delimiter recognition across chunks without decoding partial UTF-8.
  let endingBytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      let advised = false;
      let start = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        endingBytes = ((endingBytes << 8) | chunk[index]!) >>> 0;
        if ((endingBytes & 0xffff) !== 0x0a0a && endingBytes !== 0x0d0a0d0a) continue;
        append(chunk.subarray(start, index + 1));
        if (!passthrough) this.push(adviseSseEvents(carry, () => { advised = true; }, onEvent));
        carry = Buffer.alloc(0);
        passthrough = false;
        endingBytes = 0;
        start = index + 1;
      }
      if (start < chunk.length) append(chunk.subarray(start));
      if (advised) onAdvised();
      done();
    },
    flush(done) {
      done(null, carry.length ? adviseSseEvents(carry, onAdvised, onEvent) : null);
    },
  });
  function append(part: Buffer): void {
    if (passthrough || carry.length + part.length > maxEventBytes) {
      if (carry.length) stream.push(carry);
      carry = Buffer.alloc(0);
      passthrough = true;
      stream.push(part);
    } else {
      // Copy a partial slice so it cannot retain a much larger input chunk.
      carry = carry.length ? Buffer.concat([carry, part]) : Buffer.from(part);
    }
  }
  return stream;
}
