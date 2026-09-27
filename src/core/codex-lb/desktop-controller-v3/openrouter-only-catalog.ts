import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import { isOpenRouterModelId } from '../../imagegen/imagegen-config.js';
import {
  readOpenRouterOnlyStateSync,
  type OpenRouterOnlyLocation,
  type OpenRouterOnlyState
} from '../../subagents/child-model-allowlist.js';
import type { BridgeRouteIndex } from '../bridge-contracts.js';
import {
  MAX_SELECTED_OPENROUTER_MODELS,
  type BridgeModelSelection
} from '../combined-catalog/model-selection.js';
import type { BridgeProviderRegistry } from '../provider-registry.js';
import { canonicalizeBridgeModelId } from '../route-index.js';
import type { ControllerPaths } from './types.js';

/**
 * The catalog shape OpenRouter Only Mode asks every controller sync for.
 *
 * Every sync path (catalog sync, model selection, ensure/repair, `sks update`
 * restage, doctor's stale-catalog repair) goes through one sync function, which
 * reads the mode here. While the mode is on, codex-lb contributes no rows and no
 * routes — the Codex picker offers only OpenRouter models and codex-lb has
 * nothing to route to — and OpenRouter exposes the subagent list on top of the
 * picker selection, because Codex refuses to spawn a child whose model is not
 * in its catalog. The codex-lb provider profile itself is never touched, so
 * turning the mode off brings its rows back on the next sync.
 */

/** The controller's store location: always `<home>/.codex`, never an inherited CODEX_HOME. */
export function openRouterOnlyStoreLocation(paths: Pick<ControllerPaths, 'home' | 'codexHome'>): OpenRouterOnlyLocation {
  return { home: paths.home, env: { HOME: paths.home, CODEX_HOME: paths.codexHome } };
}

export function readControllerOpenRouterOnlyState(paths: Pick<ControllerPaths, 'home' | 'codexHome'>): OpenRouterOnlyState {
  return readOpenRouterOnlyStateSync(openRouterOnlyStoreLocation(paths));
}

/**
 * Picker selection ∪ subagent list (∪ the configured main model when it is an
 * OpenRouter id, so a list edit can never drop the model the main thread runs —
 * the same promise the first-curation seed makes). List entries come first so
 * they always survive the 64-model cap.
 */
export function openRouterOnlyExposure(
  selection: BridgeModelSelection,
  state: OpenRouterOnlyState,
  configText: string
): BridgeModelSelection {
  const configured = readTopLevelTomlString(configText, 'model');
  const ordered = [
    ...state.subagent_models.map((entry) => entry.model),
    ...(isOpenRouterModelId(configured) ? [configured] : []),
    ...selection.openrouter.public_ids
  ];
  const ids: string[] = [];
  for (const raw of ordered) {
    const id = canonicalizeBridgeModelId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return { ...selection, openrouter: { mode: 'selected', public_ids: ids.slice(0, MAX_SELECTED_OPENROUTER_MODELS) } };
}

/**
 * The registry the catalog fetch and build see: codex-lb reads as disabled, so
 * it is neither contacted nor given rows or routes. The real registry (and the
 * stored provider profiles) keep codex-lb exactly as the operator left it.
 */
export function withoutCodexLbCatalog(registry: BridgeProviderRegistry): BridgeProviderRegistry {
  return {
    ...registry,
    profiles: {
      ...registry.profiles,
      'codex-lb': { ...registry.profiles['codex-lb'], enabled: false, state: 'disabled' }
    }
  };
}

/** A model Codex can run through OpenRouter: its bare id routes to `openrouter`. */
export function hasOpenRouterRoute(routeIndex: Pick<BridgeRouteIndex, 'routes'> | null, model: unknown): boolean {
  const key = canonicalizeBridgeModelId(model);
  return Boolean(key && routeIndex?.routes[key]?.provider_id === 'openrouter');
}
