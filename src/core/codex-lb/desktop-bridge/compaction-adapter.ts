/**
 * Remote compaction for threads routed to a provider without one.
 *
 * SKS points Codex's built-in OpenAI provider at this bridge (`openai_base_url`),
 * so Codex believes it is talking to OpenAI and compacts *remotely*: a
 * Responses create whose input ends in `{"type":"compaction_trigger"}`, answered
 * by exactly one `compaction` output item (and, on older Codex, a POST to
 * `/responses/compact` answered by `{ "output": [...] }`). The official backend
 * implements that, and so does Codex-LB, which runs it on the thread's own
 * account: those routes are `native` (BRIDGE_REMOTE_COMPACTION) and their
 * compaction requests travel like any other turn. OpenRouter has none.
 *
 * For an OpenRouter thread the bridge compacts the way Codex compacts for every
 * non-OpenAI provider: it asks the thread's own provider and model for a handoff
 * summary and returns it as a `compaction` item whose `encrypted_content` is a
 * bridge envelope. Later requests carry that item back; no upstream can read
 * the envelope, so the bridge replaces it with the summary as a user message
 * before forwarding, on every route. The thread never leaves its provider, so
 * the provider and official identities never cross.
 *
 * Everything here is pure: request shaping, response parsing and event
 * synthesis. The transport lives with the forwarders.
 */
import { randomUUID } from 'node:crypto';
import { adviseModelCapacityRetry } from './capacity-retry-advice.js';

// The two texts Codex itself uses for local compaction
// (codex-rs/prompts/templates/compact/{prompt,summary_prefix}.md, Apache-2.0),
// so a bridge-made summary reads exactly like one Codex made.
export const CODEX_SUMMARIZATION_PROMPT = `You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.`;

export const CODEX_SUMMARY_PREFIX = 'Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:';

export const BRIDGE_COMPACTION_ENVELOPE_PREFIX = 'sks-bridge-compaction.v1.';

/** Item types Codex parses as a compaction (`compaction_summary` is a serde alias). */
const COMPACTION_ITEM_TYPES = new Set(['compaction', 'compaction_summary', 'context_compaction']);

/** A summary larger than this is not a summary; refuse it rather than replay it every turn. */
const MAX_SUMMARY_CHARS = 512 * 1024;
/** V1 keeps recent real user messages next to the summary, bounded like Codex's own retention. */
const MAX_RETAINED_USER_MESSAGE_CHARS = 80_000;
/**
 * A handoff summary gains nothing from extended reasoning, and on a near-full
 * context `xhigh`/`max` reasoning turned every compaction into minutes of
 * waiting. Efforts above the ceiling are lowered to it; lower ones are kept.
 */
const SUMMARY_REASONING_EFFORT_CEILING = 'medium';
const EFFORTS_ABOVE_SUMMARY_CEILING = new Set(['high', 'xhigh', 'max', 'ultra']);

export type BridgeCompactionKind = 'trigger' | 'endpoint';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** An upstream error identifier: bounded, machine-shaped, nothing else survives. */
export function safeUpstreamErrorId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(text) ? text : null;
}

export function isCompactionTriggerItem(item: unknown): boolean {
  return isObject(item) && item.type === 'compaction_trigger';
}

/** A Responses create that asks for remote compaction (Codex remote compaction v2). */
export function requestsRemoteCompaction(payload: JsonObject | null): boolean {
  return Boolean(payload && Array.isArray(payload.input) && payload.input.some(isCompactionTriggerItem));
}

export function encodeBridgeCompaction(summary: string): string {
  return `${BRIDGE_COMPACTION_ENVELOPE_PREFIX}${Buffer.from(JSON.stringify({ summary }), 'utf8').toString('base64url')}`;
}

export function decodeBridgeCompaction(encrypted: unknown): string | null {
  if (typeof encrypted !== 'string' || !encrypted.startsWith(BRIDGE_COMPACTION_ENVELOPE_PREFIX)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encrypted.slice(BRIDGE_COMPACTION_ENVELOPE_PREFIX.length), 'base64url').toString('utf8'));
    return isObject(decoded) && typeof decoded.summary === 'string' ? decoded.summary : null;
  } catch {
    return null;
  }
}

/** A compaction item an upstream made: opaque, and readable only by the account that made it. */
export function isNativeCompactionItem(item: unknown): boolean {
  return isObject(item) && COMPACTION_ITEM_TYPES.has(String(item.type)) && decodeBridgeCompaction(item.encrypted_content) === null;
}

function summaryMessage(summary: string): JsonObject {
  return { type: 'message', role: 'user', content: [{ type: 'input_text', text: `${CODEX_SUMMARY_PREFIX}\n${summary}` }] };
}

/**
 * Replaces every bridge-made compaction item in `payload.input` with the
 * summary it carries, as Codex's own local compaction would have placed it.
 * Returns whether anything changed; items made by a real backend are untouched.
 */
export function expandBridgeCompactionItems(payload: JsonObject | null): boolean {
  if (!payload || !Array.isArray(payload.input)) return false;
  let changed = false;
  const input = payload.input.map((item) => {
    if (!isObject(item) || !COMPACTION_ITEM_TYPES.has(String(item.type))) return item;
    const summary = decodeBridgeCompaction(item.encrypted_content);
    if (summary === null) return item;
    changed = true;
    return summaryMessage(summary);
  });
  if (changed) payload.input = input;
  return changed;
}

/** Tool definitions travel in `tools`, or — Responses Lite — as an `additional_tools` input item. */
function carriesToolDefinitions(body: JsonObject): boolean {
  return (Array.isArray(body.tools) && body.tools.length > 0)
    || (Array.isArray(body.input) && body.input.some((item) => isObject(item) && item.type === 'additional_tools'));
}

/**
 * The provider request that produces the summary: the same request Codex sent,
 * with the trigger replaced by Codex's summarization prompt and tool calls
 * disabled. Tool definitions stay, because some providers refuse tool-call
 * history without them.
 */
export function buildCompactionSummaryRequest(payload: JsonObject, upstreamModel: string): JsonObject {
  const { type: _eventType, ...request } = payload;
  const history = Array.isArray(payload.input) ? payload.input.filter((item) => !isCompactionTriggerItem(item)) : [];
  const body: JsonObject = {
    ...request,
    model: upstreamModel,
    input: [
      ...history,
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: CODEX_SUMMARIZATION_PROMPT }] },
    ],
    stream: true,
  };
  if (carriesToolDefinitions(body)) body.tool_choice = 'none';
  else {
    delete body.tools;
    delete body.tool_choice;
  }
  // Explicitly false, never absent: an absent field defaults to true, and the
  // Responses Lite backend behind every gpt-6.x / gpt-5.6 model refuses that
  // (`unsupported_value`: "requires parallel_tool_calls to be false"), which
  // failed every Codex-LB compaction. Codex's own local compaction sends false.
  body.parallel_tool_calls = false;
  if (isObject(body.reasoning) && EFFORTS_ABOVE_SUMMARY_CEILING.has(String(body.reasoning.effort))) {
    body.reasoning = { ...body.reasoning, effort: SUMMARY_REASONING_EFFORT_CEILING };
  }
  delete body.previous_response_id;
  expandBridgeCompactionItems(body);
  return body;
}

interface ContinuationLink {
  /** The create frame exactly as the upstream received it. */
  create: Buffer;
  /** That response's `response.output_item.done` frames, in order. */
  outputs: Buffer[];
  responseId: string | null;
  settled: boolean;
}

function frameEvent(frame: Buffer): JsonObject | null {
  try {
    const event: unknown = JSON.parse(frame.toString('utf8'));
    return isObject(event) ? event : null;
  } catch {
    return null;
  }
}

/**
 * What the upstream holds for one Responses WebSocket. Codex continues a
 * response by id and sends only the new items (`previous_response_id` plus a
 * delta), so a compaction create on a continued socket carries a fraction of
 * the conversation, and a summary request built from it alone was refused
 * (`invalid_request_error`, param `input`) until Codex retried with the full
 * history. The chain keeps the raw frames the upstream saw since the last full
 * create, so the full input is rebuilt exactly as Codex builds it: each
 * create's input, then that response's finished output items, then the delta.
 */
export class ResponsesContinuationChain {
  private links: ContinuationLink[] | null = [];
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  /** A create relayed upstream. */
  sent(create: JsonObject, frame: Buffer): void {
    const previous = typeof create.previous_response_id === 'string' ? create.previous_response_id : null;
    const last = this.links?.at(-1);
    const link: ContinuationLink = { create: frame, outputs: [], responseId: null, settled: false };
    if (!previous) {
      this.links = [link];
      this.bytes = frame.length;
    } else if (this.links && last?.settled && last.responseId === previous) {
      this.links.push(link);
      this.track(frame.length);
    } else {
      this.links = null;
    }
  }

  /** An upstream event frame; byte checks first, because nearly every frame is a delta. */
  received(frame: Buffer): void {
    const link = this.links?.at(-1);
    if (!link || link.settled) return;
    if (frame.includes('"response.output_item.done"')) {
      link.outputs.push(frame);
      this.track(frame.length);
    } else if (frame.includes('"response.completed"')) {
      const event = frameEvent(frame);
      if (event?.type !== 'response.completed') return;
      link.settled = true;
      link.responseId = isObject(event.response) && typeof event.response.id === 'string' ? event.response.id : null;
    } else if (frame.includes('"response.failed"') || frame.includes('"response.incomplete"') || frame.includes('"type":"error"')) {
      const type = frameEvent(frame)?.type;
      if (type === 'response.failed' || type === 'response.incomplete' || type === 'error') {
        link.settled = true;
        link.responseId = null;
      }
    }
  }

  /** The whole input a create stands for, or null when this socket cannot vouch for its continuation. */
  fullInput(create: JsonObject): unknown[] | null {
    const delta = Array.isArray(create.input) ? create.input : [];
    const previous = typeof create.previous_response_id === 'string' ? create.previous_response_id : null;
    if (!previous) return delta;
    const last = this.links?.at(-1);
    if (!this.links || !last?.settled || last.responseId !== previous) return null;
    const input: unknown[] = [];
    for (const link of this.links) {
      const sent = frameEvent(link.create);
      if (!sent || !Array.isArray(sent.input)) return null;
      input.push(...sent.input);
      for (const frame of link.outputs) {
        const event = frameEvent(frame);
        if (event?.type === 'response.output_item.done' && isObject(event.item)) input.push(event.item);
      }
    }
    return [...input, ...delta];
  }

  /** A chain larger than one request may be is not worth keeping. */
  private track(size: number): void {
    this.bytes += size;
    if (this.bytes > this.maxBytes) this.links = null;
  }
}

export interface ProviderSummaryError {
  code: string;
  param: string | null;
}

export interface ProviderSummaryResult {
  summary: string | null;
  usage: JsonObject | null;
  failed: boolean;
  /** The provider's own identifiers for a failed summary; its message is never kept. */
  error: ProviderSummaryError | null;
}

/** `{ code, param }` from a Responses error object, identifiers only. */
function summaryError(error: unknown, fallback: string): ProviderSummaryError {
  const record = isObject(error) ? error : {};
  return {
    code: safeUpstreamErrorId(record.code) ?? safeUpstreamErrorId(record.type) ?? fallback,
    param: safeUpstreamErrorId(record.param),
  };
}

function messageText(item: unknown): string {
  if (!isObject(item) || item.type !== 'message' || (item.role !== undefined && item.role !== 'assistant')) return '';
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((part) => (isObject(part) && (part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function outputText(output: unknown): string {
  return Array.isArray(output) ? output.map(messageText).filter(Boolean).join('\n\n') : '';
}

/**
 * Reads the provider's answer to the summary request, streamed (SSE) or not.
 * The text comes from finished message items, then the completed response's
 * output, then the raw deltas, whichever the provider actually sent.
 */
export function parseProviderSummary(text: string): ProviderSummaryResult {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const response = isObject(parsed) && isObject(parsed.response) ? parsed.response : parsed;
      const summary = outputText(isObject(response) ? response.output : null).trim();
      const failure = isObject(response) && isObject(response.error) ? summaryError(response.error, 'response_failed') : null;
      return {
        summary: summary || null,
        usage: isObject(response) && isObject(response.usage) ? response.usage : null,
        failed: !summary,
        error: summary ? null : failure,
      };
    } catch {
      return { summary: null, usage: null, failed: true, error: null };
    }
  }
  const finished: string[] = [];
  let completedOutput = '';
  let deltas = '';
  let usage: JsonObject | null = null;
  let completed = false;
  let failed = false;
  let error: ProviderSummaryError | null = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') continue;
    let event: unknown;
    try { event = JSON.parse(data); } catch { continue; }
    if (!isObject(event)) continue;
    switch (event.type) {
      case 'response.output_item.done': {
        const piece = messageText(event.item);
        if (piece) finished.push(piece);
        break;
      }
      case 'response.output_text.delta':
        if (typeof event.delta === 'string') deltas += event.delta;
        break;
      case 'response.completed':
        completed = true;
        if (isObject(event.response)) {
          completedOutput = outputText(event.response.output);
          if (isObject(event.response.usage)) usage = event.response.usage;
        }
        break;
      case 'response.failed':
        failed = true;
        error ??= summaryError(isObject(event.response) ? event.response.error : null, 'response_failed');
        break;
      case 'response.incomplete': {
        failed = true;
        const details = isObject(event.response) ? event.response.incomplete_details : null;
        error ??= { code: 'response_incomplete', param: isObject(details) ? safeUpstreamErrorId(details.reason) : null };
        break;
      }
      case 'error':
        failed = true;
        error ??= summaryError(isObject(event.error) ? event.error : { code: event.code, param: event.param }, 'response_failed');
        break;
      default:
        break;
    }
  }
  const summary = (finished.join('\n\n') || completedOutput || deltas).trim();
  return { summary: summary || null, usage, failed: failed || !completed || !summary, error };
}

export function summaryWithinBounds(summary: string | null): summary is string {
  return typeof summary === 'string' && summary.length > 0 && summary.length <= MAX_SUMMARY_CHARS;
}

/**
 * How a summary the provider did not deliver is reported; `status` is the
 * provider's HTTP status. Codex maps a `response.failed` code the way it maps
 * the official backend's (`context_length_exceeded`, `rate_limit_exceeded`,
 * `insufficient_quota` …), so the provider's own code travels. The log code
 * adds the parameter the provider named — a refused summary request used to be
 * logged as a bare status, and the field it objected to was nowhere.
 */
export function summaryFailure(result: ProviderSummaryResult, status: number): { code: string; logCode: string } {
  const named = result.error ? `:${result.error.code}${result.error.param ? `:${result.error.param}` : ''}` : '';
  if (status >= 300) {
    return {
      code: status === 429 ? 'rate_limit_exceeded' : result.error?.code ?? 'bridge_upstream_request_failed',
      logCode: `bridge_compaction_summary_status_${status}${named}`,
    };
  }
  return result.error
    ? { code: result.error.code, logCode: `bridge_compaction_summary_failed${named}` }
    : { code: 'bridge_compaction_summary_unusable', logCode: 'bridge_compaction_summary_unusable' };
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Codex parses `usage` strictly: three required integers, and the detail
 * objects only with their own required fields. A provider's usage is copied
 * in that shape or dropped, never forwarded in a shape that fails the parse.
 */
export function normalizeCompactionUsage(usage: JsonObject | null): JsonObject | null {
  if (!usage) return null;
  const input = wholeNumber(usage.input_tokens ?? usage.prompt_tokens);
  const output = wholeNumber(usage.output_tokens ?? usage.completion_tokens);
  if (input === null || output === null) return null;
  const total = wholeNumber(usage.total_tokens) ?? input + output;
  const cached = isObject(usage.input_tokens_details) ? wholeNumber(usage.input_tokens_details.cached_tokens) : null;
  const reasoning = isObject(usage.output_tokens_details) ? wholeNumber(usage.output_tokens_details.reasoning_tokens) : null;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    ...(cached === null ? {} : { input_tokens_details: { cached_tokens: cached } }),
    ...(reasoning === null ? {} : { output_tokens_details: { reasoning_tokens: reasoning } }),
  };
}

export interface CompactionResponseEvents {
  created: JsonObject;
  itemDone: JsonObject;
  completed: JsonObject;
}

export function newCompactionResponseId(): string {
  return `resp_sksbridge_${randomUUID().replace(/-/g, '')}`;
}

function responseBase(responseId: string, publicModel: string): JsonObject {
  return { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1000), model: publicModel };
}

/** Sent as soon as the provider accepts the summary request. */
export function compactionCreatedEvent(responseId: string, publicModel: string): JsonObject {
  return { type: 'response.created', response: { ...responseBase(responseId, publicModel), status: 'in_progress', output: [] } };
}

/** The Responses events a remote compaction answer consists of. */
export function compactionResponseEvents(responseId: string, publicModel: string, summary: string, usage: JsonObject | null): CompactionResponseEvents {
  const item = { type: 'compaction', id: `cmp_${randomUUID().replace(/-/g, '')}`, encrypted_content: encodeBridgeCompaction(summary) };
  const base = responseBase(responseId, publicModel);
  const normalizedUsage = normalizeCompactionUsage(usage);
  return {
    created: compactionCreatedEvent(responseId, publicModel),
    itemDone: { type: 'response.output_item.done', output_index: 0, item },
    completed: {
      type: 'response.completed',
      response: { ...base, status: 'completed', output: [item], ...(normalizedUsage ? { usage: normalizedUsage } : {}) },
    },
  };
}

/**
 * Codex maps a `response.failed` code the way it maps the official backend's:
 * `rate_limit_exceeded` waits and retries, an unknown code is retryable, and
 * `server_is_overloaded` retries only with the advice added here.
 */
export function compactionFailedEvent(responseId: string, publicModel: string, code: string): JsonObject {
  const event = {
    type: 'response.failed',
    response: { ...responseBase(responseId, publicModel), status: 'failed', error: { code, message: code } },
  };
  adviseModelCapacityRetry(event);
  return event;
}

export function sseEvent(event: JsonObject): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * The `/responses/compact` answer: recent real user messages, then the
 * compaction item. Codex drops its own context wrappers from this list itself.
 */
export function compactEndpointResult(payload: JsonObject, summary: string): JsonObject {
  const userMessages = (Array.isArray(payload.input) ? payload.input : [])
    .filter((item) => isObject(item) && item.type === 'message' && item.role === 'user');
  const retained: unknown[] = [];
  let budget = MAX_RETAINED_USER_MESSAGE_CHARS;
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const size = JSON.stringify(userMessages[index]).length;
    if (size > budget) break;
    budget -= size;
    retained.unshift(userMessages[index]);
  }
  return {
    output: [
      ...retained,
      { type: 'compaction', id: `cmp_${randomUUID().replace(/-/g, '')}`, encrypted_content: encodeBridgeCompaction(summary) },
    ],
  };
}
