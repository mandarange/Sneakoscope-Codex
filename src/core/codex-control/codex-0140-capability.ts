import path from 'node:path';
import { findCodexBinary } from '../codex-adapter.js';
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js';
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js';
import {
  CODEX_0140_FEATURE_KEYS,
  probeCodex0140FeatureDetails,
  probeCodex0140Features,
  type Codex0140FeatureKey,
  type Codex0140FeatureProbeDetails,
  type Codex0140FeatureProbeResults,
  type Codex0140ProbeCertainty
} from './codex-0140-feature-probes.js';

export type Codex0140FeatureCertainty =
  | 'actual'
  | 'discovered'
  | 'assumed_by_version'
  | 'fixture'
  | 'unverified'
  | 'failed';

export interface Codex0140FeatureState {
  supported: boolean;
  certainty: Codex0140FeatureCertainty;
  evidence: string[];
  blockers: string[];
}

export interface Codex0140Capability {
  schema: 'sks.codex-0140-capability.v1';
  generated_at: string;
  ok: boolean;
  codex_version: string | null;
  supports_0140: boolean;
  features: {
    usage_views: boolean;
    goal_attachment_preservation: boolean;
    session_delete: boolean;
    import_command: boolean;
    unified_mentions: boolean;
    bedrock_managed_auth: boolean;
    sqlite_auto_recovery: boolean;
    mcp_reliability: boolean;
    non_tty_interrupt: boolean;
    large_repo_responsiveness: boolean;
  };
  feature_states: Record<Codex0140FeatureKey, Codex0140FeatureState>;
  feature_certainty: Record<Codex0140FeatureKey, Codex0140FeatureCertainty>;
  blockers: string[];
  warnings: string[];
  codex_bin?: string | null;
  probe_mode?: 'version-only' | 'feature-probe';
  feature_probe_results?: Codex0140FeatureProbeResults;
  feature_probe_details?: Codex0140FeatureProbeDetails;
}

export async function detectCodex0140Capability(input: { codexBin?: string | null } = {}): Promise<Codex0140Capability> {
  const fake = process.env.SKS_CODEX_0140_FAKE === '1';
  const codexBin = fake ? input.codexBin || process.env.CODEX_BIN || 'codex' : input.codexBin || process.env.CODEX_BIN || await findCodexBinary();
  const versionText = fake ? String(process.env.SKS_CODEX_VERSION_FAKE || 'codex-cli 0.140.0') : await readCodexVersionText(codexBin);
  const parsed = parseCodexVersionText(versionText);
  const supports0140 = Boolean(parsed && compareSemverLike(parsed, '0.140.0') >= 0);
  const probeMode = process.env.SKS_CODEX_0140_PROBE === '1' ? 'feature-probe' : 'version-only';
  const probeTimeoutMs = Number(process.env.SKS_CODEX_0140_PROBE_TIMEOUT_MS || 3000);
  const probeDetails = probeMode === 'feature-probe'
    ? await probeCodex0140FeatureDetails(codexBin, { fake, timeoutMs: probeTimeoutMs })
    : null;
  const probeResults = probeDetails
    ? Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, probeDetails[key].status])) as Codex0140FeatureProbeResults
    : Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, 'skipped'])) as Codex0140FeatureProbeResults;
  const featureStates = Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, featureStateFor(key, supports0140, probeMode, probeDetails)])) as Record<Codex0140FeatureKey, Codex0140FeatureState>;
  const featureCertainty = Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((key) => [key, featureStates[key].certainty])) as Record<Codex0140FeatureKey, Codex0140FeatureCertainty>;
  const featureOk = (key: keyof Codex0140Capability['features']) => featureStates[key].supported;
  const features = {
    usage_views: featureOk('usage_views'),
    goal_attachment_preservation: featureOk('goal_attachment_preservation'),
    session_delete: featureOk('session_delete'),
    import_command: featureOk('import_command'),
    unified_mentions: featureOk('unified_mentions'),
    bedrock_managed_auth: featureOk('bedrock_managed_auth'),
    sqlite_auto_recovery: featureOk('sqlite_auto_recovery'),
    mcp_reliability: featureOk('mcp_reliability'),
    non_tty_interrupt: featureOk('non_tty_interrupt'),
    large_repo_responsiveness: featureOk('large_repo_responsiveness')
  };
  const failed = Object.entries(featureStates).flatMap(([key, state]) => state.certainty === 'failed' ? [`codex_0140_${key}_probe_failed`] : []);
  const assumedWarnings = Object.entries(featureStates)
    .filter(([, state]) => state.certainty === 'assumed_by_version')
    .map(([key]) => `codex_0140_${key}_assumed_by_version`);
  const unverifiedWarnings = Object.entries(featureStates)
    .filter(([, state]) => state.certainty === 'unverified')
    .map(([key]) => `codex_0140_${key}_unverified`);
  const blockers = [
    ...(!codexBin ? ['codex_cli_missing'] : []),
    ...(supports0140 ? [] : ['codex_0_140_required_for_0140_features']),
    ...(probeMode === 'feature-probe' ? failed : [])
  ];
  const report: Codex0140Capability = {
    schema: 'sks.codex-0140-capability.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    codex_version: parsed,
    supports_0140: supports0140,
    features,
    feature_states: featureStates,
    feature_certainty: featureCertainty,
    blockers,
    warnings: [...assumedWarnings, ...unverifiedWarnings],
    codex_bin: codexBin || null,
    probe_mode: probeMode,
    feature_probe_results: probeResults
  };
  if (probeDetails) report.feature_probe_details = probeDetails;
  return report;
}

function featureStateFor(
  key: Codex0140FeatureKey,
  supports0140: boolean,
  probeMode: 'version-only' | 'feature-probe',
  probeDetails: Codex0140FeatureProbeDetails | null
): Codex0140FeatureState {
  if (!supports0140) {
    return {
      supported: false,
      certainty: 'failed',
      evidence: [],
      blockers: ['codex_0_140_required_for_0140_features']
    };
  }
  if (probeMode === 'version-only') {
    return {
      supported: true,
      certainty: 'assumed_by_version',
      evidence: ['codex_version>=0.140.0'],
      blockers: []
    };
  }
  const detail = probeDetails?.[key];
  if (!detail) {
    return {
      supported: false,
      certainty: 'unverified',
      evidence: [],
      blockers: [`codex_0140_${key}_probe_missing`]
    };
  }
  if (detail.status === 'failed') {
    return {
      supported: false,
      certainty: 'failed',
      evidence: detail.evidence,
      blockers: detail.blockers.length ? detail.blockers : [`codex_0140_${key}_probe_failed`]
    };
  }
  const certainty = normalizeCertainty(detail.certainty);
  const supported = detail.status === 'passed' || detail.status === 'discovered';
  return {
    supported,
    certainty: supported ? certainty : 'unverified',
    evidence: detail.evidence,
    blockers: supported ? [] : detail.blockers
  };
}

function normalizeCertainty(certainty: Codex0140ProbeCertainty): Codex0140FeatureCertainty {
  if (certainty === 'actual' || certainty === 'discovered' || certainty === 'fixture' || certainty === 'assumed_by_version') return certainty;
  return 'unverified';
}

export async function writeCodex0140CapabilityArtifacts(root: string, input: { missionId?: string | null; codexBin?: string | null } = {}) {
  const report = await detectCodex0140Capability({ codexBin: input.codexBin || null });
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-0140-capability.json');
  await writeJsonAtomic(rootArtifact, report);
  let missionArtifact: string | null = null;
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-0140-capability.json');
    await writeJsonAtomic(missionArtifact, report);
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact };
}

async function readCodexVersionText(codexBin: string | null): Promise<string | null> {
  if (!codexBin) return null;
  const result = await runProcess(codexBin, ['--version'], { timeoutMs: 10_000, maxOutputBytes: 16 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }));
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return result.code === 0 ? text : text || null;
}
