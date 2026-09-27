import { canonicalizeBridgeModelId } from '../route-index.js';
import type {
  CodexSessionIdentity,
  DesktopBridgeConfig,
  DesktopBridgeOpenRouterOnlyConfig,
  DesktopBridgeRouteContext,
  DesktopBridgeRouteRequest,
} from './types.js';
import { DesktopBridgeError } from './types.js';

/**
 * OpenRouter Only Mode, enforced where every model request passes: the route
 * decision, before any provider pin is written. Hooks and plans steer children
 * onto the subagent list; this is the layer that still holds when they are not
 * installed or a caller ignores them.
 */

/** A model-carrying request resolved to Codex-LB, official OpenAI, or no route. */
export const OPENROUTER_ONLY_ROUTE_BLOCKED = 'openrouter_only_route_blocked' as const;
/** A spawned child named a model that is not on the subagent list. */
export const OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED = 'openrouter_only_subagent_model_blocked' as const;

/**
 * Both refusals are a property of the request under the current mode, not of
 * an upstream: retrying cannot succeed until the mode or the list changes. The
 * transports answer them like other route refusals (HTTP 409, and a permanent
 * refusal for a raw WebSocket upgrade).
 */
export const OPENROUTER_ONLY_REFUSAL_CODES: ReadonlySet<string> = new Set([
  OPENROUTER_ONLY_ROUTE_BLOCKED,
  OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED,
]);

/** A generous structural bound; the product limit (16) is the controller's to enforce. */
const MAX_SUBAGENT_MODEL_IDS = 64;
const OPENROUTER_ROUTE_QUALIFIER = 'openrouter:';

export function validateOpenRouterOnlyConfig(value: unknown): asserts value is DesktopBridgeOpenRouterOnlyConfig {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const models = row?.subagent_models;
  if (!row
    || Object.keys(row).some((key) => key !== 'enabled' && key !== 'subagent_models')
    || typeof row.enabled !== 'boolean'
    || !Array.isArray(models)
    || models.length > MAX_SUBAGENT_MODEL_IDS
    || models.some((model) => typeof model !== 'string' || canonicalizeBridgeModelId(model) !== model)
    || new Set(models).size !== models.length) {
    throw new DesktopBridgeError('bridge_openrouter_only_config_invalid');
  }
}

export function openRouterOnlyEnabled(config: Pick<DesktopBridgeConfig, 'openRouterOnly'>): boolean {
  return config.openRouterOnly?.enabled === true;
}

/**
 * Whether Codex marks this request as coming from a spawned child thread.
 *
 * Only explicit lineage counts: a parent thread id, a subagent kind, or a
 * `subagent` thread source. `thread_id !== session_id` alone is NOT a child —
 * forked and resumed threads diverge the same way. A `compact` subagent kind
 * is Codex compacting the thread it serves with that thread's own model, so
 * it is not treated as a child unless it also names a parent thread.
 */
export function codexRequestIsChild(identity: CodexSessionIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (identity.parent_thread_id) return true;
  const kind = identity.subagent_kind?.toLowerCase() ?? null;
  if (kind === 'compact') return false;
  return Boolean(kind) || identity.thread_source?.toLowerCase() === 'subagent';
}

function requestCarriesModel(request: DesktopBridgeRouteRequest): boolean {
  return String(request.public_model ?? '').trim() !== '';
}

/** The list identity of a routed public model: canonical, without an `openrouter:` qualifier. */
function subagentListKey(publicModel: string): string {
  const model = canonicalizeBridgeModelId(publicModel) || '';
  return model.startsWith(OPENROUTER_ROUTE_QUALIFIER) ? model.slice(OPENROUTER_ROUTE_QUALIFIER.length) : model;
}

/**
 * Whether a model request on a thread pinned to `pinnedProviderId` is refused
 * by the mode. A thread pinned to Codex-LB before the mode was turned on loses
 * that route once the OpenRouter-only catalog drops it; the resolver then
 * reports the pin, but the cause the user must see is the mode.
 */
export function openRouterOnlyRefusesPinnedProvider(
  request: DesktopBridgeRouteRequest,
  pinnedProviderId: string | null,
  config: Pick<DesktopBridgeConfig, 'openRouterOnly'>,
): boolean {
  return openRouterOnlyEnabled(config) && requestCarriesModel(request)
    && pinnedProviderId !== null && pinnedProviderId !== 'openrouter';
}

/**
 * Refuse a resolved route that OpenRouter Only Mode forbids. A no-op when the
 * mode is off, and for requests that carry no model (files, wham, transcribe
 * and other native endpoints Codex Desktop needs through the official
 * passthrough).
 */
export function assertOpenRouterOnlyRoute(
  request: DesktopBridgeRouteRequest,
  route: DesktopBridgeRouteContext,
  config: Pick<DesktopBridgeConfig, 'openRouterOnly'>,
): void {
  const mode = config.openRouterOnly;
  if (!mode || mode.enabled !== true || !requestCarriesModel(request)) return;
  if (route.provider_id !== 'openrouter') throw new DesktopBridgeError(OPENROUTER_ONLY_ROUTE_BLOCKED);
  if (!codexRequestIsChild(request.identity)) return;
  const key = subagentListKey(route.public_model);
  if (!key || !mode.subagent_models.includes(key)) throw new DesktopBridgeError(OPENROUTER_ONLY_SUBAGENT_MODEL_BLOCKED);
}
