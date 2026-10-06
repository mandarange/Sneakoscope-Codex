import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import { codexRestartBlockers, maybeRestartRunningCodexApp, type CodexAppRestartOutcome } from '../../codex-app/codex-app-restart-policy.js';
import { readText } from '../../fsx.js';
import { isOpenRouterModelId } from '../../imagegen/imagegen-config.js';
import {
  MAX_SUBAGENT_MODELS,
  normalizeSubagentModelList,
  readOpenRouterOnlyStateSync,
  writeOpenRouterOnlyState,
  type OpenRouterOnlyLocation,
  type OpenRouterOnlyState,
  type SubagentModelEntry
} from '../../subagents/child-model-allowlist.js';
import type { DesktopBridgeCommandOperation, DesktopBridgeCommandResult } from '../bridge-contracts.js';
import { assertDesktopBridgeStatusV3 } from '../bridge-runtime-validation.js';
import { readActiveCombinedBridgeCatalog } from '../combined-catalog.js';
import {
  MAX_SELECTED_OPENROUTER_MODELS,
  bridgeAvailableModelsPath,
  readBridgeModelSelectionState,
  writeBridgeModelSelection
} from '../combined-catalog/model-selection.js';
import { ensureUserReadOnlyListRole } from '../../subagents/read-only-list-role.js';
import { canonicalizeBridgeModelId } from '../route-index.js';
import { syncCatalogInternal } from './catalog.js';
import { hasOpenRouterRoute, openRouterOnlyStoreLocation } from './openrouter-only-catalog.js';
import {
  applyOpenRouterOnlyMainModel,
  openRouterOnlyMainModelTarget,
  restoreOpenRouterOnlyMainModel,
  type OpenRouterOnlyMainModelChange
} from './openrouter-only-main-model.js';
import { openRouterOnlyProviderBlocker, openRouterOnlyStatusFromCore } from './openrouter-only-status.js';
import { commandResult, controllerEnv, controllerPaths, nowIso, stringArray } from './shared.js';
import { loadCore, statusFromCore } from './status.js';
import type { ControllerPaths, DesktopBridgeControllerV3Options } from './types.js';

/**
 * OpenRouter Only Mode and its subagent model list, as controller operations.
 *
 * The mode and Codex-LB mode (bridge auth priority) are mutually exclusive:
 * turning this mode on writes `auth_priority_enabled: false` in the same
 * operation, and `auth-priority on` runs `turnOffOpenRouterOnly` first. Every
 * store change (mode or list) is synced before it is committed: the catalog
 * sync builds for the target state and writes the store only once that catalog
 * is active and before the bridge restarts, so a failed sync changes nothing
 * and the hooks and the bridge never disagree about the mode or the list.
 */

type ExtraResult = Record<string, unknown>;

async function finish(
  operation: DesktopBridgeCommandOperation,
  ok: boolean,
  blockers: readonly string[],
  extra: ExtraResult,
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  const core = await loadCore(options);
  const status = statusFromCore(core, options);
  assertDesktopBridgeStatusV3(status);
  const openRouterOnly = await openRouterOnlyStatusFromCore(core, options);
  return commandResult(operation, ok, status, {
    openrouter_only: openRouterOnly,
    auth_priority: status.auth_priority,
    ...extra
  }, blockers, options);
}

function syncBlockers(sync: Record<string, unknown>): string[] {
  const activation = sync.activation && typeof sync.activation === 'object' && !Array.isArray(sync.activation)
    ? sync.activation as Record<string, unknown>
    : {};
  const blockers = stringArray(activation.blockers);
  return blockers.length > 0 ? blockers : ['combined_catalog_sync_failed'];
}

/** Codex reads its model catalog only at launch; new list entries wait for a relaunch. */
export const CODEX_RELAUNCH_FOR_SUBAGENT_MODELS_WARNING = 'codex_relaunch_required_for_new_subagent_models';

function restartCodex(
  changed: boolean,
  noRestart: boolean,
  options: DesktopBridgeControllerV3Options
): Promise<CodexAppRestartOutcome> {
  return maybeRestartRunningCodexApp({
    env: controllerEnv(options),
    changed,
    noRestart,
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.codexAppRunningImpl ? { isRunningImpl: options.codexAppRunningImpl } : {}),
    ...(options.codexAppRestartImpl ? { restartImpl: options.codexAppRestartImpl } : {})
  });
}

export async function openRouterOnlyStatusCommand(options: DesktopBridgeControllerV3Options): Promise<DesktopBridgeCommandResult> {
  return finish('openrouter-only.status', true, [], {}, options);
}

export async function setOpenRouterOnly(
  enabled: boolean,
  noRestart: boolean,
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  if (enabled) return enableOpenRouterOnly(noRestart, options);
  const off = await turnOffOpenRouterOnly(options, { repairCatalog: true });
  if (!off.ok) return finish('openrouter-only.set', false, off.blockers, { catalog_sync: off.catalog_sync }, options);
  const restart = await restartCodex(off.changed, noRestart, options);
  return finish('openrouter-only.set', true, [...off.blockers, ...codexRestartBlockers(restart)], {
    changed: off.changed,
    catalog_sync: off.catalog_sync,
    main_model: off.main_model,
    codex_restart: restart
  }, options);
}

/**
 * An empty list is seeded from the models the operator already exposes in the
 * Codex picker (the configured main model when nothing is selected), so the
 * mode starts with the OpenRouter models already in use.
 */
async function seedSubagentModels(
  home: string,
  configText: string,
  options: DesktopBridgeControllerV3Options
): Promise<SubagentModelEntry[]> {
  const selected = (await readBridgeModelSelectionState(home, nowIso(options))).selection.openrouter.public_ids;
  const configured = readTopLevelTomlString(configText, 'model');
  const candidates = (selected.length > 0 ? selected : [configured]).filter(isOpenRouterModelId);
  return normalizeSubagentModelList(candidates.slice(0, MAX_SUBAGENT_MODELS).map((model, index) => ({
    model,
    criteria: '',
    reasoning_effort: null,
    default: index === 0
  }))).entries;
}

async function enableOpenRouterOnly(
  noRestart: boolean,
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  const core = await loadCore(options);
  const location = openRouterOnlyStoreLocation(core.paths);
  const before = readOpenRouterOnlyStateSync(location);
  const providerBlocker = openRouterOnlyProviderBlocker(core);
  if (providerBlocker) return finish('openrouter-only.set', false, [providerBlocker], {}, options);
  const entries = before.subagent_models.length > 0
    ? before.subagent_models
    : await seedSubagentModels(core.paths.home, core.config, options);
  if (entries.length === 0) {
    return finish('openrouter-only.set', false, ['openrouter_only_no_openrouter_models'], {}, options);
  }
  // Codex-LB mode goes off in this same operation: the sync persists the
  // bridge settings with auth priority off together with the store, or
  // persists nothing at all (the seeded list included). A list with no model
  // the new catalog routes would leave the main thread and every child on a
  // model the bridge refuses, so the commit fails and nothing lands.
  const sync = await syncCatalogInternal({
    ...options,
    settings: { ...(options.settings || {}), auth_priority_enabled: false }
  }, {
    openRouterOnly: { ...before, enabled: true, subagent_models: entries },
    onActivated: async () => {
      await requireRoutableEntry(core.paths, { ...before, enabled: true, subagent_models: entries });
      await writeOpenRouterOnlyState({ enabled: true, subagent_models: entries }, location);
    }
  });
  if (sync.ok !== true) return finish('openrouter-only.set', false, syncBlockers(sync), { catalog_sync: sync }, options);
  // The mode is committed: what follows is best effort, reported as blockers,
  // and never skips the Codex restart that loads the new catalog.
  const main = await switchMainModelToList(core.paths, location, options)
    .catch(() => failedMainModel('openrouter_only_main_model_switch_failed'));
  // Read-only slices spawn with this model-less role; Codex loads it at launch.
  const readOnlyRole = await ensureUserReadOnlyListRole(core.paths.home).catch(() => 'failed' as const);
  const roleBlockers = readOnlyRole === 'failed' ? ['openrouter_only_read_only_role_install_failed'] : [];
  const changed = !before.enabled || main.changed || readOnlyRole === 'created' || readOnlyRole === 'updated';
  const restart = await restartCodex(changed, noRestart, options);
  return finish('openrouter-only.set', true, [...main.blockers, ...roleBlockers, ...codexRestartBlockers(restart)], {
    changed,
    seeded_subagent_models: before.subagent_models.length === 0,
    catalog_sync: sync,
    main_model: main,
    read_only_role: readOnlyRole,
    codex_restart: restart
  }, options);
}

/**
 * Points the main model at the list when it is not an OpenRouter model the
 * active catalog routes (a no-op when it is), recording what it replaced.
 */
async function switchMainModelToList(
  paths: ControllerPaths,
  location: OpenRouterOnlyLocation,
  options: DesktopBridgeControllerV3Options
): Promise<OpenRouterOnlyMainModelChange> {
  const active = await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath);
  const state = readOpenRouterOnlyStateSync(location);
  const main = await applyOpenRouterOnlyMainModel(paths, state, active.ok ? active.route_index : null, options);
  if (main.restore !== state.restore) await writeOpenRouterOnlyState({ restore: main.restore }, location);
  return main.change;
}

function failedMainModel(blocker: string): OpenRouterOnlyMainModelChange {
  return { changed: false, action: 'blocked', previous_model: null, model: null, write_status: null, blockers: [blocker] };
}

/** Thrown inside a sync commit so the activation rolls back. */
async function requireRoutableEntry(paths: ControllerPaths, state: OpenRouterOnlyState): Promise<void> {
  const active = await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath);
  if (!openRouterOnlyMainModelTarget(state, active.ok ? active.route_index : null)) {
    throw new Error('openrouter_only_no_routable_subagent_model');
  }
}

/** Model ids Codex is offered: only an added one needs a Codex relaunch. */
async function exposedModelIds(paths: ControllerPaths): Promise<Set<string>> {
  return new Set(((await activeCatalog(paths))?.catalog.models ?? []).map((model) => String(model.public_id)));
}

async function activeCatalog(paths: ControllerPaths) {
  const active = await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath);
  return active.ok ? active : null;
}

/**
 * OFF keeps the promise ON's exposure makes: an OpenRouter main model that
 * stays configured stays in the Codex picker selection, so the catalog the
 * mode-off sync builds still routes it.
 */
async function keepModelInPickerSelection(
  home: string,
  model: string | null,
  options: DesktopBridgeControllerV3Options
): Promise<{ changed: boolean; blockers: string[] }> {
  if (!isOpenRouterModelId(model)) return { changed: false, blockers: [] };
  const { selection } = await readBridgeModelSelectionState(home, nowIso(options));
  const ids = selection.openrouter.public_ids;
  const key = canonicalizeBridgeModelId(model);
  if (ids.some((id) => canonicalizeBridgeModelId(id) === key)) return { changed: false, blockers: [] };
  if (ids.length >= MAX_SELECTED_OPENROUTER_MODELS) return { changed: false, blockers: ['openrouter_only_main_model_unexposed'] };
  await writeBridgeModelSelection(home, {
    ...selection,
    updated_at: nowIso(options),
    openrouter: { mode: 'selected', public_ids: [...ids, model] }
  });
  return { changed: true, blockers: [] };
}

/** Mode off, yet codex-lb (enabled, ready) has no rows: an ON that died mid-sync. */
async function codexLbRowsMissing(options: DesktopBridgeControllerV3Options): Promise<boolean> {
  const core = await loadCore(options);
  const profile = core.registry.profiles['codex-lb'];
  return profile.enabled && profile.state === 'ready' && core.activeCatalog.ok
    && !core.activeCatalog.catalog.models.some((model) => model.provider_id === 'codex-lb');
}

/** Puts back the main model SKS switched; a restore the guarded writer refused is kept for the next attempt. */
async function restoreMainModel(
  paths: ControllerPaths,
  location: OpenRouterOnlyLocation,
  before: OpenRouterOnlyState,
  options: DesktopBridgeControllerV3Options
): Promise<OpenRouterOnlyMainModelChange> {
  const main = await restoreOpenRouterOnlyMainModel(paths, before.restore, options);
  await writeOpenRouterOnlyState({ restore: main.blockers.length > 0 ? before.restore : null }, location);
  return main;
}

export interface OpenRouterOnlyOffOutcome {
  ok: boolean;
  changed: boolean;
  catalog_sync: Record<string, unknown> | null;
  main_model: OpenRouterOnlyMainModelChange | null;
  blockers: string[];
}

/**
 * Store off (the list is kept), normal catalog sync (codex-lb rows back), and
 * the main model SKS switched put back. Auth priority is left as it is; the
 * operator turns Codex-LB mode on explicitly. A mode that is already off with
 * nothing left to restore is a no-op — except that the explicit OFF command
 * (`repairCatalog`) also re-syncs a catalog an interrupted ON left without
 * codex-lb rows.
 */
export async function turnOffOpenRouterOnly(
  options: DesktopBridgeControllerV3Options,
  behavior: { restartService?: boolean; repairCatalog?: boolean } = {}
): Promise<OpenRouterOnlyOffOutcome> {
  const paths = controllerPaths(options);
  const location = openRouterOnlyStoreLocation(paths);
  const before = readOpenRouterOnlyStateSync(location);
  const repair = !before.enabled && behavior.repairCatalog === true && await codexLbRowsMissing(options);
  if (!before.enabled && !before.restore && !repair) {
    return { ok: true, changed: false, catalog_sync: null, main_model: null, blockers: [] };
  }
  const off: OpenRouterOnlyState = { ...before, enabled: false };
  const sync = (commit: boolean) => syncCatalogInternal(options, {
    ...(behavior.restartService === undefined ? {} : { restartService: behavior.restartService }),
    openRouterOnly: off,
    ...(commit ? { onActivated: () => writeOpenRouterOnlyState({ enabled: false }, location) } : {})
  });
  // A main model the restore will leave in place (the user picked it while
  // the mode was on) joins the picker before the sync rebuilds the catalog.
  const configured = readTopLevelTomlString(String(await readText(paths.configPath, '')), 'model');
  const restoreApplies = Boolean(before.restore?.applied_model) && configured === before.restore?.applied_model;
  const kept = restoreApplies ? { changed: false, blockers: [] } : await keepModelInPickerSelection(paths.home, configured, options);
  let catalogSync: Record<string, unknown> | null = null;
  if (before.enabled || repair || kept.changed) {
    catalogSync = await sync(true);
    if (catalogSync.ok !== true) {
      return { ok: false, changed: false, catalog_sync: catalogSync, main_model: null, blockers: syncBlockers(catalogSync) };
    }
  }
  const main = await restoreMainModel(paths, location, before, options);
  const blockers = [...kept.blockers, ...main.blockers];
  if (main.action === 'blocked' && !hasOpenRouterRoute((await activeCatalog(paths))?.route_index ?? null, main.model)) {
    // The refused restore leaves SKS's list model configured: keep it routable.
    const keptAfter = await keepModelInPickerSelection(paths.home, main.model, options);
    blockers.push(...keptAfter.blockers);
    if (keptAfter.changed) {
      catalogSync = await sync(false);
      if (catalogSync.ok !== true) blockers.push(...syncBlockers(catalogSync));
    }
  }
  return {
    ok: true,
    changed: before.enabled || repair || kept.changed || main.changed,
    catalog_sync: catalogSync,
    main_model: main,
    blockers
  };
}

/**
 * `unmanage` and `rollback` take Codex off the bridge this mode runs on. Once
 * they succeed the mode goes off and the main model SKS switched is put back,
 * so neither the hooks nor config.toml keep pointing at OpenRouter models Codex
 * can no longer reach. No catalog sync: the managed catalog is gone.
 */
export async function releaseOpenRouterOnlyWithoutBridge(
  options: DesktopBridgeControllerV3Options
): Promise<OpenRouterOnlyOffOutcome | null> {
  const paths = controllerPaths(options);
  const location = openRouterOnlyStoreLocation(paths);
  const before = readOpenRouterOnlyStateSync(location);
  if (!before.enabled && !before.restore) return null;
  if (before.enabled) await writeOpenRouterOnlyState({ enabled: false }, location);
  const main = await restoreMainModel(paths, location, before, options);
  return { ok: true, changed: before.enabled || main.changed, catalog_sync: null, main_model: main, blockers: main.blockers };
}

/**
 * `auth-priority on` while this mode is on runs the OFF path first. The
 * auth-priority write that follows restarts the bridge once for both, and
 * Codex Desktop is restarted after that, by the same policy.
 */
export function releaseOpenRouterOnlyForAuthPriority(
  options: DesktopBridgeControllerV3Options
): Promise<OpenRouterOnlyOffOutcome> {
  return turnOffOpenRouterOnly(options, { restartService: false });
}

export function restartCodexAfterOpenRouterOnlyOff(
  off: OpenRouterOnlyOffOutcome,
  options: DesktopBridgeControllerV3Options
): Promise<CodexAppRestartOutcome> {
  return restartCodex(off.changed, false, options);
}

async function availableOpenRouterModels(home: string): Promise<Array<{ public_id: string; display_name: string }>> {
  try {
    const parsed = JSON.parse(await readText(bridgeAvailableModelsPath(home), '') || 'null');
    const rows: unknown[] = Array.isArray(parsed?.openrouter) ? parsed.openrouter : [];
    return rows.map((row: any) => ({
      public_id: String(row?.public_id || ''),
      display_name: String(row?.display_name || row?.public_id || '')
    })).filter((row) => row.public_id);
  } catch {
    return [];
  }
}

export async function listSubagentModels(options: DesktopBridgeControllerV3Options): Promise<DesktopBridgeCommandResult> {
  const available = await availableOpenRouterModels(controllerPaths(options).home);
  return finish('subagent-models.list', true, [], { available }, options);
}

export async function setSubagentModels(
  raw: unknown,
  noRestart: boolean,
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  if (!Array.isArray(raw)) return finish('subagent-models.set', false, ['subagent_models_payload_invalid'], {}, options);
  const { entries, issues } = normalizeSubagentModelList(raw);
  if (issues.length > 0) {
    return finish('subagent-models.set', false, issues.map((issue) => `${issue.code}:${issue.index}`), {}, options);
  }
  const paths = controllerPaths(options);
  const location = openRouterOnlyStoreLocation(paths);
  const before = readOpenRouterOnlyStateSync(location);
  if (!before.enabled) {
    await writeOpenRouterOnlyState({ subagent_models: entries }, location);
    return finish('subagent-models.set', true, [], { catalog_sync: null }, options);
  }
  // New entries must be in Codex's catalog before a child can be spawned on
  // them. The list is committed with that catalog, before the bridge
  // restarts; a failed sync keeps the old list everywhere.
  const exposedBefore = await exposedModelIds(paths);
  const sync = await syncCatalogInternal(options, {
    openRouterOnly: { ...before, subagent_models: entries },
    onActivated: async () => {
      // An empty list is allowed and reported as unavailable; a list whose
      // every model is unroutable would silently strand every child.
      if (entries.length > 0) await requireRoutableEntry(paths, { ...before, subagent_models: entries });
      await writeOpenRouterOnlyState({ subagent_models: entries }, location);
    }
  });
  if (sync.ok !== true) return finish('subagent-models.set', false, syncBlockers(sync), { catalog_sync: sync }, options);
  // A list with a routable entry completes an ON that could not switch the main model.
  const main = await switchMainModelToList(paths, location, options)
    .catch(() => failedMainModel('openrouter_only_main_model_switch_failed'));
  // The upstream catalog changes on its own (prices, new models); only a model
  // newly offered to Codex needs Codex to relaunch.
  const exposedAfter = await exposedModelIds(paths);
  const catalogChanged = [...exposedAfter].some((id) => !exposedBefore.has(id));
  const changed = catalogChanged || main.changed;
  // Codex Desktop reads the catalog only at launch: a running Codex cannot
  // spawn a new entry until it restarts.
  const restart = await restartCodex(changed, noRestart, options);
  const relaunchPending = changed && !restart.attempted && restart.reason !== 'codex_not_running';
  return finish('subagent-models.set', true, [...main.blockers, ...codexRestartBlockers(restart)], {
    changed,
    catalog_sync: sync,
    main_model: main,
    codex_restart: restart,
    warnings: relaunchPending ? [CODEX_RELAUNCH_FOR_SUBAGENT_MODELS_WARNING] : []
  }, options);
}
