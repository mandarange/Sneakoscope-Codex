import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import { jevEnabled, readDecisionConfig } from '../../decisions/config.js';
import { readImagegenConfig } from '../../imagegen/imagegen-config.js';
import {
  defaultSubagentEntry,
  type OpenRouterOnlyState,
  type SubagentModelEntry
} from '../../subagents/child-model-allowlist.js';
import { hasOpenRouterRoute, readControllerOpenRouterOnlyState } from './openrouter-only-catalog.js';
import { controllerEnv } from './shared.js';
import { loadCore } from './status.js';
import type { ControllerCore, DesktopBridgeControllerV3Options } from './types.js';

/**
 * `result.openrouter_only` — the one shape every OpenRouter Only Mode command
 * (and `auth-priority on`, which turns the mode off) returns, success or not.
 */
export interface OpenRouterOnlySubagentModelStatus extends SubagentModelEntry {
  /** The bare id routes to `openrouter` in the active route index. */
  routable: boolean;
}

export interface OpenRouterOnlyStatus {
  enabled: boolean;
  state: 'off' | 'active' | 'unavailable';
  error: string | null;
  main_model: string | null;
  default_subagent_model: string | null;
  subagent_models: OpenRouterOnlySubagentModelStatus[];
  jev_enabled: boolean;
  warnings: string[];
}

/** The order status reports them in: the first one that holds is THE error. */
export const OPENROUTER_ONLY_UNAVAILABLE_ERRORS = [
  'openrouter_only_provider_disabled',
  'openrouter_only_credential_missing',
  'openrouter_only_subagent_list_empty',
  'openrouter_only_main_model_not_openrouter',
  'desktop_bridge_not_running'
] as const;

/** Codex's hosted image tool does not exist on OpenRouter models. */
export const OPENROUTER_ONLY_CODEX_IMAGE_MODE_WARNING = 'openrouter_only_codex_image_mode_unavailable';

/** Turning the mode on needs a usable OpenRouter provider; this is its precondition. */
export function openRouterOnlyProviderBlocker(core: Pick<ControllerCore, 'registry'>): string | null {
  const profile = core.registry.profiles.openrouter;
  if (!profile.enabled) return 'openrouter_only_provider_disabled';
  if (profile.state !== 'ready') return 'openrouter_only_credential_missing';
  return null;
}

function activeRouteIndex(core: Pick<ControllerCore, 'activeCatalog'>) {
  return core.activeCatalog.ok ? core.activeCatalog.route_index : null;
}

export function openRouterOnlyError(
  core: Pick<ControllerCore, 'registry' | 'activeCatalog' | 'config' | 'service'>,
  state: OpenRouterOnlyState
): string | null {
  return openRouterOnlyProviderBlocker(core)
    ?? (state.subagent_models.length === 0 ? 'openrouter_only_subagent_list_empty' : null)
    ?? (hasOpenRouterRoute(activeRouteIndex(core), readTopLevelTomlString(core.config, 'model'))
      ? null : 'openrouter_only_main_model_not_openrouter')
    ?? (core.service.running ? null : 'desktop_bridge_not_running');
}

export async function openRouterOnlyStatusFromCore(
  core: ControllerCore,
  options: DesktopBridgeControllerV3Options,
  state: OpenRouterOnlyState = readControllerOpenRouterOnlyState(core.paths)
): Promise<OpenRouterOnlyStatus> {
  const routeIndex = activeRouteIndex(core);
  const [jev, imagegen] = await Promise.all([
    readDecisionConfig(controllerEnv(options)).then(jevEnabled).catch(() => false),
    readImagegenConfig({ HOME: core.paths.home }).catch(() => null)
  ]);
  const subagentModels = state.subagent_models.map((entry) => ({
    model: entry.model,
    criteria: entry.criteria,
    reasoning_effort: entry.reasoning_effort,
    default: entry.default,
    routable: hasOpenRouterRoute(routeIndex, entry.model)
  }));
  const error = state.enabled ? openRouterOnlyError(core, state) : null;
  const warnings = state.enabled
    ? [
        ...(imagegen?.mode === 'openrouter' ? [] : [OPENROUTER_ONLY_CODEX_IMAGE_MODE_WARNING]),
        ...subagentModels.filter((entry) => !entry.routable)
          .map((entry) => `openrouter_only_subagent_model_unroutable:${entry.model}`)
      ]
    : [];
  return {
    enabled: state.enabled,
    state: !state.enabled ? 'off' : error ? 'unavailable' : 'active',
    error,
    main_model: readTopLevelTomlString(core.config, 'model'),
    default_subagent_model: defaultSubagentEntry(state)?.model ?? null,
    subagent_models: subagentModels,
    jev_enabled: jev,
    warnings
  };
}

export async function openRouterOnlyStatus(options: DesktopBridgeControllerV3Options): Promise<OpenRouterOnlyStatus> {
  return openRouterOnlyStatusFromCore(await loadCore(options), options);
}
