import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CURRENT_CODEX_RELEASE_MANIFEST } from '../codex-compat/codex-release-manifest.js';
import { compareSemverLike } from '../codex-compat/codex-version-policy.js';
import { ensureDir, nowIso, runProcess, sha256, writeJsonAtomic } from '../fsx.js';
import { resolveCodexRuntime, type CodexRuntimeIdentity } from '../codex-runtime/resolve-codex-runtime.js';

export type Codex0142Certainty = 'actual' | 'discovered' | 'hermetic_fixture' | 'network_verified' | 'unverified' | 'failed';

export const CODEX_0142_FEATURE_KEYS = [
  'runtime_identity',
  'protocol_schema_generation',
  'multi_agent_mode_schema',
  'rollout_budget_schema',
  'indexed_web_search_schema',
  'current_time_read_schema',
  'native_thread_list_search_schema',
  'plugin_catalog_refresh_schema',
  'terminal_subagent_error_schema',
  'exec_mcp_reconnect_schema',
  'remote_native_environment_schema',
  'app_server_overload_schema'
] as const;

export type Codex0142FeatureKey = typeof CODEX_0142_FEATURE_KEYS[number];

export interface Codex0142FeatureState {
  readonly supported: boolean;
  readonly certainty: Codex0142Certainty;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface Codex0142Capability {
  readonly schema: 'sks.codex-0142-capability.v1';
  readonly generated_at: string;
  readonly ok: boolean;
  readonly release_authorizing: boolean;
  readonly target_tag: string;
  readonly required_version: string;
  readonly runtime_identity: CodexRuntimeIdentity | null;
  readonly generated_schema_sha256: string | null;
  readonly manifest_schema_sha256: string;
  readonly probe_mode: 'real-schema' | 'hermetic-fixture' | 'blocked';
  readonly feature_states: Record<Codex0142FeatureKey, Codex0142FeatureState>;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export async function detectCodex0142Capability(input: {
  readonly codexBin?: string | null;
  readonly root?: string;
  readonly requireReal?: boolean;
} = {}): Promise<Codex0142Capability> {
  if (process.env.SKS_CODEX_0142_FAKE === '1') return fakeCapability();
  const root = input.root || process.cwd();
  const runtime = await resolveCodexRuntime({
    explicitPath: input.codexBin || null,
    requestedBy: 'codex-0142-capability'
  });
  if (!runtime.identity) {
    return blockedCapability('blocked', null, null, [...runtime.blockers]);
  }
  const versionOk = compareSemverLike(runtime.identity.version, CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion) >= 0;
  const schemaProbe = await generateSchemaProbe(root, runtime.identity.realpath);
  const appServerClientText = await fsp.readFile(path.join(root, 'src', 'core', 'codex-control', 'codex-app-server-v2-client.ts'), 'utf8').catch(() => '');
  const states = featureStatesFromSchema(schemaProbe.text, schemaProbe.ok, appServerClientText);
  const blockers = [
    ...(versionOk ? [] : ['codex_0_142_required']),
    ...(schemaProbe.ok ? [] : ['codex_0142_schema_generation_failed']),
    ...Object.values(states).flatMap((state) => state.blockers)
  ];
  const realEnough = blockers.length === 0
    && schemaProbe.sha256 !== null
    && CURRENT_CODEX_RELEASE_MANIFEST.generatedSchemaSha256 !== 'pending-generated-schema'
    && schemaProbe.sha256 === CURRENT_CODEX_RELEASE_MANIFEST.generatedSchemaSha256
    && Object.values(states).every((state) => state.certainty === 'actual' || state.certainty === 'discovered');
  return {
    schema: 'sks.codex-0142-capability.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    release_authorizing: realEnough,
    target_tag: CURRENT_CODEX_RELEASE_MANIFEST.targetTag,
    required_version: CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion,
    runtime_identity: runtime.identity,
    generated_schema_sha256: schemaProbe.sha256,
    manifest_schema_sha256: CURRENT_CODEX_RELEASE_MANIFEST.generatedSchemaSha256,
    probe_mode: schemaProbe.ok ? 'real-schema' : 'blocked',
    feature_states: states,
    blockers,
    warnings: [
      ...(realEnough ? [] : ['codex_0142_not_release_authorizing_until_schema_hash_and_all_required_real_probes_match']),
      ...(input.requireReal && blockers.length ? ['required_real_probe_blocked'] : [])
    ]
  };
}

export async function writeCodex0142CapabilityArtifacts(
  root: string,
  input: { readonly missionId?: string | null; readonly codexBin?: string | null; readonly requireReal?: boolean } = {}
) {
  const probeInput: { root: string; codexBin?: string | null; requireReal?: boolean } = { root };
  if (input.codexBin !== undefined) probeInput.codexBin = input.codexBin || null;
  if (input.requireReal !== undefined) probeInput.requireReal = input.requireReal;
  const report = await detectCodex0142Capability(probeInput);
  const rootArtifact = path.join(root, '.sneakoscope', 'codex', 'codex-0142-capability.json');
  await writeJsonAtomic(rootArtifact, report);
  let missionArtifact: string | null = null;
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-0142-capability.json');
    await writeJsonAtomic(missionArtifact, report);
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact };
}

function featureStatesFromSchema(schemaText: string, schemaOk: boolean, appServerClientText = ''): Record<Codex0142FeatureKey, Codex0142FeatureState> {
  const lower = schemaText.toLowerCase();
  const actual = (key: Codex0142FeatureKey, needles: string[]): Codex0142FeatureState => {
    const found = schemaOk && needles.every((needle) => lower.includes(needle.toLowerCase()));
    return {
      supported: found,
      certainty: found ? 'actual' : schemaOk ? 'unverified' : 'failed',
      evidence: found ? needles.map((needle) => `generated_schema_contains:${needle}`) : [],
      blockers: found ? [] : [`codex_0142_${key}_not_verified`]
    };
  };
  return {
    runtime_identity: {
      supported: true,
      certainty: 'actual',
      evidence: ['runtime_identity_realpath_version_sha256'],
      blockers: []
    },
    protocol_schema_generation: {
      supported: schemaOk,
      certainty: schemaOk ? 'actual' : 'failed',
      evidence: schemaOk ? ['codex_app_server_generate_json_schema'] : [],
      blockers: schemaOk ? [] : ['codex_app_server_schema_generation_failed']
    },
    multi_agent_mode_schema: actual('multi_agent_mode_schema', ['MultiAgentMode']),
    rollout_budget_schema: actual('rollout_budget_schema', ['budgetLimited']),
    indexed_web_search_schema: actual('indexed_web_search_schema', ['indexed']),
    current_time_read_schema: currentTimeState(lower, schemaOk, appServerClientText),
    native_thread_list_search_schema: actual('native_thread_list_search_schema', ['thread/list', 'ThreadSearchResult', 'thread/read']),
    plugin_catalog_refresh_schema: actual('plugin_catalog_refresh_schema', ['plugin/list', 'plugin/install', 'AppListUpdatedNotification']),
    terminal_subagent_error_schema: actual('terminal_subagent_error_schema', ['subagentStart', 'subagentStop', 'error']),
    exec_mcp_reconnect_schema: actual('exec_mcp_reconnect_schema', ['mcp']),
    remote_native_environment_schema: actual('remote_native_environment_schema', ['remote']),
    app_server_overload_schema: actual('app_server_overload_schema', ['JSONRPCError'])
  };
}

function currentTimeState(schemaTextLower: string, schemaOk: boolean, appServerClientText: string): Codex0142FeatureState {
  const schemaHasCurrentTime = schemaOk && schemaTextLower.includes('currenttime') && schemaTextLower.includes('read');
  if (schemaHasCurrentTime) {
    return {
      supported: true,
      certainty: 'actual',
      evidence: ['generated_schema_contains:currentTime/read'],
      blockers: []
    };
  }
  const clientHandlesCurrentTime = appServerClientText.includes('currentTime/read') && appServerClientText.includes('currentTimeResponse');
  return {
    supported: clientHandlesCurrentTime,
    certainty: clientHandlesCurrentTime ? 'discovered' : schemaOk ? 'unverified' : 'failed',
    evidence: clientHandlesCurrentTime ? ['sks_app_server_v2_client_handles:currentTime/read'] : [],
    blockers: clientHandlesCurrentTime ? [] : ['codex_0142_current_time_read_handler_not_verified']
  };
}

async function generateSchemaProbe(root: string, codexBin: string): Promise<{ ok: boolean; text: string; sha256: string | null }> {
  const out = path.join(os.tmpdir(), `sks-codex-0142-schema-${process.pid}-${Date.now()}`);
  await ensureDir(out);
  const result = await runProcess(codexBin, ['app-server', 'generate-json-schema', '--out', out], {
    cwd: root,
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024
  }).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
    stdoutBytes: 0,
    stderrBytes: 0,
    truncated: false,
    timedOut: false
  }));
  if (result.code !== 0) return { ok: false, text: `${result.stdout}\n${result.stderr}`, sha256: null };
  const files = await listFiles(out);
  const rows = await Promise.all(files.map(async (file) => {
    const text = await fsp.readFile(file, 'utf8');
    return {
      relative: path.relative(out, file),
      text,
      canonicalText: canonicalSchemaContent(file, text)
    };
  }));
  const joined = rows.map((row) => `${row.relative}\n${row.text}`).join('\n');
  const canonicalJoined = rows.map((row) => `${row.relative}\n${row.canonicalText}`).join('\n');
  await fsp.rm(out, { recursive: true, force: true }).catch(() => {});
  return { ok: true, text: joined, sha256: sha256(canonicalJoined) };
}

function canonicalSchemaContent(file: string, text: string): string {
  if (!file.endsWith('.json')) return text;
  try {
    return JSON.stringify(sortJsonKeys(JSON.parse(text)));
  } catch {
    return text;
  }
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortJsonKeys(record[key])]));
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(absolute));
    else if (entry.isFile()) out.push(absolute);
  }
  return out.sort();
}

function blockedCapability(probeMode: 'blocked', runtime: CodexRuntimeIdentity | null, schemaSha: string | null, blockers: string[]): Codex0142Capability {
  const state = Object.fromEntries(CODEX_0142_FEATURE_KEYS.map((key) => [key, {
    supported: false,
    certainty: 'failed',
    evidence: [],
    blockers
  }])) as unknown as Record<Codex0142FeatureKey, Codex0142FeatureState>;
  return {
    schema: 'sks.codex-0142-capability.v1',
    generated_at: nowIso(),
    ok: false,
    release_authorizing: false,
    target_tag: CURRENT_CODEX_RELEASE_MANIFEST.targetTag,
    required_version: CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion,
    runtime_identity: runtime,
    generated_schema_sha256: schemaSha,
    manifest_schema_sha256: CURRENT_CODEX_RELEASE_MANIFEST.generatedSchemaSha256,
    probe_mode: probeMode,
    feature_states: state,
    blockers,
    warnings: []
  };
}

function fakeCapability(): Codex0142Capability {
  const state = Object.fromEntries(CODEX_0142_FEATURE_KEYS.map((key) => [key, {
    supported: true,
    certainty: 'hermetic_fixture',
    evidence: [`fixture:${key}`],
    blockers: []
  }])) as unknown as Record<Codex0142FeatureKey, Codex0142FeatureState>;
  return {
    schema: 'sks.codex-0142-capability.v1',
    generated_at: nowIso(),
    ok: true,
    release_authorizing: false,
    target_tag: CURRENT_CODEX_RELEASE_MANIFEST.targetTag,
    required_version: CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion,
    runtime_identity: null,
    generated_schema_sha256: 'fixture',
    manifest_schema_sha256: CURRENT_CODEX_RELEASE_MANIFEST.generatedSchemaSha256,
    probe_mode: 'hermetic-fixture',
    feature_states: state,
    blockers: [],
    warnings: ['fixture_capability_is_not_release_authorizing']
  };
}
