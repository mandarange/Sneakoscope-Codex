import { readText, writeJsonAtomic } from '../../fsx.js';
import { codexReadsBridgeModels, hasUserOwnedModelCatalog, repairManagedCodexLbClientSelection } from '../../../cli/install-helpers-codex-lb-config.js';
import { safeWriteCodexConfigToml } from '../../codex-runtime/codex-desktop-config-policy.js';
import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import { codexRestartBlockers, maybeRestartRunningCodexApp } from '../../codex-app/codex-app-restart-policy.js';
import {
  BRIDGE_MODEL_SELECTION_SCHEMA,
  MAX_SELECTED_OPENROUTER_MODELS,
  bridgeAvailableModelsPath,
  pruneSelection,
  readBridgeModelSelectionState,
  type BridgeModelSelection,
  writeBridgeModelSelection
} from '../combined-catalog/model-selection.js';
import { listOpenRouterModels } from '../../providers/openrouter/openrouter-account.js';
import type { BridgeProviderId, DesktopBridgeCommandResult } from '../bridge-contracts.js';
import {
  buildCombinedBridgeCatalog,
  readActiveCombinedBridgeCatalog,
  stageCombinedBridgeCatalog,
  type CombinedCatalogStagingResult,
  type ProviderCatalogBuildInput
} from '../combined-catalog.js';
import { COMBINED_BRIDGE_CATALOG_TTL_MS } from '../combined-catalog/contracts.js';
import { codexLbEnvPath, codexLbMetadataPath, loadCodexLbEnv, readCodexLbModelCatalog } from '../codex-lb-env.js';
import {
  bootstrapExistingDesktopBridgeService,
  desktopBridgeServicePaths,
  desktopBridgeServiceStatus,
  readDesktopBridgeServiceSettings,
  resolveDesktopBridgeActivationSettings,
  resolveEffectiveOfficialModelsMode
} from '../desktop-service.js';
import { inspectHistoricalDesktopBridgeIntent, migrateDesktopBridgeConfig } from '../desktop-bridge-migration.js';
import { rollbackDesktopBridgeUnificationReceipt } from '../migration-receipt.js';
import {
  recordProviderCredentialValidation,
  type ResolvedProviderCredential
} from '../provider-credentials.js';
import {
  bridgeProviderRegistryPath,
  buildStoredBridgeProviderRegistry,
  loadStoredBridgeProviderRegistry,
  resolveBridgeProviderRegistry,
  serializeStoredBridgeProviderRegistry,
  type BridgeProviderRegistry
} from '../provider-registry.js';
import { applyOfficialModelPassthrough, buildBridgeRoutingPolicy, readBridgeRoutingPolicy } from '../provider-route-policy.js';
import { sha256Stable } from '../route-index.js';
import {
  bridgeBaseUrl,
  commandResult,
  controllerEnv,
  controllerPaths,
  nowIso,
  providerCode,
  providerRegistrySnapshot,
  resolveRawCredentials,
  resolveValidatedCredentials,
  safeCode,
  serializedSettings,
  stringArray,
  timeoutMs,
  unique
} from './shared.js';
import { desktopBridgeStatusV3 } from './status.js';
import { openRouterOnlyExposure, readControllerOpenRouterOnlyState, withoutCodexLbCatalog } from './openrouter-only-catalog.js';
import type { OpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';
import type { ControllerPaths, DesktopBridgeControllerRequestV3, DesktopBridgeControllerV3Options } from './types.js';
import {
  MODEL_REFRESH_RECOVERY_COMMAND,
  alignCodexModelSource,
  bridgeServesModels,
  listedModelSlugs,
  modelListDiff,
  modelRefreshLine,
  readModelRefreshState,
  refreshedRecently,
  writeModelRefreshState,
  type CodexModelSource
} from './model-refresh.js';

export interface CatalogSyncBehavior {
  restartService?: boolean;
  /**
   * The OpenRouter Only state to build for instead of the stored one, so a mode
   * or list change is synced before it is committed.
   */
  openRouterOnly?: OpenRouterOnlyState;
  /**
   * Commits that change once the new catalog is active and before the bridge
   * restarts (the restarted bridge reads it at start). A commit that throws
   * rolls the activation back, so the catalog and the commit land together.
   */
  onActivated?: () => Promise<unknown>;
  /** False activates only when config.toml stays byte-identical (a read-only Doctor). Defaults to true. */
  configWrites?: boolean;
}

export async function syncCatalog(options: DesktopBridgeControllerV3Options): Promise<DesktopBridgeCommandResult> {
  const result = await syncCatalogInternal(options);
  const status = await desktopBridgeStatusV3(options);
  const activation = result.activation && typeof result.activation === 'object'
    ? result.activation as Record<string, unknown>
    : {};
  return commandResult(
    'catalog.sync',
    result.ok === true,
    status,
    { catalog_sync: result },
    result.ok === true ? [] : stringArray(activation.blockers),
    options
  );
}

/**
 * Sets back a `model_provider = "codex-lb"` the old provider toggle wrote under
 * the managed marker (repairManagedCodexLbClientSelection), so the sync goes on
 * instead of refusing it as user-owned. A guarded write that is refused (the
 * config changed underneath, say) blocks this sync; the next one tries again.
 */
async function repairCodexLbClientSelection(configPath: string): Promise<string | null> {
  const current = await readText(configPath, '');
  const next = repairManagedCodexLbClientSelection(current);
  if (next === current) return null;
  const write = await safeWriteCodexConfigToml(configPath, current, next, 'codex-lb-client-provider-repair', { verifyUnchangedBeforeWrite: true });
  return write.ok ? null : `codex_lb_client_provider_repair_refused:${write.status}`;
}

export async function syncCatalogInternal(
  options: DesktopBridgeControllerV3Options,
  behavior: CatalogSyncBehavior = {}
): Promise<Record<string, unknown>> {
  const paths = controllerPaths(options);
  const repair = behavior.configWrites === false ? null : await repairCodexLbClientSelection(paths.configPath);
  if (repair) return blockedSync(inspectHistoricalDesktopBridgeIntent(''), [repair]);
  const configText = await readText(paths.configPath, '');
  const historicalIntent = inspectHistoricalDesktopBridgeIntent(configText);
  if (historicalIntent.blockers.length > 0) return blockedSync(historicalIntent, historicalIntent.blockers);
  const rawCredentials = await resolveRawCredentials(options, paths);
  const storedRegistryRead = await loadStoredBridgeProviderRegistry({ home: paths.home });
  if (storedRegistryRead.blockers.length > 0) return blockedSync(historicalIntent, storedRegistryRead.blockers);
  const storedRegistry = storedRegistryRead.registry || buildStoredBridgeProviderRegistry({
    credentials: rawCredentials,
    overrides: historicalIntent.providers
  });
  const initialRegistry = await resolveBridgeProviderRegistry({
    home: paths.home,
    credentials: rawCredentials,
    storedRegistry
  });
  // OpenRouter Only Mode: codex-lb is neither fetched nor given rows or routes.
  const openRouterOnly = behavior.openRouterOnly ?? readControllerOpenRouterOnlyState(paths);
  const catalogRegistry = (value: BridgeProviderRegistry) => openRouterOnly.enabled ? withoutCodexLbCatalog(value) : value;
  const catalogs = await fetchProviderCatalogs(catalogRegistry(initialRegistry), rawCredentials, paths, options);
  const credentials = await resolveValidatedCredentials(options, paths);
  const registry = await resolveBridgeProviderRegistry({ home: paths.home, credentials, storedRegistry });
  const selectionState = await readBridgeModelSelectionState(paths.home, nowIso(options));
  // First curation run: keep whatever OpenRouter model the operator is already
  // configured to use, so enabling curation never removes the active model.
  const selection = selectionState.stored
    ? selectionState.selection
    : seedSelectionFromConfiguredModel(selectionState.selection, await readText(paths.configPath, ''));
  const exposure = openRouterOnly.enabled
    ? openRouterOnlyExposure(selection, openRouterOnly, await readText(paths.configPath, ''))
    : selection;
  const build = buildCombinedBridgeCatalog(catalogRegistry(registry), { catalogs, created_at: nowIso(options), selection: exposure });
  const lost = providersLostToFailedFetch(
    await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath),
    catalogs,
    catalogRegistry(registry)
  );
  if (lost.length > 0) {
    return { ...blockedSync(historicalIntent, lost.map((providerId) => `${providerCode(providerId)}_catalog_refresh_failed`)), build, active_generation_preserved: true };
  }
  if (!selectionState.stored) await writeBridgeModelSelection(paths.home, selection).catch(() => undefined);
  // The available list is what SKS Center offers for curation; persisting it on
  // every sync keeps the picker choices in step with what OpenRouter serves.
  await writeJsonAtomic(bridgeAvailableModelsPath(paths.home), {
    schema: 'sks.bridge-available-models.v1',
    updated_at: nowIso(options),
    openrouter: build.available_openrouter_models
  }, { mode: 0o600 }).catch(() => undefined);
  const pruned = pruneSelection(selection, build.available_openrouter_models);
  if (pruned !== selection) await writeBridgeModelSelection(paths.home, pruned).catch(() => undefined);
  const staging = await stageCombinedBridgeCatalog({
    build,
    catalogPath: paths.catalogPath,
    routeIndexPath: paths.routeIndexPath
  });
  if (!staging.staged || !staging.catalog_path || !staging.pointer_text) {
    return { ok: false, build, activation: activationResult(staging, false), migration: null };
  }
  const priorPolicy = await readBridgeRoutingPolicy(paths.routePolicyPath);
  const readyProviders = (['codex-lb', 'openrouter'] as const).filter((providerId) =>
    registry.profiles[providerId].enabled
      && registry.profiles[providerId].state === 'ready'
      && Object.values(build.route_index.routes).some((route) => route.provider_id === providerId));
  const previousDefault = priorPolicy.policy?.default_provider_id || null;
  const historicalDefault = historicalIntent.default_provider_id;
  // OpenRouter Only Mode leaves codex-lb without routes on purpose; the
  // operator's default provider is carried through so turning the mode off
  // finds it again. Routing never reads the default.
  const defaultProvider = openRouterOnly.enabled && priorPolicy.policy
    ? previousDefault
    : previousDefault && readyProviders.includes(previousDefault)
      ? previousDefault
      : historicalDefault && readyProviders.includes(historicalDefault) ? historicalDefault
        : readyProviders.length === 1 ? readyProviders[0] || null : null;
  // The official-models mode is resolved from the operator's durable choice
  // (settings.official_passthrough.models), with 'auto' following the host
  // auth mode — so a catalog refresh can neither silently return a
  // ChatGPT-OAuth operator's models to the gateway identity (the swap that
  // broke Codex Apps connector links and conversation affinity) nor flip a
  // deliberate gateway operator onto passthrough.
  const persistedSettings = await readDesktopBridgeServiceSettings(
    options.settingsPath || desktopBridgeServicePaths(paths.home).settings_path,
  ).catch(() => null);
  const officialModelsMode = await resolveEffectiveOfficialModelsMode(
    persistedSettings?.official_passthrough,
    {
      home: paths.home,
      authPath: paths.authPath,
      authPriorityEnabled: options.settings?.auth_priority_enabled ?? persistedSettings?.auth_priority_enabled ?? false,
      // Registering + enabling codex-lb IS the operator choosing the gateway;
      // un-registering converges a ChatGPT-OAuth host back onto its identity.
      codexLbRegistered: registry.profiles['codex-lb'].enabled && registry.profiles['codex-lb'].state === 'ready',
    },
  );
  const policy = applyOfficialModelPassthrough(buildBridgeRoutingPolicy({
    route_index: build.route_index,
    catalog_generation: build.catalog.generation,
    default_provider_id: defaultProvider,
    changed_at: nowIso(options)
  }), { mode: officialModelsMode, changedAt: nowIso(options) });
  let settings: Awaited<ReturnType<typeof resolveDesktopBridgeActivationSettings>>;
  let managedBridgeBaseUrl: string;
  try {
    settings = await resolveDesktopBridgeActivationSettings({
      ...options,
      home: paths.home,
      providerRegistry: providerRegistrySnapshot(registry, build.route_index),
      routePolicy: policy
    });
    managedBridgeBaseUrl = await bridgeBaseUrl(settings, { ...options, home: paths.home });
  } catch (error: unknown) {
    const blocker = safeCode(error, 'desktop_bridge_client_capability_invalid');
    return {
      ok: false,
      build,
      activation: activationResult(staging, false, [blocker]),
      migration: null,
      active_generation_preserved: true
    };
  }
  const migration = await migrateDesktopBridgeConfig({
    home: paths.home,
    configPath: paths.configPath,
    authPath: paths.authPath,
    receiptDir: paths.receiptDir,
    bridgeBaseUrl: managedBridgeBaseUrl,
    combinedCatalogPath: staging.catalog_path,
    // Codex already reads the bridge's `/models`, or the user pinned a list of
    // their own: a sync keeps it that way.
    bindModelCatalog: !codexReadsBridgeModels(configText) && !hasUserOwnedModelCatalog(configText),
    configWrite: behavior.configWrites === false ? 'forbid' : 'allow',
    newCatalogGeneration: build.catalog.generation,
    metadataUpdates: [
      {
        kind: 'provider_registry',
        path: bridgeProviderRegistryPath(paths.home),
        text: serializeStoredBridgeProviderRegistry(storedRegistry)
      },
      { kind: 'catalog_binding', path: staging.pointer_path, text: staging.pointer_text },
      { kind: 'route_policy', path: paths.routePolicyPath, text: `${JSON.stringify(policy, null, 2)}\n` },
      { kind: 'bridge_settings', path: options.settingsPath || desktopBridgeServicePaths(paths.home).settings_path, text: serializedSettings(settings) }
    ]
  });
  if (!migration.ok) {
    return {
      ok: false,
      build,
      activation: activationResult(staging, false, migration.blockers),
      migration,
      active_generation_preserved: true
    };
  }
  const active = await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath);
  if (!active.ok
    || active.catalog.generation !== build.catalog.generation
    || active.route_index.generation !== build.route_index.generation) {
    const rollback = migration.receipt
      ? await rollbackDesktopBridgeUnificationReceipt({ receipt: migration.receipt })
      : null;
    return {
      ok: false,
      build,
      activation: activationResult(staging, false, ['combined_catalog_activation_verification_failed']),
      migration,
      rollback,
      active_generation_preserved: rollback?.ok === true
    };
  }
  if (behavior.onActivated) {
    try {
      await behavior.onActivated();
    } catch (error: unknown) {
      const rollback = migration.receipt
        ? await rollbackDesktopBridgeUnificationReceipt({ receipt: migration.receipt })
        : null;
      return {
        ok: false,
        build,
        activation: activationResult(staging, false, [safeCode(error, 'combined_catalog_commit_failed')]),
        migration,
        rollback,
        active_generation_preserved: rollback?.ok === true
      };
    }
  }
  const serviceBefore = await (options.serviceStatusImpl || desktopBridgeServiceStatus)({ ...options, home: paths.home });
  if (behavior.restartService !== false && (serviceBefore.installed || serviceBefore.running)) {
    await (options.bootstrapServiceImpl || bootstrapExistingDesktopBridgeService)({
      ...options,
      home: paths.home,
      providerRegistry: providerRegistrySnapshot(registry, build.route_index),
      routePolicy: policy
    });
  }
  return { ok: true, build, activation: activationResult(staging, true), migration };
}

function blockedSync(historicalIntent: unknown, blockers: readonly string[]): Record<string, unknown> {
  return {
    ok: false,
    historical_intent: historicalIntent,
    activation: {
      schema: 'sks.bridge-combined-catalog-activation.v1',
      activated: false,
      blockers
    },
    migration: null
  };
}

function activationResult(
  staging: CombinedCatalogStagingResult,
  activated: boolean,
  blockers: readonly string[] = staging.blockers
): Record<string, unknown> {
  return {
    schema: 'sks.bridge-combined-catalog-activation.v1',
    activated,
    generation: activated ? staging.generation : null,
    previous_generation: staging.previous_generation,
    catalog_path: activated ? staging.catalog_path : null,
    route_index_path: activated ? staging.route_index_path : null,
    pointer_path: staging.pointer_path,
    blockers: unique(blockers)
  };
}

async function fetchProviderCatalogs(
  registry: BridgeProviderRegistry,
  credentials: Record<BridgeProviderId, ResolvedProviderCredential>,
  paths: ControllerPaths,
  options: DesktopBridgeControllerV3Options
): Promise<Record<BridgeProviderId, ProviderCatalogBuildInput>> {
  const checkedAt = nowIso(options);
  const expiresAt = new Date(new Date(checkedAt).getTime() + COMBINED_BRIDGE_CATALOG_TTL_MS).toISOString();
  const rows = await Promise.all((['codex-lb', 'openrouter'] as const).map(async (providerId) => {
    const profile = registry.profiles[providerId];
    const credential = credentials[providerId];
    if (!profile.enabled) return [providerId, emptyProviderCatalog(providerId, 'not_started', checkedAt, [])] as const;
    if (!credential.secret) {
      return [providerId, emptyProviderCatalog(
        providerId,
        'failed',
        checkedAt,
        [`${providerCode(providerId)}_credential_missing`]
      )] as const;
    }
    if (providerId === 'codex-lb') {
      const loaded = await loadCodexLbEnv({
        home: paths.home,
        envPath: options.envPath || codexLbEnvPath(paths.home),
        metadataPath: options.metadataPath || codexLbMetadataPath(paths.home),
        processEnv: controllerEnv(options)
      });
      const result = await readCodexLbModelCatalog({
        loadedEnv: loaded,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.codexLbLookup ? { lookup: options.codexLbLookup } : {}),
        timeoutMs: timeoutMs(options),
        gatewayAuthTransport: profile.endpoint.auth_transport === 'x-codex-lb-api-key'
          ? 'x-codex-lb-api-key' : 'authorization-bearer'
      });
      await recordProviderCredentialValidation({
        provider_id: providerId,
        credential,
        state: result.ok ? 'ready' : validationFailureState(result.blockers),
        checked_at: checkedAt,
        blockers: result.blockers,
        home: paths.home,
        validationPath: paths.validationPath
      });
      // Feed the full upstream ModelInfo rows when the gateway returned them so
      // reasoning levels, service tiers, and tool mode survive into the catalog.
      const codexLbModels = result.model_rows.length > 0 ? result.model_rows : result.models;
      return [providerId, {
        provider_id: providerId,
        state: result.ok ? 'verified' : 'failed',
        generation: result.ok ? sha256Stable({ provider_id: providerId, models: codexLbModels }) : null,
        models: { models: codexLbModels },
        checked_at: checkedAt,
        expires_at: expiresAt,
        blockers: result.blockers,
        warnings: []
      } satisfies ProviderCatalogBuildInput] as const;
    }
    const result = await listOpenRouterModels({
      env: controllerEnv(options),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      timeoutMs: timeoutMs(options)
    });
    await recordProviderCredentialValidation({
      provider_id: providerId,
      credential,
      state: result.ok ? 'ready' : validationFailureState(result.blockers),
      checked_at: checkedAt,
      blockers: result.blockers,
      warnings: result.warnings,
      home: paths.home,
      validationPath: paths.validationPath
    });
    return [providerId, {
      provider_id: providerId,
      state: result.ok ? 'verified' : 'failed',
      generation: result.ok ? sha256Stable({ provider_id: providerId, models: result.models }) : null,
      models: result.models,
      checked_at: checkedAt,
      expires_at: expiresAt,
      blockers: result.blockers,
      warnings: result.warnings
    } satisfies ProviderCatalogBuildInput] as const;
  }));
  return Object.fromEntries(rows) as Record<BridgeProviderId, ProviderCatalogBuildInput>;
}

function emptyProviderCatalog(
  providerId: BridgeProviderId,
  state: ProviderCatalogBuildInput['state'],
  checkedAt: string,
  blockers: readonly string[]
): ProviderCatalogBuildInput {
  return {
    provider_id: providerId,
    state,
    generation: null,
    models: [],
    checked_at: checkedAt,
    expires_at: null,
    blockers,
    warnings: []
  };
}

/**
 * Providers whose list could not be fetched this time (network, server) while
 * the active catalog still routes their models: activating would drop every
 * one of them, so the last good catalog stays instead. A rejected or missing
 * credential is a real change and is not held back.
 */
function providersLostToFailedFetch(
  active: Awaited<ReturnType<typeof readActiveCombinedBridgeCatalog>>,
  catalogs: Record<BridgeProviderId, ProviderCatalogBuildInput>,
  registry: BridgeProviderRegistry
): BridgeProviderId[] {
  if (!active.ok) return [];
  return (['codex-lb', 'openrouter'] as const).filter((providerId) => {
    const blockers = catalogs[providerId].blockers || [];
    return registry.profiles[providerId].enabled
      && catalogs[providerId].state === 'failed'
      && !blockers.some(refusesCredential)
      && active.catalog.models.some((model) => model.provider_id === providerId);
  });
}

/**
 * The provider refused or lacks the credential (an outage is not that: an
 * OpenRouter 5xx surfaces as `openrouter_authentication_failed:…_provider_unavailable`).
 */
function refusesCredential(blocker: string): boolean {
  return /unauthorized|credential_missing|key_missing|invalid_key|_http_40[13]\b/.test(blocker);
}

function validationFailureState(blockers: readonly string[]): 'rejected' | 'unavailable' {
  return blockers.some((blocker) => /(?:401|403|auth|rejected|invalid_key|unauthorized)/i.test(blocker))
    ? 'rejected' : 'unavailable';
}

/** Read-only view of every OpenRouter model plus the operator's current picks. */
export async function listSelectableModels(
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  const paths = controllerPaths(options);
  const selection = (await readBridgeModelSelectionState(paths.home, nowIso(options))).selection;
  const available = await readText(bridgeAvailableModelsPath(paths.home), '');
  let rows: unknown[] = [];
  try {
    const parsed = available ? JSON.parse(available) : null;
    if (parsed && Array.isArray(parsed.openrouter)) rows = parsed.openrouter;
  } catch { rows = []; }
  const selected = new Set(selection.openrouter.public_ids);
  const status = await desktopBridgeStatusV3(options);
  return commandResult('models.list', true, status, {
    codex_lb_exposure: 'all',
    openrouter: {
      mode: 'selected',
      selected_count: selection.openrouter.public_ids.length,
      max_selected: MAX_SELECTED_OPENROUTER_MODELS,
      available_count: rows.length,
      models: rows.map((row: any) => ({
        public_id: String(row?.public_id || ''),
        display_name: String(row?.display_name || row?.public_id || ''),
        selected: selected.has(String(row?.public_id || ''))
      })).filter((row) => row.public_id)
    }
  }, rows.length === 0 ? ['bridge_available_models_unknown'] : [], options);
}

/**
 * Replaces the OpenRouter selection and rebuilds the active catalog. A changed
 * selection also restarts a running Codex App so its picker reads the new
 * catalog immediately; codex-lb models are never filtered.
 */
export async function selectExposedModels(
  publicIds: readonly string[],
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  const paths = controllerPaths(options);
  const before = await readBridgeModelSelectionState(paths.home, nowIso(options));
  const requested = [...new Set(publicIds.map((id) => String(id || '').trim()).filter(Boolean))].sort();
  if (requested.length > MAX_SELECTED_OPENROUTER_MODELS) {
    throw new Error('bridge_model_selection_limit_exceeded');
  }
  await writeBridgeModelSelection(paths.home, {
    schema: BRIDGE_MODEL_SELECTION_SCHEMA,
    updated_at: nowIso(options),
    openrouter: { mode: 'selected', public_ids: requested }
  });
  const sync = await syncAsRefresh(options, 'models.select');
  const status = await desktopBridgeStatusV3(options);
  const activation = sync.activation && typeof sync.activation === 'object'
    ? sync.activation as Record<string, unknown>
    : {};
  // Codex following the bridge's `/models` picks the new selection up by
  // itself; only a list it reads from a file needs Codex relaunched.
  const refresh = sync.model_refresh as ModelRefreshResult;
  const changed = before.selection.openrouter.public_ids.join('\0') !== requested.join('\0')
    && (refresh.codex_model_source !== 'bridge_models' || refresh.restart_codex_required);
  const restart = sync.ok === true
    ? await maybeRestartRunningCodexApp({
      env: controllerEnv(options),
      changed,
      noRestart: false,
      ...(options.platform ? { platform: options.platform } : {}),
      ...(options.codexAppRunningImpl ? { isRunningImpl: options.codexAppRunningImpl } : {}),
      ...(options.codexAppRestartImpl ? { restartImpl: options.codexAppRestartImpl } : {})
    })
    : null;
  const restartBlockers = codexRestartBlockers(restart);
  return commandResult(
    'models.select',
    sync.ok === true && restartBlockers.length === 0,
    status,
    { selected_count: requested.length, changed, catalog_sync: sync, codex_restart: restart },
    [...(sync.ok === true ? [] : stringArray(activation.blockers)), ...restartBlockers],
    options
  );
}

/** An OpenRouter public id always carries a vendor prefix (`vendor/model`). */
function seedSelectionFromConfiguredModel(
  selection: BridgeModelSelection,
  configText: string
): BridgeModelSelection {
  const configured = readTopLevelTomlString(configText, 'model');
  if (!configured || !configured.includes('/')) return selection;
  return { ...selection, openrouter: { mode: 'selected', public_ids: [configured] } };
}

export interface ModelRefreshInput {
  /** Who asked: `update`, `doctor`, `setup`, `cli`, a mutation's operation id … */
  reason: string;
  /** Fetch even when the same providers were refreshed under a minute ago. */
  force?: boolean;
  /** False for a read-only Doctor: SKS-owned files only, never config.toml. */
  allowConfigWrites: boolean;
  behavior?: Omit<CatalogSyncBehavior, 'configWrites'>;
}

export interface ModelRefreshResult {
  schema: 'sks.bridge-model-refresh.v1';
  ok: boolean;
  skipped: boolean;
  reason: string;
  generation: string | null;
  total: number;
  added: string[];
  removed: string[];
  codex_model_source: CodexModelSource | null;
  restart_codex_required: boolean;
  /** The one line every refresh reports, in text and in --json alike. */
  line: string;
  refreshed_at: string;
  warnings: string[];
  blockers: string[];
  /** The catalog sync the refresh ran; null when it was skipped. */
  sync: Record<string, unknown> | null;
}

/**
 * The one way the model list is refreshed: a live fetch of every provider's
 * list, a rebuild and an activation, then Codex pointed at a list it can
 * follow (model-refresh.ts). It never throws: a failure keeps the previous
 * list active and says which command retries it.
 */
export async function refreshModelCatalog(
  options: DesktopBridgeControllerV3Options,
  input: ModelRefreshInput
): Promise<ModelRefreshResult> {
  const paths = controllerPaths(options);
  const refreshedAt = nowIso(options);
  const base = {
    schema: 'sks.bridge-model-refresh.v1' as const,
    reason: input.reason,
    refreshed_at: refreshedAt,
    added: [] as string[],
    removed: [] as string[],
    restart_codex_required: false
  };
  try {
    const registryGeneration = (await resolveBridgeProviderRegistry({
      home: paths.home,
      credentials: await resolveRawCredentials(options, paths)
    })).generation;
    const recent = input.force ? null : await readModelRefreshState(paths.home);
    if (recent && refreshedRecently(recent, registryGeneration, Date.parse(refreshedAt))) {
      return {
        ...base, ok: true, skipped: true, generation: recent.generation, total: recent.total, codex_model_source: null,
        line: `Model list refreshed recently: ${recent.total} models generation ${recent.generation.slice(0, 8)}`,
        warnings: ['model_refresh_skipped_recent'], blockers: [], sync: null
      };
    }
    const before = await readActiveCombinedBridgeCatalog(paths.catalogPath, paths.routeIndexPath);
    const sync = await syncCatalogInternal(options, { ...(input.behavior || {}), configWrites: input.allowConfigWrites });
    if (sync.ok !== true) return refreshFailed(base, stringArray((sync.activation as Record<string, unknown> | undefined)?.blockers), sync);
    const build = sync.build as CombinedCatalogStagingInput;
    const activation = sync.activation as Record<string, unknown>;
    const diff = modelListDiff(listedModelSlugs(before.ok ? before.catalog : null), listedModelSlugs(build.catalog));
    const source = await alignCodexModelSource({
      home: paths.home,
      configPath: paths.configPath,
      authPath: paths.authPath,
      catalog: build.catalog,
      catalogPath: typeof activation.catalog_path === 'string' ? activation.catalog_path : null,
      allowConfigWrites: input.allowConfigWrites,
      selfCheck: options.modelsSelfCheckImpl || bridgeServesModels
    });
    // Codex reads `model_catalog_json` only at launch, so a changed list in
    // that file, or a switch to the bridge's list, needs one restart.
    const restart = source.changed || (source.source === 'model_catalog_json' && diff.added.length + diff.removed.length > 0);
    const total = listedModelSlugs(build.catalog).length;
    await writeModelRefreshState(paths.home, {
      refreshed_at: refreshedAt,
      provider_registry_generation: registryGeneration,
      generation: build.catalog.generation,
      total
    }).catch(() => undefined);
    return {
      ...base, ok: true, skipped: false, generation: build.catalog.generation, total, added: diff.added, removed: diff.removed,
      codex_model_source: source.source, restart_codex_required: restart,
      line: modelRefreshLine({ total, added: diff.added.length, removed: diff.removed.length, generation: build.catalog.generation, restartCodex: restart }),
      warnings: source.warnings, blockers: [], sync
    };
  } catch (error: unknown) {
    return refreshFailed(base, [safeCode(error, 'model_refresh_failed')], null);
  }
}

type CombinedCatalogStagingInput = Parameters<typeof stageCombinedBridgeCatalog>[0]['build'];

function refreshFailed(
  base: Pick<ModelRefreshResult, 'schema' | 'reason' | 'refreshed_at' | 'added' | 'removed' | 'restart_codex_required'>,
  blockers: readonly string[],
  sync: Record<string, unknown> | null
): ModelRefreshResult {
  return {
    ...base, ok: false, skipped: false, generation: null, total: 0, codex_model_source: null,
    line: `Model list refresh failed; the previous list stays active. Run \`${MODEL_REFRESH_RECOVERY_COMMAND}\` to retry.`,
    warnings: [`model_refresh_failed: run \`${MODEL_REFRESH_RECOVERY_COMMAND}\``],
    blockers: unique(blockers.length > 0 ? blockers : ['model_refresh_failed']),
    sync
  };
}

/** `sks bridge models refresh`: a forced refresh, reported as one line. */
export async function refreshModels(
  request: Extract<DesktopBridgeControllerRequestV3, { operation: 'models.refresh' }>,
  options: DesktopBridgeControllerV3Options
): Promise<DesktopBridgeCommandResult> {
  const refresh = await refreshModelCatalog(options, {
    reason: request.reason || 'cli',
    force: request.force !== false,
    allowConfigWrites: request.allow_config_writes !== false
  });
  const { sync, ...model_refresh } = refresh;
  const status = await desktopBridgeStatusV3(options);
  return commandResult('models.refresh', refresh.ok, status, { model_refresh, catalog_sync: sync }, refresh.blockers, options);
}

/**
 * A mutation's catalog sync, run as a forced model refresh: the sync result
 * its caller already reads (`ok`, `activation`), with the refresh summary
 * under `model_refresh`.
 */
export async function syncAsRefresh(
  options: DesktopBridgeControllerV3Options,
  reason: string,
  behavior: Omit<CatalogSyncBehavior, 'configWrites'> = {}
): Promise<Record<string, unknown>> {
  const { sync, ...model_refresh } = await refreshModelCatalog(options, { reason, force: true, allowConfigWrites: true, behavior });
  return {
    ...(sync ?? blockedSync(null, model_refresh.blockers)),
    model_refresh
  };
}
