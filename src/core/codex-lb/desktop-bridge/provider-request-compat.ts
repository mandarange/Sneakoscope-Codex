/**
 * What each upstream accepts of a Responses request Codex built for OpenAI.
 *
 * SKS binds Codex's built-in OpenAI provider to this bridge, and Codex treats
 * any provider named "OpenAI" as OpenAI (`ModelProviderInfo::is_openai`). It
 * therefore asks every route for what only OpenAI's backend serves: with
 * output-token replay on, `include` carries `output.encrypted_content`, which
 * Codex-LB refuses on every turn as 400 "Invalid request payload" (param
 * `include`) and OpenRouter as 400 `invalid_prompt` (probed 2026-10-28).
 *
 * The official route is never touched. Every other route gets only the
 * `include` values it accepts — `reasoning.encrypted_content` always among
 * them, since Codex needs it on every route. Other OpenAI-only fields
 * (`stream_options`, `access_programs`) travel: both upstreams accept them.
 *
 * Pure apart from the adaptation log, which records identifiers only.
 */
import { BRIDGE_OFFICIAL_ROUTE_ID } from '../bridge-contracts.js';
import { PACKAGE_VERSION } from '../../version.js';
import { DESKTOP_BRIDGE_LOG_SCHEMA, REJECTION_LOG_SUMMARY_INTERVAL_MS } from './rejection-log.js';
import type { DesktopBridgeRouteContext, PreparedDesktopBridgeConfig } from './types.js';

type JsonObject = Record<string, unknown>;

/**
 * `include` values each upstream accepts. `null` means forward exactly as sent.
 * Codex-LB's list mirrors its `_RESPONSES_INCLUDE_ALLOWLIST`; any other value is
 * rejected with 400 "Invalid request payload" (param "include"). OpenRouter's
 * is the `include` enum of its Responses API reference.
 */
export const PROVIDER_INCLUDE_ALLOWLIST: Readonly<Record<string, readonly string[] | null>> = {
  [BRIDGE_OFFICIAL_ROUTE_ID]: null,
  'codex-lb': [
    'code_interpreter_call.outputs',
    'computer_call_output.output.image_url',
    'file_search_call.results',
    'message.input_image.image_url',
    'message.output_text.logprobs',
    'reasoning.encrypted_content',
    'web_search_call.action.sources',
  ],
  openrouter: [
    'code_interpreter_call.outputs',
    'computer_call_output.output.image_url',
    'file_search_call.results',
    'message.input_image.image_url',
    'reasoning.encrypted_content',
  ],
};

/** An operator's `request_compat.extra_include` value (desktop-service.ts validates the setting). */
export const REQUEST_COMPAT_INCLUDE_VALUE = /^[a-z_.]{1,64}$/;
export const REQUEST_COMPAT_MAX_EXTRA_INCLUDE = 8;

export interface RequestCompatChange { field: 'include'; value: string }

/** Adapts a parsed Responses create (or compact body) in place for its route; returns what it dropped. */
export function adaptRequestForRoute(
  payload: JsonObject | null,
  route: DesktopBridgeRouteContext,
  extraInclude: readonly string[] = [],
): RequestCompatChange[] {
  if (!payload || route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID) return [];
  const changes: RequestCompatChange[] = [];
  const allowlist = PROVIDER_INCLUDE_ALLOWLIST[route.provider_id];
  if (allowlist && Array.isArray(payload.include)) {
    const allowed = new Set([...allowlist, ...extraInclude]);
    const kept: string[] = [];
    for (const value of payload.include) {
      if (typeof value === 'string' && allowed.has(value)) kept.push(value);
      else changes.push({ field: 'include', value: String(value) });
    }
    if (kept.length !== payload.include.length) payload.include = kept;
  }
  return changes;
}

/**
 * The `include` values the operator added for this route's provider
 * (`request_compat.extra_include` on its profile), for a Codex-LB that already
 * accepts `output.encrypted_content` and should keep output-token replay.
 */
export function providerExtraInclude(config: PreparedDesktopBridgeConfig, route: DesktopBridgeRouteContext): readonly string[] {
  if (route.provider_id === BRIDGE_OFFICIAL_ROUTE_ID) return [];
  const values = config.providers[route.provider_id]?.request_compat?.extra_include;
  return Array.isArray(values) ? values.filter((value) => REQUEST_COMPAT_INCLUDE_VALUE.test(value)) : [];
}

interface AdaptationCount { count: number; loggedAtMs: number }

/** Per running bridge (one prepared config each), so a restart starts the counts over. */
const adaptationCounts = new WeakMap<object, Map<string, AdaptationCount>>();

function loggedValue(value: string): string {
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : '<other>';
}

/**
 * One line per (provider, field, value) when it first happens, then at most one
 * per summary interval carrying the running count: an adaptation repeats on
 * every turn, and the log must say that it happens, not each time it does.
 * Only the provider, the field name and an identifier-shaped value are written.
 */
export function logRequestAdaptation(
  config: PreparedDesktopBridgeConfig,
  route: DesktopBridgeRouteContext,
  changes: readonly RequestCompatChange[],
  transport: 'http' | 'websocket',
  options: { write?: (line: string) => void; now?: () => number } = {},
): void {
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const now = options.now?.() ?? Date.now();
  let counts = adaptationCounts.get(config);
  if (!counts) {
    counts = new Map();
    adaptationCounts.set(config, counts);
  }
  for (const change of changes) {
    const value = loggedValue(change.value);
    const key = `${route.provider_id}\0${change.field}\0${value}`;
    const entry = counts.get(key) ?? { count: 0, loggedAtMs: Number.NEGATIVE_INFINITY };
    entry.count += 1;
    counts.set(key, entry);
    if (entry.count > 1 && now - entry.loggedAtMs < REJECTION_LOG_SUMMARY_INTERVAL_MS) continue;
    entry.loggedAtMs = now;
    try {
      write(`${JSON.stringify({
        schema: DESKTOP_BRIDGE_LOG_SCHEMA,
        sks_version: PACKAGE_VERSION,
        at: new Date(now).toISOString(),
        secret_fields_redacted: true,
        event: 'sks.desktop_bridge.request_adapted',
        code: 'bridge_request_include_dropped',
        transport,
        provider_id: route.provider_id,
        field: change.field,
        value,
        count: entry.count,
      })}\n`);
    } catch {
      // Logging must never take the bridge down.
    }
  }
}
