import { compareSemverLike, parseCodexVersionText } from './codex-version-policy.js';

export const CODEX_0_133_BASELINE_TAG = 'rust-v0.133.0';
export const CODEX_0_133_VERSION = '0.133.0';

export type Codex0133CapabilityId =
  | 'exec_resume_output_schema'
  | 'app_server_image_fidelity'
  | 'memory_summary_version_rebuild'
  | 'goal_continuation_blocker_stop'
  | 'tui_probe_batching'
  | 'remote_executor_standard_auth'
  | 'python_sdk_auth'
  | 'python_sdk_turn_result'
  | 'goals_default_enabled'
  | 'remote_control_foreground_app_server'
  | 'permission_profiles_requirements'
  | 'plugin_discovery_marketplaces'
  | 'extension_lifecycle_events';

export interface Codex0133Capability {
  id: Codex0133CapabilityId;
  priority: 'P0' | 'P1';
  status: 'available' | 'integration_optional' | 'degraded_supported' | 'warning_only';
  preferred?: boolean;
  detector: string;
  notes: string[];
}

export const CODEX_0_133_RELEASE_EVIDENCE = Object.freeze({
  upstream: 'openai/codex',
  tag: CODEX_0_133_BASELINE_TAG,
  tag_url: 'https://github.com/openai/codex/releases/tag/rust-v0.133.0',
  commit: '5d7c647',
  config_schema: 'https://raw.githubusercontent.com/openai/codex/rust-v0.133.0/codex-rs/core/config.schema.json',
  hook_schema_listing: 'https://api.github.com/repos/openai/codex/contents/codex-rs/hooks/schema/generated?ref=rust-v0.133.0',
  local_detection: [
    'codex --version',
    'codex exec --help',
    'codex exec resume --help',
    'codex remote-control --help',
    'codex features list',
    'codex mcp list'
  ],
  official_model_doc: 'https://developers.openai.com/api/docs/models/gpt-image-2'
});

export function codex0133Capabilities(input: {
  version?: string | null;
  available?: boolean;
  execResumeHelp?: string;
  execHelp?: string;
} = {}): Codex0133Capability[] {
  const version = parseCodexVersionText(input.version) || input.version || null;
  const available = input.available !== false && Boolean(version);
  const meets = available && compareSemverLike(version, CODEX_0_133_VERSION) >= 0;
  const resumeHelp = `${input.execResumeHelp || ''}\n${input.execHelp || ''}`;
  const outputSchemaDetected = /--output-schema\b/.test(resumeHelp)
    || /--output-schema\b/.test(input.execHelp || '');
  const status = available
    ? meets ? 'available' : 'degraded_supported'
    : 'integration_optional';
  const outputSchemaStatus = outputSchemaDetected || (version && compareSemverLike(version, '0.132.0') >= 0)
    ? 'available'
    : status;
  return [
    {
      id: 'exec_resume_output_schema',
      priority: 'P0',
      status: outputSchemaStatus,
      preferred: outputSchemaStatus === 'available',
      detector: 'Codex version >=0.132.0 or `codex exec resume --help` exposes --output-schema; inherited under the 0.133 baseline',
      notes: [
        'Preferred structured output path for native agents, UX-Review callout extraction, Completion Proof, and Wrongness outputs.',
        outputSchemaDetected ? 'Local help text exposes --output-schema on exec resume.' : 'Help text did not expose --output-schema; fallback output is capped at verified_partial.'
      ]
    },
    {
      id: 'app_server_image_fidelity',
      priority: 'P0',
      status,
      detector: 'Codex 0.133 baseline plus gpt-image-2 high-fidelity image input support',
      notes: [
        'UX-Review records original-resolution source metadata and generated/source dimension relations.',
        'If the Codex App image surface is unavailable, SKS records imagegen_capability_missing and blocks verified visual claims.'
      ]
    },
    {
      id: 'memory_summary_version_rebuild',
      priority: 'P0',
      status,
      detector: 'Codex 0.133 memory summary version/rebuild behavior mapped to SKS summary schema versions',
      notes: ['TriWiki, Wrongness, and shared memory summaries carry schema versions and rebuild metadata.']
    },
    {
      id: 'goal_continuation_blocker_stop',
      priority: 'P0',
      status,
      detector: 'Codex 0.133 goal continuation usage-limit/repeated-blocker behavior',
      notes: ['Goal, QA, Research, and UX-Review loops use the same repeated-blocker stop contract.']
    },
    {
      id: 'tui_probe_batching',
      priority: 'P0',
      status,
      detector: 'Codex 0.133 TUI startup terminal capability probe batching mapped to SKS doctor probes',
      notes: ['Doctor probes expose batchable probe ids and timeout budgets.']
    },
    {
      id: 'goals_default_enabled',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: 'Codex rust-v0.133.0 release notes: goals are enabled by default',
      notes: ['SKS treats native /goal as the active persisted continuation surface instead of a preview-only path.']
    },
    {
      id: 'remote_control_foreground_app_server',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: 'Codex rust-v0.133.0 release notes: foreground the latest app-server in remote-control',
      notes: ['Codex App readiness prefers the latest foregrounded app-server and keeps remote-control checks explicit.']
    },
    {
      id: 'permission_profiles_requirements',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: 'Codex 0.133 config schema exposes permissions, default_permissions, profile/profiles, and requirements policy surfaces',
      notes: ['Managed hook policies keep requirements.toml explicit and do not write outdated permission-profile config.']
    },
    {
      id: 'plugin_discovery_marketplaces',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex 0.133 config schema exposes plugins and marketplaces; release notes include plugin discovery work',
      notes: ['Recorded as optional plugin-discovery readiness unless a route explicitly depends on a marketplace/plugin surface.']
    },
    {
      id: 'extension_lifecycle_events',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex rust-v0.133.0 release notes include extension lifecycle events for turn/tool/model/item phases',
      notes: ['Extension lifecycle events are tracked separately from the generated Codex hook schema snapshot, which remains validated by the latest 10-event strict subset.']
    },
    {
      id: 'remote_executor_standard_auth',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex remote executor registration can use standard Codex auth',
      notes: ['Recorded as a codex-lb/remote executor policy review item; no credential fallback is invented.']
    },
    {
      id: 'python_sdk_auth',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex Python SDK first-class auth',
      notes: ['P1 optional adapter skeleton only; SKS eval harness remains JS-first unless explicitly configured.']
    },
    {
      id: 'python_sdk_turn_result',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex richer Python TurnResult',
      notes: ['P1 optional timing/usage adapter target for future native agent benchmarks.']
    }
  ];
}

export function codex0133Matrix(input: {
  version?: string | null;
  available?: boolean;
  execResumeHelp?: string;
  execHelp?: string;
} = {}) {
  const capabilities = codex0133Capabilities(input);
  return {
    schema: 'sks.codex-0-133-matrix.v1',
    baseline: CODEX_0_133_BASELINE_TAG,
    required_version: CODEX_0_133_VERSION,
    release_evidence: CODEX_0_133_RELEASE_EVIDENCE,
    inherited_baselines: ['rust-v0.132.0'],
    capabilities,
    goals_enabled_by_default: capabilities.find((capability) => capability.id === 'goals_default_enabled')?.preferred === true,
    remote_control_foreground_preferred: capabilities.find((capability) => capability.id === 'remote_control_foreground_app_server')?.preferred === true,
    permission_profiles_requirements_preferred: capabilities.find((capability) => capability.id === 'permission_profiles_requirements')?.preferred === true,
    ux_review_output_schema_preferred: capabilities.find((capability) => capability.id === 'exec_resume_output_schema')?.preferred === true,
    unknown_future_fields_policy: 'warning_only_baseline_validation',
    hook_strict_subset_baseline: 'latest'
  };
}
