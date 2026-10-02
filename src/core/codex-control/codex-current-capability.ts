import fsp from 'node:fs/promises';
import path from 'node:path';
import { CURRENT_CODEX_RUNTIME_CONTRACT } from '../codex-compat/codex-runtime-contract.js';
import { compareSemverLike } from '../codex-compat/codex-version-policy.js';
import { nowIso, runProcess, sha256, withScratchDir, writeJsonAtomic } from '../fsx.js';
import { resolveCodexRuntime, type CodexRuntimeIdentity } from '../codex-runtime/resolve-codex-runtime.js';

export type CodexCurrentCertainty = 'actual' | 'failed';

export const CODEX_CURRENT_FEATURE_KEYS = [
  'runtime_identity',
  'protocol_schema_generation'
] as const;

export type CodexCurrentFeatureKey = typeof CODEX_CURRENT_FEATURE_KEYS[number];

export interface CodexCurrentFeatureState {
  readonly supported: boolean;
  readonly certainty: CodexCurrentCertainty;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface CodexCurrentCapability {
  readonly schema: 'sks.codex-current-capability.v1';
  readonly generated_at: string;
  readonly ok: boolean;
  readonly release_authorizing: boolean;
  readonly target_tag: string;
  readonly required_version: string;
  readonly runtime_identity: CodexRuntimeIdentity | null;
  readonly generated_schema_sha256: string | null;
  readonly probe_mode: 'real-schema' | 'blocked';
  readonly feature_states: Record<CodexCurrentFeatureKey, CodexCurrentFeatureState>;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface CodexAppServerSchemaProbe {
  readonly ok: boolean;
  readonly text: string;
  readonly sha256: string | null;
}

/**
 * Resolves the Codex runtime SKS would use, checks it against the supported floor and generates the
 * App Server JSON schema from it. Everything else about Codex behavior is Codex's own to test.
 */
export async function detectCodexCurrentCapability(input: {
  readonly codexBin?: string | null;
  readonly root?: string;
} = {}): Promise<CodexCurrentCapability> {
  const root = input.root || process.cwd();
  const runtime = await resolveCodexRuntime({
    explicitPath: input.codexBin || null,
    requestedBy: 'codex-current-capability'
  });
  if (!runtime.identity) {
    return blockedCapability([...runtime.blockers]);
  }
  const versionOk = compareSemverLike(runtime.identity.version, CURRENT_CODEX_RUNTIME_CONTRACT.minVersion) >= 0;
  const schemaProbe = await probeCodexAppServerSchema(root, runtime.identity);
  const states: Record<CodexCurrentFeatureKey, CodexCurrentFeatureState> = {
    runtime_identity: {
      supported: true,
      certainty: 'actual',
      evidence: ['runtime_identity_realpath_version_sha256'],
      blockers: []
    },
    protocol_schema_generation: {
      supported: schemaProbe.ok,
      certainty: schemaProbe.ok ? 'actual' : 'failed',
      evidence: schemaProbe.ok ? ['codex_app_server_generate_json_schema'] : [],
      blockers: schemaProbe.ok ? [] : ['codex_app_server_schema_generation_failed']
    }
  };
  const blockers = [
    ...(versionOk ? [] : ['codex_current_release_required']),
    ...(schemaProbe.ok ? [] : ['codex_current_schema_generation_failed']),
    ...Object.values(states).flatMap((state) => state.blockers)
  ];
  const releaseAuthorizing = blockers.length === 0 && schemaProbe.sha256 !== null;
  return {
    schema: 'sks.codex-current-capability.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    release_authorizing: releaseAuthorizing,
    target_tag: CURRENT_CODEX_RUNTIME_CONTRACT.targetTag,
    required_version: CURRENT_CODEX_RUNTIME_CONTRACT.minVersion,
    runtime_identity: runtime.identity,
    generated_schema_sha256: schemaProbe.sha256,
    probe_mode: schemaProbe.ok ? 'real-schema' : 'blocked',
    feature_states: states,
    blockers,
    warnings: releaseAuthorizing ? [] : ['codex_current_not_release_authorizing_until_runtime_schema_probe_passes']
  };
}

export async function writeCodexCurrentCapabilityArtifacts(
  root: string,
  input: { readonly missionId?: string | null; readonly codexBin?: string | null } = {}
) {
  const probeInput: { root: string; codexBin?: string | null } = { root };
  if (input.codexBin !== undefined) probeInput.codexBin = input.codexBin || null;
  const report = await detectCodexCurrentCapability(probeInput);
  const rootArtifact = path.join(root, '.sneakoscope', 'codex', 'codex-current-capability.json');
  await writeJsonAtomic(rootArtifact, report);
  let missionArtifact: string | null = null;
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-current-capability.json');
    await writeJsonAtomic(missionArtifact, report);
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact };
}

/** Runs `codex app-server generate-json-schema` for the given runtime; the text is every generated file joined. */
export async function probeCodexAppServerSchema(root: string, runtime: CodexRuntimeIdentity): Promise<CodexAppServerSchemaProbe> {
  return withScratchDir('codex-current-schema-', async (out) => {
    const result = await runProcess(runtime.realpath, ['app-server', 'generate-json-schema', '--out', out], {
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
    return { ok: true, text: joined, sha256: sha256(canonicalJoined) };
  });
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

function blockedCapability(blockers: string[]): CodexCurrentCapability {
  const state = Object.fromEntries(CODEX_CURRENT_FEATURE_KEYS.map((key) => [key, {
    supported: false,
    certainty: 'failed',
    evidence: [],
    blockers
  }])) as unknown as Record<CodexCurrentFeatureKey, CodexCurrentFeatureState>;
  return {
    schema: 'sks.codex-current-capability.v1',
    generated_at: nowIso(),
    ok: false,
    release_authorizing: false,
    target_tag: CURRENT_CODEX_RUNTIME_CONTRACT.targetTag,
    required_version: CURRENT_CODEX_RUNTIME_CONTRACT.minVersion,
    runtime_identity: null,
    generated_schema_sha256: null,
    probe_mode: 'blocked',
    feature_states: state,
    blockers,
    warnings: []
  };
}
