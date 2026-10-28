import { PACKAGE_VERSION } from '../../version.js';

/**
 * Structured logging for rejected bridge requests.
 *
 * The bridge emitted exactly one line in its whole lifetime — `started` — and
 * nothing when it refused a request. A refusal was visible only to the client
 * that received it, so a bridge rejecting every request looked identical in the
 * logs to one serving them perfectly. Diagnosing
 * `bridge_codex_session_identity_mismatch` required reading the source and
 * reproducing it by hand because no record of the rejections existed.
 *
 * Two properties are non-negotiable here:
 *
 * - **No secrets.** Only the error code, transport, method and pathname are
 *   recorded, plus an upstream's own error identifiers and the refused
 *   request's shape (field names, `include` values, item-type counts). Never
 *   headers, bodies, query strings, credentials or origins — a bridge log sits
 *   in `~/.codex/sks/logs` and is routinely pasted into bug reports.
 * - **Bounded.** A client in a reconnect loop can rejrequest thousands of times
 *   a minute. Each error code gets a small burst allowance and then one periodic
 *   summary line, so a storm costs a bounded number of lines instead of filling
 *   the disk.
 */
export const DESKTOP_BRIDGE_LOG_SCHEMA = 'sks.desktop-bridge-log.v2' as const;

/** Lines emitted per error code before summarising. */
export const REJECTION_LOG_BURST = 5;
/** How often a suppressed code re-emits a summary line. */
export const REJECTION_LOG_SUMMARY_INTERVAL_MS = 60_000;

export interface DesktopBridgeRejectionEvent {
  readonly code: string;
  readonly transport: 'http' | 'websocket';
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly status?: number | undefined;
  /** Which provider answered. A catalog-published id, never a secret. */
  readonly provider_id?: string | undefined;
  /** The public model the request was routed for — the one fact a user report
   * with only a cf-ray id cannot supply. Catalog-published, never a secret. */
  readonly public_model?: string | undefined;
  readonly max_request_body_bytes?: number | undefined;
  readonly request_body_bytes?: number | undefined;
  readonly request_body_stage?: 'encoded' | 'decoded' | undefined;
  /** An upstream's refusal, as identifiers: its status, `code`, `type` and the
   *  request field it named (`param`). Its message can echo the request and is
   *  never recorded. */
  readonly upstream_status?: number | undefined;
  readonly upstream_code?: string | null | undefined;
  readonly upstream_type?: string | null | undefined;
  readonly upstream_param?: string | null | undefined;
  /** What the refused request looked like (desktopBridgeRequestShape). */
  readonly request_shape?: DesktopBridgeRequestShape | null | undefined;
}

/**
 * A request's shape without its content: the top-level field names, the
 * `include` values, and how many input items of each type it carried. Enough
 * to tell which field an upstream refused; prompts, instructions, tool
 * arguments and keys never enter it.
 */
export interface DesktopBridgeRequestShape {
  readonly keys: readonly string[];
  readonly include: readonly string[] | null;
  readonly input_types: Readonly<Record<string, number>>;
}

const SHAPE_TOKEN = /^[A-Za-z0-9_.[\]-]{1,64}$/;
const MAX_SHAPE_KEYS = 64;
const MAX_SHAPE_INCLUDE = 16;
const MAX_SHAPE_INPUT_TYPES = 32;

function shapeToken(value: unknown): string {
  return typeof value === 'string' && SHAPE_TOKEN.test(value) ? value : '<other>';
}

export function desktopBridgeRequestShape(payload: unknown): DesktopBridgeRequestShape | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const request = payload as Record<string, unknown>;
  const inputTypes: Record<string, number> = {};
  if (Array.isArray(request.input)) {
    for (const item of request.input) {
      const type = item && typeof item === 'object' && !Array.isArray(item) ? shapeToken((item as Record<string, unknown>).type) : '<other>';
      if (inputTypes[type] === undefined && Object.keys(inputTypes).length >= MAX_SHAPE_INPUT_TYPES) continue;
      inputTypes[type] = (inputTypes[type] ?? 0) + 1;
    }
  } else if (typeof request.input === 'string') inputTypes['<text>'] = 1;
  return {
    keys: Object.keys(request).map(shapeToken).sort().slice(0, MAX_SHAPE_KEYS),
    include: Array.isArray(request.include) ? request.include.slice(0, MAX_SHAPE_INCLUDE).map(shapeToken) : null,
    input_types: inputTypes,
  };
}

/** The shape as logged: rebuilt from its own tokens, so nothing else rides along. */
function safeRequestShape(shape: DesktopBridgeRequestShape | null | undefined): DesktopBridgeRequestShape | null {
  if (!shape || !Array.isArray(shape.keys)) return null;
  const inputTypes: Record<string, number> = {};
  for (const [type, count] of Object.entries(shape.input_types ?? {}).slice(0, MAX_SHAPE_INPUT_TYPES)) {
    if (Number.isSafeInteger(count) && count > 0) inputTypes[shapeToken(type)] = count;
  }
  return {
    keys: shape.keys.slice(0, MAX_SHAPE_KEYS).map(shapeToken),
    include: Array.isArray(shape.include) ? shape.include.slice(0, MAX_SHAPE_INCLUDE).map(shapeToken) : null,
    input_types: inputTypes,
  };
}

/** An upstream error identifier (`code`, `type`): bounded and machine-shaped. */
function safeUpstreamId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(text) ? text : null;
}

/** The request field an upstream named: at most 64 characters of `[A-Za-z0-9_.[\]-]`. */
export function safeUpstreamParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 64);
  return /^[A-Za-z0-9_.[\]-]+$/.test(text) ? text : null;
}

/** Catalog-published identifiers: bounded, control-characters stripped, nothing else. */
function safeCatalogId(value: unknown): string | null {
  const text = String(value ?? '').replace(/[\r\n\0]/g, '').trim().slice(0, 128);
  return text.length > 0 ? text : null;
}

interface CodeWindow {
  emitted: number;
  suppressed: number;
  windowStartedMs: number;
}

/**
 * A query string can carry a capability token — the bridge's own client base
 * path is a secret — so only the path is ever recorded, and only when it is
 * a plain absolute path.
 */
function safePathname(url: string | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw.startsWith('/')) return null;
  const pathname = raw.split(/[?#]/)[0] || '';
  if (!pathname || pathname.length > 512 || /[\r\n\0]/.test(pathname)) return null;
  // The per-client capability segment is high-entropy and secret; redact any
  // path segment that looks like one rather than logging it.
  return pathname
    .split('/')
    .map((segment) => (segment.length >= 24 && /^[A-Za-z0-9_-]+$/.test(segment) ? '<redacted>' : segment))
    .join('/');
}

function safeMethod(method: string | undefined): string | null {
  const value = String(method || '').trim().toUpperCase();
  return /^[A-Z]{3,10}$/.test(value) ? value : null;
}

export function createDesktopBridgeRejectionLogger(options: {
  write?: (line: string) => void;
  now?: () => number;
  burst?: number;
  summaryIntervalMs?: number;
} = {}) {
  const write = options.write || ((line: string) => process.stdout.write(line));
  const now = options.now || (() => Date.now());
  const burst = Math.max(1, options.burst ?? REJECTION_LOG_BURST);
  const summaryIntervalMs = Math.max(1_000, options.summaryIntervalMs ?? REJECTION_LOG_SUMMARY_INTERVAL_MS);
  const windows = new Map<string, CodeWindow>();

  function emit(payload: Record<string, unknown>): void {
    try {
      write(`${JSON.stringify({
        schema: DESKTOP_BRIDGE_LOG_SCHEMA,
        sks_version: PACKAGE_VERSION,
        // The 2026-08 restart-storm forensics had to reconstruct 14 hours of
        // timeline from serve-state blobs because no rejection record carried a
        // wall clock. Every record now stamps one.
        at: new Date(now()).toISOString(),
        secret_fields_redacted: true,
        ...payload,
      })}\n`);
    } catch {
      // Logging must never take the bridge down; a failed write is dropped.
    }
  }

  return function logRejection(event: DesktopBridgeRejectionEvent): void {
    const code = String(event.code || 'bridge_rejected').slice(0, 128).replace(/[\r\n\0]/g, '');
    const at = now();
    const window = windows.get(code) || { emitted: 0, suppressed: 0, windowStartedMs: at };
    if (at - window.windowStartedMs >= summaryIntervalMs) {
      if (window.suppressed > 0) {
        emit({
          event: 'sks.desktop_bridge.rejected_summary',
          code,
          suppressed: window.suppressed,
          window_ms: at - window.windowStartedMs,
        });
      }
      window.emitted = 0;
      window.suppressed = 0;
      window.windowStartedMs = at;
    }
    if (window.emitted >= burst) {
      window.suppressed += 1;
      windows.set(code, window);
      return;
    }
    window.emitted += 1;
    windows.set(code, window);
    const pathname = safePathname(event.url);
    const method = safeMethod(event.method);
    const providerId = safeCatalogId(event.provider_id);
    const publicModel = safeCatalogId(event.public_model);
    const upstreamCode = safeUpstreamId(event.upstream_code);
    const upstreamType = safeUpstreamId(event.upstream_type);
    const upstreamParam = safeUpstreamParam(event.upstream_param);
    const requestShape = safeRequestShape(event.request_shape);
    emit({
      event: 'sks.desktop_bridge.rejected',
      code,
      transport: event.transport,
      ...(method ? { method } : {}),
      ...(pathname ? { pathname } : {}),
      ...(Number.isInteger(event.status) ? { status: event.status } : {}),
      ...(providerId ? { provider_id: providerId } : {}),
      ...(publicModel ? { public_model: publicModel } : {}),
      ...(Number.isSafeInteger(event.max_request_body_bytes) && event.max_request_body_bytes! > 0 ? { max_request_body_bytes: event.max_request_body_bytes } : {}),
      ...(Number.isSafeInteger(event.request_body_bytes) && event.request_body_bytes! >= 0 ? { request_body_bytes: event.request_body_bytes } : {}),
      ...(event.request_body_stage === 'encoded' || event.request_body_stage === 'decoded' ? { request_body_stage: event.request_body_stage } : {}),
      ...(Number.isInteger(event.upstream_status) && event.upstream_status! >= 100 && event.upstream_status! <= 599 ? { upstream_status: event.upstream_status } : {}),
      ...(upstreamCode ? { upstream_code: upstreamCode } : {}),
      ...(upstreamType ? { upstream_type: upstreamType } : {}),
      ...(upstreamParam ? { upstream_param: upstreamParam } : {}),
      ...(requestShape ? { request_shape: requestShape } : {}),
    });
  };
}
