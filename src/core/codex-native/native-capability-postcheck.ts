import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, readJson, writeJsonAtomic } from '../fsx.js';
import { buildNativeCapabilityRepairMatrix, type NativeCapabilityRepairMatrix, type NativeCapabilityRepairState } from './native-capability-repair-matrix.js';

type FixtureMode = 'all-repairable' | 'manual-required' | false;

export async function postcheckNativeCapabilities(input: {
  root: string;
  matrix?: NativeCapabilityRepairMatrix | null;
  fixture?: FixtureMode;
  reportPath?: string | null;
}): Promise<NativeCapabilityRepairMatrix> {
  const root = path.resolve(input.root);
  const fixture = input.fixture || false;
  const matrix = input.matrix || await buildNativeCapabilityRepairMatrix({ root, fixture, reportPath: null });
  const capabilities = await Promise.all(matrix.capabilities.map((state) => postcheckCapability(root, state, fixture)));
  const coreBlockers = capabilities.flatMap((state) => state.core_blockers || []);
  const routeBlockers = mergeRouteBlockers(capabilities);
  const checked: NativeCapabilityRepairMatrix = {
    ...matrix,
    generated_at: new Date().toISOString(),
    ok: coreBlockers.length === 0,
    capabilities,
    core_blockers: coreBlockers,
    route_blockers: routeBlockers,
    optional_manual_required: capabilities
      .filter((state) => state.availability === 'manual-required' && state.after !== 'verified')
      .map((state) => state.id),
    blockers: coreBlockers,
    warnings: capabilities.flatMap((state) => state.warnings)
  };
  const reportPath = input.reportPath === null
    ? null
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'native-capability-postcheck.json');
  if (reportPath) await writeJsonAtomic(reportPath, checked).catch(() => undefined);
  return checked;
}

async function postcheckCapability(root: string, state: NativeCapabilityRepairState, fixture: FixtureMode): Promise<NativeCapabilityRepairState> {
  if (state.id === 'image_generation') return postcheckImageGeneration(state, fixture);
  if (state.id === 'image_followup_edit') return postcheckImageFollowupEdit(root, state);
  if (state.id === 'computer_use') return postcheckComputerUse(state, fixture);
  if (state.id === 'chrome_web_review') return postcheckChromeWebReview(state, fixture);
  if (state.id === 'codex_app_screenshot') return postcheckAppScreenshot(root, state);
  if (state.id === 'app_handoff') return postcheckAppHandoff(state, fixture);
  if (state.id === 'image_path_exposure') return postcheckImagePathExposure(root, state, fixture);
  if (state.id === 'saved_artifact_path_contract') return postcheckSavedArtifactPathContract(root, state);
  return { ...state, after: 'blocked', blockers: [...state.blockers, `unknown_capability:${state.id}`] };
}

function postcheckImageGeneration(state: NativeCapabilityRepairState, fixture: FixtureMode): NativeCapabilityRepairState {
  if (fixture === 'all-repairable' || state.before === 'verified') return verified(state);
  return {
    ...state,
    after: 'unknown',
    core_blockers: [],
    route_blockers: mergeStateRouteBlockers(state, 'route-image', ['imagegen_auth_or_codex_app_builtin_missing']),
    blockers: [],
    warnings: [...new Set([...state.warnings, 'image_generation_not_verified_without_real_capability'])]
  };
}

async function postcheckImageFollowupEdit(root: string, state: NativeCapabilityRepairState): Promise<NativeCapabilityRepairState> {
  const contract = await validateSavedArtifactPathContract(root);
  if (!contract.ok) return routeBlocked(state, 'route-image', contract.blockers);
  const sample = path.join(contract.imageArtifacts, 'postcheck-followup-sample.txt');
  if (!(await writeReadSample(sample))) return routeBlocked(state, 'route-image', ['image_followup_sample_artifact_unwritable']);
  return verified(state);
}

function postcheckComputerUse(state: NativeCapabilityRepairState, _fixture: FixtureMode): NativeCapabilityRepairState {
  if (syntheticNativeVerificationAllowed(_fixture) && process.env.SKS_COMPUTER_USE_CAPABILITY === 'verified') return verified(state);
  return {
    ...state,
    after: 'unknown',
    core_blockers: [],
    route_blockers: mergeStateRouteBlockers(state, 'route-computer-use', ['computer_use_os_permission_or_capability_unknown']),
    blockers: [],
    warnings: [...new Set([...state.warnings, 'manual_os_permission_required'])]
  };
}

function postcheckChromeWebReview(state: NativeCapabilityRepairState, fixture: FixtureMode): NativeCapabilityRepairState {
  if (fixture === 'all-repairable' || (syntheticNativeVerificationAllowed(fixture) && process.env.SKS_CHROME_EXTENSION_READY === '1')) return verified(state);
  return {
    ...state,
    after: 'unknown',
    core_blockers: [],
    route_blockers: mergeStateRouteBlockers(state, 'route-chrome-web-review', ['codex_chrome_extension_readiness_not_verified']),
    blockers: [],
    warnings: [...new Set([...state.warnings, 'manual_chrome_extension_setup_required'])]
  };
}

function syntheticNativeVerificationAllowed(fixture: FixtureMode): boolean {
  return fixture === 'all-repairable' || process.env.SKS_NATIVE_CAPABILITY_FIXTURE === '1' || process.env.NODE_ENV === 'test';
}

async function postcheckAppScreenshot(root: string, state: NativeCapabilityRepairState): Promise<NativeCapabilityRepairState> {
  const dir = path.join(root, '.sneakoscope', 'app-screenshots');
  const registry = path.join(dir, 'screenshot-registry.json');
  if (!(await writeReadSample(path.join(dir, 'postcheck-screenshot-sample.txt')))) {
    return routeBlocked(state, 'route-image', ['app_screenshot_directory_unwritable']);
  }
  await writeJsonAtomic(registry, { schema: 'sks.app-screenshot-registry.v1', generated_at: new Date().toISOString(), screenshots: [] }).catch(() => undefined);
  const json = await readJson(registry, {}).catch(() => ({})) as { schema?: string };
  if (json.schema !== 'sks.app-screenshot-registry.v1') return routeBlocked(state, 'route-image', ['app_screenshot_registry_invalid']);
  return verified(state);
}

function postcheckAppHandoff(state: NativeCapabilityRepairState, fixture: FixtureMode): NativeCapabilityRepairState {
  if (fixture === 'all-repairable' || state.before === 'verified') return verified(state);
  return {
    ...state,
    after: 'unknown',
    core_blockers: [],
    route_blockers: mergeStateRouteBlockers(state, 'route-app-handoff', ['codex_app_handoff_not_verified']),
    blockers: [],
    warnings: [...new Set([...state.warnings, 'manual_app_handoff_approval_required'])]
  };
}

async function postcheckImagePathExposure(root: string, state: NativeCapabilityRepairState, fixture: FixtureMode): Promise<NativeCapabilityRepairState> {
  if (fixture === 'all-repairable' || state.before === 'verified') return verified(state);
  const contract = await validateSavedArtifactPathContract(root);
  if (contract.ok) {
    return {
      ...state,
      after: 'degraded',
      availability: 'available-unverified',
      core_blockers: [],
      route_blockers: {},
      blockers: [],
      warnings: [...new Set([...state.warnings, 'using_saved_artifact_path_contract_fallback'])]
    };
  }
  return routeBlocked(state, 'route-image', ['image_path_exposure_missing_without_fallback_contract', ...contract.blockers]);
}

async function postcheckSavedArtifactPathContract(root: string, state: NativeCapabilityRepairState): Promise<NativeCapabilityRepairState> {
  const contract = await validateSavedArtifactPathContract(root);
  if (!contract.ok) return routeBlocked(state, 'route-image', contract.blockers);
  if (!(await writeReadSample(path.join(contract.imageArtifacts, 'postcheck-contract-image.txt')))) return routeBlocked(state, 'route-image', ['image_artifacts_directory_unwritable']);
  if (!(await writeReadSample(path.join(contract.appScreenshots, 'postcheck-contract-screenshot.txt')))) return routeBlocked(state, 'route-image', ['app_screenshots_directory_unwritable']);
  return verified(state);
}

function verified(state: NativeCapabilityRepairState): NativeCapabilityRepairState {
  return { ...state, after: 'verified', availability: 'verified', core_blockers: [], route_blockers: {}, blockers: [] };
}

function routeBlocked(state: NativeCapabilityRepairState, scope: keyof NativeCapabilityRepairState['route_blockers'], blockers: string[]): NativeCapabilityRepairState {
  return {
    ...state,
    after: 'blocked',
    core_blockers: [],
    route_blockers: mergeStateRouteBlockers(state, scope, blockers),
    blockers: []
  };
}

function mergeStateRouteBlockers(state: NativeCapabilityRepairState, scope: keyof NativeCapabilityRepairState['route_blockers'], blockers: string[]) {
  return {
    ...(state.route_blockers || {}),
    [scope]: [...new Set([...(state.route_blockers?.[scope] || []), ...blockers])]
  };
}

function mergeRouteBlockers(states: NativeCapabilityRepairState[]) {
  const merged: NativeCapabilityRepairMatrix['route_blockers'] = {};
  for (const state of states) {
    for (const [scope, blockers] of Object.entries(state.route_blockers || {})) {
      merged[scope as keyof NativeCapabilityRepairMatrix['route_blockers']] = [
        ...new Set([...(merged[scope as keyof NativeCapabilityRepairMatrix['route_blockers']] || []), ...blockers])
      ];
    }
  }
  return merged;
}

async function validateSavedArtifactPathContract(root: string): Promise<{ ok: boolean; imageArtifacts: string; appScreenshots: string; blockers: string[] }> {
  const contractPath = path.join(root, '.sneakoscope', 'reports', 'saved-artifact-path-contract.json');
  const contract = await readJson(contractPath, null).catch(() => null) as { schema?: string; image_artifacts?: string; app_screenshots?: string } | null;
  const imageArtifacts = String(contract?.image_artifacts || path.join(root, '.sneakoscope', 'image-artifacts'));
  const appScreenshots = String(contract?.app_screenshots || path.join(root, '.sneakoscope', 'app-screenshots'));
  const blockers: string[] = [];
  if (contract?.schema !== 'sks.saved-artifact-path-contract.v1') blockers.push('saved_artifact_path_contract_schema_invalid');
  for (const dir of [imageArtifacts, appScreenshots]) {
    try {
      await ensureDir(dir);
      await fs.access(dir);
    } catch {
      blockers.push(`directory_unwritable:${path.basename(dir)}`);
    }
  }
  return { ok: blockers.length === 0, imageArtifacts, appScreenshots, blockers };
}

async function writeReadSample(file: string): Promise<boolean> {
  try {
    await ensureDir(path.dirname(file));
    await fs.writeFile(file, 'sks-native-capability-postcheck\n', 'utf8');
    const text = await fs.readFile(file, 'utf8');
    return text === 'sks-native-capability-postcheck\n';
  } catch {
    return false;
  }
}
