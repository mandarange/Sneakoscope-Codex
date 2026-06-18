import path from 'node:path';
import { findCodexBinary } from '../codex-adapter.js';
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js';
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js';

export const CODEX_0141_FEATURE_KEYS = [
  'noise_relay_delegated',
  'native_cwd_shell_path_preserved',
  'permission_paths_preserved',
  'selected_plugin_mcp_per_thread',
  'auth_curated_marketplaces',
  'child_threads_api',
  'external_agent_import_results',
  'rate_limit_reset_credits',
  'realtime_startup_context_control',
  'tui_prompt_auto_resolve',
  'hook_trust_resume_persistence',
  'post_tool_use_blocking_respected',
  'plugin_app_mcp_dedupe',
  'windows_sandbox_repairs_delegated',
  'idle_exec_relay_keepalive',
  'wait_agent_interrupt_native',
  'sqlite_wal_reset_fix_delegated',
  'tls_p521_native',
  'tool_heavy_copy_reduction',
  'prompt_image_cache_bound_64_mib',
  'feedback_upload_bound_8_threads',
  'terminal_resize_reflow_always'
] as const;

export type Codex0141FeatureKey = typeof CODEX_0141_FEATURE_KEYS[number];

export interface Codex0141FeatureState {
  readonly supported: boolean;
  readonly certainty: 'assumed_by_version' | 'failed';
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
  readonly sks_policy: 'delegate' | 'dedupe' | 'bound' | 'respect';
}

export interface Codex0141Capability {
  readonly schema: 'sks.codex-0141-capability.v1';
  readonly generated_at: string;
  readonly ok: boolean;
  readonly codex_version: string | null;
  readonly supports_0141: boolean;
  readonly feature_states: Record<Codex0141FeatureKey, Codex0141FeatureState>;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly codex_bin?: string | null;
  readonly release_source: 'https://github.com/openai/codex/releases/tag/rust-v0.141.0';
}

export async function detectCodex0141Capability(input: {
  readonly codexBin?: string | null;
} = {}): Promise<Codex0141Capability> {
  const fake = process.env.SKS_CODEX_0141_FAKE === '1';
  const codexBin = fake ? input.codexBin || process.env.CODEX_BIN || 'codex' : input.codexBin || process.env.CODEX_BIN || await findCodexBinary();
  const versionText = fake ? String(process.env.SKS_CODEX_VERSION_FAKE || 'codex-cli 0.141.0') : await readCodexVersionText(codexBin);
  const parsed = parseCodexVersionText(versionText);
  const supports0141 = Boolean(parsed && compareSemverLike(parsed, '0.141.0') >= 0);
  const featureStates = Object.fromEntries(
    CODEX_0141_FEATURE_KEYS.map((key) => [key, featureStateFor(key, supports0141)])
  ) as Record<Codex0141FeatureKey, Codex0141FeatureState>;
  const blockers = [
    ...(!codexBin ? ['codex_cli_missing'] : []),
    ...(supports0141 ? [] : ['codex_0_141_required_for_0141_features'])
  ];
  return {
    schema: 'sks.codex-0141-capability.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    codex_version: parsed,
    supports_0141: supports0141,
    feature_states: featureStates,
    blockers,
    warnings: supports0141
      ? CODEX_0141_FEATURE_KEYS.map((key) => `codex_0141_${key}_assumed_by_version`)
      : [],
    codex_bin: codexBin || null,
    release_source: 'https://github.com/openai/codex/releases/tag/rust-v0.141.0'
  };
}

export async function writeCodex0141CapabilityArtifacts(
  root: string,
  input: { readonly missionId?: string | null; readonly codexBin?: string | null } = {}
) {
  const report = await detectCodex0141Capability({ codexBin: input.codexBin || null });
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-0141-capability.json');
  await writeJsonAtomic(rootArtifact, report);
  let missionArtifact: string | null = null;
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-0141-capability.json');
    await writeJsonAtomic(missionArtifact, report);
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact };
}

function featureStateFor(key: Codex0141FeatureKey, supports0141: boolean): Codex0141FeatureState {
  return {
    supported: supports0141,
    certainty: supports0141 ? 'assumed_by_version' : 'failed',
    evidence: supports0141 ? ['codex_version>=0.141.0', `release:rust-v0.141.0:${key}`] : [],
    blockers: supports0141 ? [] : ['codex_0_141_required_for_0141_features'],
    sks_policy: sksPolicyFor(key)
  };
}

function sksPolicyFor(key: Codex0141FeatureKey): Codex0141FeatureState['sks_policy'] {
  if (key.includes('dedupe')) return 'dedupe';
  if (key.includes('bound') || key.includes('cache') || key.includes('feedback')) return 'bound';
  if (key.includes('blocking') || key.includes('trust')) return 'respect';
  return 'delegate';
}

async function readCodexVersionText(codexBin: string | null): Promise<string | null> {
  if (!codexBin) return null;
  const result = await runProcess(codexBin, ['--version'], { timeoutMs: 10_000, maxOutputBytes: 16 * 1024 }).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err)
  }));
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return result.code === 0 ? text : text || null;
}
