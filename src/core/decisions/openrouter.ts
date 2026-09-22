import { officialSubagentLifecycleLockHeld } from '../subagents/official-subagent-lock.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import { redactOpenRouterSecrets, redactOpenRouterString } from '../security/redact-secrets.js';
import { decodeUsage, decodeWireResponse } from './policy.js';
import {
  DESIGN_DEFAULTS,
  UNKNOWN_USAGE,
  type BaselineReason,
  type DecisionBundle,
  type DecisionsWireRequest,
  type DecisionsWireResponse,
  type UsageReceipt
} from './types.js';

export const OPENROUTER_DECISIONS_ENDPOINT = DESIGN_DEFAULTS.endpoint;
export const OPENROUTER_DECISIONS_MODEL = DESIGN_DEFAULTS.model;

export type DecisionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface DecisionTransportOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: DecisionFetch;
  signal?: AbortSignal;
  deadlineMs?: number;
  now?: () => number;
}

export type DecisionTransportResult =
  | {
      ok: true;
      response: DecisionsWireResponse;
      usage: UsageReceipt;
      resolvedModel: string;
      responseId: string | null;
      cacheHit: boolean;
      status: 200;
    }
  | {
      ok: false;
      reason: BaselineReason;
      usage: UsageReceipt;
      status: number | null;
      detail: string;
      cacheHit: boolean;
    };

const inflight = { count: 0 };
const circuit = {
  failures: 0,
  openedAt: 0,
  halfOpen: false
};
const memo = new Map<string, { response: DecisionsWireResponse; storedAt: number }>();

export function resetDecisionTransportState(): void {
  inflight.count = 0;
  circuit.failures = 0;
  circuit.openedAt = 0;
  circuit.halfOpen = false;
  memo.clear();
}

export async function requestOpenRouterDecision(
  bundle: DecisionBundle,
  options: DecisionTransportOptions = {}
): Promise<DecisionTransportResult> {
  if (officialSubagentLifecycleLockHeld()) {
    return fail('transport_error', 'fetch_while_lifecycle_lock_held', null);
  }
  const request = bundle.request;
  const encoded = encodeRequest(request);
  if (!encoded.ok) return fail(encoded.reason, encoded.detail, null);
  if (inflight.count >= DESIGN_DEFAULTS.maxInFlight) {
    return fail('busy', 'max_in_flight', null);
  }
  const now = options.now || Date.now;
  const circuitState = inspectCircuit(now());
  if (circuitState === 'open') return fail('circuit_open', 'circuit_open', null);

  const memoKey = encoded.body;
  const cached = memo.get(memoKey);
  if (cached) {
    const decoded = decodeWireResponse(bundle, cached.response);
    if (decoded.ok) {
      return {
        ok: true,
        response: decoded.response,
        usage: {
          inputTokens: decoded.response.usage.input_tokens,
          outputTokens: decoded.response.usage.output_tokens,
          reportedCost: decoded.response.usage.cost === undefined ? null : decoded.response.usage.cost,
          evidence: 'provider_response'
        },
        resolvedModel: decoded.response.model,
        responseId: decoded.response.id || null,
        cacheHit: true,
        status: 200
      };
    }
  }

  const resolved = await resolveOpenRouterApiKey({ env: options.env || process.env });
  if (!resolved.key) return fail('missing_key', resolved.blockers.join(',') || 'missing_openrouter_key', null);

  const controller = new AbortController();
  const parent = options.signal;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener('abort', onAbort, { once: true });
  }
  const deadlineMs = options.deadlineMs ?? DESIGN_DEFAULTS.deadlineMs;
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('deadline'), { name: 'TimeoutError' })), deadlineMs);
  inflight.count += 1;
  try {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const response = await fetchImpl(OPENROUTER_DECISIONS_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${resolved.key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: encoded.body,
      signal: controller.signal
    });
    const status = response.status;
    const raw = await readBoundedBody(response, DESIGN_DEFAULTS.maxResponseBytes, controller.signal);
    if (!raw.ok) return recordFailure(status, raw.reason, raw.detail, now());
    if (status === 401) return recordAuthFailure('unauthorized', status, raw.text);
    if (status === 402) return recordAuthFailure('payment_required', status, raw.text);
    if (status === 403) return recordAuthFailure(privacyUnavailable(raw.text) ? 'privacy_unavailable' : 'unauthorized', status, raw.text);
    if (status === 404) return recordAuthFailure('capability_unavailable', status, raw.text);
    if (status === 413) return recordAuthFailure('budget_exceeded', status, raw.text);
    if (status === 429) return recordFailure(status, 'rate_limited', raw.text, now());
    if (status >= 500) return recordFailure(status, 'transport_error', raw.text, now());
    if (status !== 200) return recordFailure(status, 'transport_error', raw.text, now());

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text);
    } catch {
      return recordFailure(status, 'invalid_response', 'malformed_json', now());
    }
    const decoded = decodeWireResponse(bundle, parsed);
    if (!decoded.ok) return recordFailure(status, decoded.reason, 'schema_rejected', now());
    remember(memoKey, decoded.response);
    circuit.failures = 0;
    circuit.halfOpen = false;
    return {
      ok: true,
      response: decoded.response,
      usage: {
        inputTokens: decoded.response.usage.input_tokens,
        outputTokens: decoded.response.usage.output_tokens,
        reportedCost: decoded.response.usage.cost === undefined ? null : decoded.response.usage.cost,
        evidence: 'provider_response'
      },
      resolvedModel: decoded.response.model,
      responseId: decoded.response.id || null,
      cacheHit: false,
      status: 200
    };
  } catch (error: unknown) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || /deadline/i.test(error.message));
    if (timeout) return recordFailure(null, 'deadline', 'deadline', now(), UNKNOWN_USAGE);
    if (aborted) return fail('cancelled', 'cancelled', null, UNKNOWN_USAGE);
    if (isRedirectError(error)) return fail('transport_error', 'redirect_refused', null);
    return recordFailure(null, 'transport_error', error instanceof Error ? error.message : String(error), now());
  } finally {
    clearTimeout(timer);
    if (parent) parent.removeEventListener('abort', onAbort);
    inflight.count = Math.max(0, inflight.count - 1);
  }
}

export function encodeRequest(
  request: DecisionsWireRequest
): { ok: true; body: string } | { ok: false; reason: BaselineReason; detail: string } {
  if (request.model !== DESIGN_DEFAULTS.model) {
    return { ok: false, reason: 'unknown_model', detail: request.model };
  }
  const questions = Object.keys(request.questions);
  if (questions.length === 0) return { ok: false, reason: 'invalid_response', detail: 'empty_questions' };
  if (questions.length > DESIGN_DEFAULTS.maxQuestions) {
    return { ok: false, reason: 'budget_exceeded', detail: 'max_questions' };
  }
  if (request.provider.zdr !== true
    || request.provider.data_collection !== 'deny'
    || request.provider.allow_fallbacks !== false) {
    return { ok: false, reason: 'privacy_unavailable', detail: 'provider_policy' };
  }
  const body = JSON.stringify({
    model: request.model,
    state: request.state,
    questions: request.questions,
    provider: {
      zdr: true,
      data_collection: 'deny',
      allow_fallbacks: false
    },
    ...(request.session_id ? { session_id: request.session_id } : {})
  });
  if (Buffer.byteLength(body, 'utf8') > DESIGN_DEFAULTS.maxRequestBytes) {
    return { ok: false, reason: 'budget_exceeded', detail: 'max_request_bytes' };
  }
  return { ok: true, body };
}

export function redactDecisionValue<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return redactOpenRouterSecrets(value, env);
}

export function redactDecisionText(value: unknown, env: NodeJS.ProcessEnv = process.env): string {
  return redactOpenRouterString(value, env);
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; reason: BaselineReason; detail: string }> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      return { ok: false, reason: 'budget_exceeded', detail: 'max_response_bytes' };
    }
    return { ok: true, text };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) return { ok: false, reason: 'cancelled', detail: 'cancelled' };
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          return { ok: false, reason: 'budget_exceeded', detail: 'max_response_bytes' };
        }
        chunks.push(value);
      }
    }
  } catch (error: unknown) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { ok: false, reason: signal.reason instanceof Error && signal.reason.name === 'TimeoutError' ? 'deadline' : 'cancelled', detail: 'body_aborted' };
    }
    return { ok: false, reason: 'transport_error', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    reader.releaseLock();
  }
  return { ok: true, text: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8') };
}

function inspectCircuit(now: number): 'closed' | 'open' | 'half_open' {
  if (circuit.failures < DESIGN_DEFAULTS.circuitFailures) return 'closed';
  if (now - circuit.openedAt < DESIGN_DEFAULTS.circuitOpenMs) return 'open';
  if (circuit.halfOpen) return 'open';
  circuit.halfOpen = true;
  return 'half_open';
}

function recordFailure(
  status: number | null,
  reason: BaselineReason,
  detail: string,
  now: number,
  usage: UsageReceipt = UNKNOWN_USAGE
): DecisionTransportResult {
  circuit.failures += 1;
  if (circuit.failures >= DESIGN_DEFAULTS.circuitFailures && circuit.openedAt === 0) {
    circuit.openedAt = now;
  }
  if (circuit.halfOpen && reason !== 'circuit_open') {
    circuit.openedAt = now;
    circuit.halfOpen = false;
  }
  return fail(reason, detail, status, usage);
}

function recordAuthFailure(reason: BaselineReason, status: number, detail: string): DecisionTransportResult {
  return fail(reason, detail, status);
}

function fail(
  reason: BaselineReason,
  detail: string,
  status: number | null,
  usage: UsageReceipt = UNKNOWN_USAGE
): DecisionTransportResult {
  return { ok: false, reason, usage, status, detail, cacheHit: false };
}

function remember(key: string, response: DecisionsWireResponse): void {
  if (memo.size >= DESIGN_DEFAULTS.memoEntries) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, { response, storedAt: Date.now() });
}

function privacyUnavailable(text: string): boolean {
  return /zdr|data_collection|allow_fallbacks|privacy|data collection/i.test(text);
}

function isRedirectError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /redirect/i.test(message);
}

export { decodeUsage };
