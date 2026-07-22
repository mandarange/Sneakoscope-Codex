import path from 'node:path';
import { packageRoot, readJson, readText, sha256 } from '../fsx.js';

export const CODEX_RELEASE_MANIFEST_SCHEMA = 'sks.codex-release-manifest.v1' as const;

export type CodexFeaturePolicy = 'delegate' | 'probe' | 'wrap' | 'disable';

export interface CodexReleaseManifest {
  readonly schema: typeof CODEX_RELEASE_MANIFEST_SCHEMA;
  /** Preferred / recommended latest Codex channel tracked by this SKS package. */
  readonly targetTag: string;
  /** Preferred CLI version (release channel), not an exclusive product lock. */
  readonly requiredCliVersion: string;
  /** Alias of requiredCliVersion — preferred latest operator Codex. */
  readonly preferredCliVersion: string;
  readonly sdkVersion: string;
  /**
   * Soft floor for general SKS integration. Features that need newer Codex
   * degrade or block only themselves (with update CTA), not all of SKS.
   */
  readonly minimumSupportedVersion: string;
  /**
   * Capability floor for Naruto / official-subagent MA v2. Prefer live
   * `features.multi_agent_v2` probes over this semver hint.
   */
  readonly narutoCapabilityFloorVersion: string;
  readonly protocolMode: 'exec-sdk' | 'app-server-v2';
  readonly generatedSchemaSha256: string;
  readonly upstreamCommit: string;
  readonly featurePolicies: Record<string, CodexFeaturePolicy>;
  readonly requiredRealProbes: readonly string[];
  readonly supportedPlatforms: readonly string[];
}

export const CURRENT_CODEX_RELEASE_MANIFEST: CodexReleaseManifest = {
  schema: CODEX_RELEASE_MANIFEST_SCHEMA,
  targetTag: 'rust-v0.145.0',
  requiredCliVersion: '0.145.0',
  preferredCliVersion: '0.145.0',
  sdkVersion: '0.145.0',
  minimumSupportedVersion: '0.133.0',
  narutoCapabilityFloorVersion: '0.145.0',
  protocolMode: 'app-server-v2',
  generatedSchemaSha256: '57b4a85429300c37f2f2e5fc8662c3dbeb88d51419e25becb8501c46348e1ecf',
  upstreamCommit: 'rust-v0.145.0',
  featurePolicies: {
    multiAgentMode: 'delegate',
    multiAgentV2: 'delegate',
    agentsMaxConcurrentThreads: 'delegate',
    indexedWebSearch: 'probe',
    currentTimeRead: 'wrap',
    threadListSearchRead: 'probe',
    pluginCatalogRefresh: 'probe',
    terminalSubagentErrorPropagation: 'probe',
    execMcpTransientRecovery: 'probe',
    remoteNativeEnvironment: 'probe',
    rolloutTokenBudget: 'probe',
    mcpStartupToolTimeouts: 'wrap',
    gpt56TerraLunaSolRouting: 'delegate'
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

/** Naruto / official-subagent capability floor (prefer live MA v2 probes). */
export const NARUTO_REQUIRED_CODEX_VERSION = CURRENT_CODEX_RELEASE_MANIFEST.narutoCapabilityFloorVersion;

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
