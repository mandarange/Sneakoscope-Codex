import path from 'node:path';
import { packageRoot, readJson, readText, sha256 } from '../fsx.js';

export const CODEX_RELEASE_MANIFEST_SCHEMA = 'sks.codex-release-manifest.v1' as const;

export type CodexFeaturePolicy = 'delegate' | 'probe' | 'wrap' | 'disable';

export interface CodexReleaseManifest {
  readonly schema: typeof CODEX_RELEASE_MANIFEST_SCHEMA;
  readonly targetTag: string;
  readonly requiredCliVersion: string;
  readonly sdkVersion: string;
  readonly minimumSupportedVersion: string;
  readonly protocolMode: 'exec-sdk' | 'app-server-v2';
  readonly generatedSchemaSha256: string;
  readonly upstreamCommit: string;
  readonly featurePolicies: Record<string, CodexFeaturePolicy>;
  readonly requiredRealProbes: readonly string[];
  readonly supportedPlatforms: readonly string[];
}

export const CURRENT_CODEX_RELEASE_MANIFEST: CodexReleaseManifest = {
  schema: CODEX_RELEASE_MANIFEST_SCHEMA,
  targetTag: 'rust-v0.144.5',
  requiredCliVersion: '0.144.5',
  sdkVersion: '0.144.5',
  minimumSupportedVersion: '0.144.5',
  protocolMode: 'app-server-v2',
  generatedSchemaSha256: '2b3f14fa2e728f77a16385ff39f3a1d85ab255c1020498a85c1c0fb24f3d2f3c',
  upstreamCommit: 'rust-v0.144.5',
  featurePolicies: {
    multiAgentMode: 'probe',
    indexedWebSearch: 'probe',
    currentTimeRead: 'wrap',
    threadListSearchRead: 'probe',
    pluginCatalogRefresh: 'probe',
    terminalSubagentErrorPropagation: 'probe',
    execMcpTransientRecovery: 'probe',
    remoteNativeEnvironment: 'probe',
    rolloutTokenBudget: 'probe'
  },
  requiredRealProbes: [
    'runtime_identity',
    'protocol_schema_generation',
    'multi_agent_mode_schema',
    'indexed_web_search_schema',
    'current_time_read_schema',
    'thread_list_search_schema',
    'terminal_error_schema',
    'rollout_budget_schema'
  ],
  supportedPlatforms: [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'win32-arm64',
    'win32-x64'
  ]
};

export function currentCodexReleaseManifestPath(root = packageRoot()): string {
  return path.join(root, 'config', 'codex-releases', `${CURRENT_CODEX_RELEASE_MANIFEST.targetTag}.json`);
}

export async function loadCurrentCodexReleaseManifest(root = packageRoot()): Promise<CodexReleaseManifest> {
  return await readJson<CodexReleaseManifest>(currentCodexReleaseManifestPath(root));
}

export async function codexReleaseManifestParity(root = packageRoot()) {
  const file = await loadCurrentCodexReleaseManifest(root);
  const mismatches: string[] = [];
  for (const key of Object.keys(CURRENT_CODEX_RELEASE_MANIFEST) as Array<keyof CodexReleaseManifest>) {
    if (JSON.stringify(file[key]) !== JSON.stringify(CURRENT_CODEX_RELEASE_MANIFEST[key])) {
      mismatches.push(String(key));
    }
  }
  const text = await readText(currentCodexReleaseManifestPath(root));
  return {
    ok: mismatches.length === 0,
    mismatches,
    manifest: file,
    manifest_path: currentCodexReleaseManifestPath(root),
    manifest_sha256: sha256(text)
  };
}
