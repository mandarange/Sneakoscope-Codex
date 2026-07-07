import path from 'node:path';
import { detectCodexWebSearchCapability } from '../codex/codex-web-search-adapter.js';
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js';
import type { NativeCapabilityId } from '../codex-native/native-capability-repair-matrix.js';

export const PROVIDER_SELF_HEAL_SCHEMA = 'sks.provider-self-heal.v1';

export type ProviderCapabilityId =
  | 'super_search_codex_web'
  | 'image_generation'
  | 'browser_use'
  | 'computer_use';

export interface ProviderSelfHealStep {
  id: string;
  attempted: boolean;
  ok: boolean;
  action: string;
  blocker: string | null;
}

export interface ProviderSelfHealReport {
  schema: typeof PROVIDER_SELF_HEAL_SCHEMA;
  generated_at: string;
  ok: boolean;
  capability: ProviderCapabilityId;
  apply: boolean;
  attempted: boolean;
  recovered: boolean;
  manual_required: boolean;
  before: unknown;
  after: unknown;
  repair_actions: string[];
  manual_actions: string[];
  steps: ProviderSelfHealStep[];
  blockers: string[];
  warnings: string[];
  report_path: string;
}

export async function ensureProviderCapability(input: {
  root?: string;
  capability: ProviderCapabilityId;
  apply?: boolean;
  env?: NodeJS.ProcessEnv;
  reportPath?: string | null;
  fixture?: 'all-repairable' | 'manual-required' | false;
}): Promise<ProviderSelfHealReport> {
  const root = path.resolve(input.root || process.cwd());
  if (input.capability === 'super_search_codex_web') return ensureSuperSearchCodexWeb(input, root);
  return ensureNativeProviderCapability(input, root);
}

export async function ensureProviderCapabilities(input: {
  root?: string;
  capabilities: ProviderCapabilityId[];
  apply?: boolean;
  env?: NodeJS.ProcessEnv;
  reportDir?: string | null;
  fixture?: 'all-repairable' | 'manual-required' | false;
}): Promise<ProviderSelfHealReport[]> {
  const root = path.resolve(input.root || process.cwd());
  const reportDir = input.reportDir === null
    ? null
    : input.reportDir || path.join(root, '.sneakoscope', 'reports', 'provider-self-heal');
  const reports: ProviderSelfHealReport[] = [];
  for (const capability of input.capabilities) {
    reports.push(await ensureProviderCapability({
      root,
      capability,
      fixture: input.fixture || false,
      reportPath: reportDir ? path.join(reportDir, `${capability}.json`) : null,
      ...(input.apply === undefined ? {} : { apply: input.apply }),
      ...(input.env ? { env: input.env } : {})
    }));
  }
  return reports;
}

async function ensureSuperSearchCodexWeb(
  input: Parameters<typeof ensureProviderCapability>[0],
  root: string
): Promise<ProviderSelfHealReport> {
  const env = input.env || process.env;
  const before = detectCodexWebSearchCapability({ env });
  const repairActions = before.available
    ? ['postcheck-codex-web-search-provider']
    : ['detect-codex-web-search-binding'];
  const manualActions = before.available ? [] : [
    'Bind a real Codex web search adapter in the host runtime, then rerun Super-Search.',
    'Set SKS_CODEX_WEB_SEARCH_AVAILABLE=1 only when a real Codex web search provider is attached.',
    'For known URLs, use `sks super-search fetch <url> --json` so direct URL acquisition can collect source-backed evidence without a web-search provider.'
  ];
  const after = detectCodexWebSearchCapability({ env });
  const recovered = after.available === true;
  const blockers = recovered ? [] : ['codex_web_search_provider_unavailable'];
  const warnings = recovered ? [] : ['provider_self_heal_manual_binding_required'];
  return writeReport(root, input, {
    ok: recovered,
    capability: 'super_search_codex_web',
    attempted: before.available !== true,
    recovered,
    manual_required: !recovered,
    before,
    after,
    repair_actions: repairActions,
    manual_actions: manualActions,
    steps: [
      {
        id: 'codex_web_search_detect',
        attempted: true,
        ok: before.available === true,
        action: 'detect Codex web search host binding',
        blocker: before.available ? null : String(before.reason || 'codex_web_search_not_bound_or_unverified')
      },
      {
        id: 'codex_web_search_auto_bind',
        attempted: false,
        ok: recovered,
        action: 'auto-bind Codex web search provider',
        blocker: recovered ? null : 'host_tool_binding_required'
      }
    ],
    blockers,
    warnings
  });
}

async function ensureNativeProviderCapability(
  input: Parameters<typeof ensureProviderCapability>[0],
  root: string
): Promise<ProviderSelfHealReport> {
  const capabilityMap = nativeCapabilityMap(input.capability);
  const { repairNativeCapabilities } = await import('../codex-native/native-capability-repair.js');
  const before = await repairNativeCapabilities({
    root,
    fix: false,
    yes: true,
    capabilities: capabilityMap,
    fixture: input.fixture || false
  });
  const after = await repairNativeCapabilities({
    root,
    fix: input.apply === true,
    yes: true,
    capabilities: capabilityMap,
    fixture: input.fixture || false
  });
  const recovered = after.capabilities.every((state) => state.after === 'verified' || state.availability === 'verified');
  const manualActions = after.capabilities.flatMap((state) => state.manual_actions || []);
  const repairActions = after.capabilities.flatMap((state) => state.repair_actions || []);
  const blockers = recovered ? [] : [
    ...new Set(after.capabilities.flatMap((state) => [
      ...(state.core_blockers || []),
      ...(state.blockers || []),
      ...Object.values(state.route_blockers || {}).flat()
    ]))
  ];
  const warnings = [...new Set(after.warnings || [])];
  return writeReport(root, input, {
    ok: recovered,
    capability: input.capability,
    attempted: before.ok !== true || input.apply === true,
    recovered,
    manual_required: manualActions.length > 0 && !recovered,
    before,
    after,
    repair_actions: [...new Set(repairActions)],
    manual_actions: [...new Set(manualActions)],
    steps: after.capabilities.map((state) => ({
      id: state.id,
      attempted: state.repairability === 'doctor-fix' || input.apply === true,
      ok: state.after === 'verified' || state.availability === 'verified',
      action: state.repair_actions.join(', ') || `postcheck-${state.id}`,
      blocker: state.after === 'verified' || state.availability === 'verified'
        ? null
        : [...(state.blockers || []), ...Object.values(state.route_blockers || {}).flat()][0] || 'provider_capability_unverified'
    })),
    blockers,
    warnings
  });
}

function nativeCapabilityMap(capability: ProviderCapabilityId): NativeCapabilityId[] {
  if (capability === 'image_generation') {
    return ['image_generation', 'image_followup_edit', 'image_path_exposure', 'saved_artifact_path_contract'];
  }
  if (capability === 'browser_use') {
    return ['chrome_web_review', 'codex_app_screenshot', 'app_handoff'];
  }
  if (capability === 'computer_use') {
    return ['computer_use', 'codex_app_screenshot'];
  }
  return [];
}

async function writeReport(
  root: string,
  input: Parameters<typeof ensureProviderCapability>[0],
  body: Omit<ProviderSelfHealReport, 'schema' | 'generated_at' | 'apply' | 'report_path'>
): Promise<ProviderSelfHealReport> {
  const reportPath = input.reportPath === null
    ? path.join(root, '.sneakoscope', 'reports', 'provider-self-heal', `${body.capability}.json`)
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'provider-self-heal', `${body.capability}.json`);
  const report: ProviderSelfHealReport = {
    schema: PROVIDER_SELF_HEAL_SCHEMA,
    generated_at: nowIso(),
    apply: input.apply === true,
    report_path: reportPath,
    ...body
  };
  await ensureDir(path.dirname(reportPath));
  await writeJsonAtomic(reportPath, report);
  return report;
}
