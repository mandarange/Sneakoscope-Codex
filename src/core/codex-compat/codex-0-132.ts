import { compareSemverLike, parseCodexVersionText } from './codex-version-policy.js';

export const CODEX_0_132_BASELINE_TAG = 'rust-v0.132.0';
export const CODEX_0_132_VERSION = '0.132.0';

export type Codex0132CapabilityId =
  | 'exec_resume_output_schema'
  | 'app_server_image_fidelity'
  | 'memory_summary_version_rebuild'
  | 'goal_continuation_blocker_stop'
  | 'tui_probe_batching'
  | 'remote_executor_standard_auth'
  | 'python_sdk_auth'
  | 'python_sdk_turn_result';

export interface Codex0132Capability {
  id: Codex0132CapabilityId;
  priority: 'P0' | 'P1';
  status: 'available' | 'integration_optional' | 'degraded_supported' | 'warning_only';
  preferred?: boolean;
  detector: string;
  notes: string[];
}

export const CODEX_0_132_RELEASE_EVIDENCE = Object.freeze({
  upstream: 'openai/codex',
  tag: CODEX_0_132_BASELINE_TAG,
  tag_url: 'https://github.com/openai/codex/releases/tag/rust-v0.132.0',
  local_detection: [
    'codex --version',
    'codex exec --help',
    'codex exec resume --help'
  ],
  official_model_doc: 'https://developers.openai.com/api/docs/models/gpt-image-2'
});

export function codex0132Capabilities(input: {
  version?: string | null;
  available?: boolean;
  execResumeHelp?: string;
  execHelp?: string;
} = {}): Codex0132Capability[] {
  const version = parseCodexVersionText(input.version) || input.version || null;
  const available = input.available !== false && Boolean(version);
  const meets = available && compareSemverLike(version, CODEX_0_132_VERSION) >= 0;
  const resumeHelp = `${input.execResumeHelp || ''}\n${input.execHelp || ''}`;
  const outputSchemaDetected = /--output-schema\b/.test(resumeHelp)
    || /--output-schema\b/.test(input.execHelp || '');
  const status = available
    ? meets ? 'available' : 'degraded_supported'
    : 'integration_optional';
  const outputSchemaStatus = outputSchemaDetected || meets ? status : 'degraded_supported';
  return [
    {
      id: 'exec_resume_output_schema',
      priority: 'P0',
      status: outputSchemaStatus,
      preferred: outputSchemaStatus === 'available',
      detector: 'Codex version >=0.132.0 or `codex exec resume --help` exposes --output-schema',
      notes: [
        'Preferred structured output path for Scout, UX-Review callout extraction, Completion Proof, and Wrongness outputs.',
        outputSchemaDetected ? 'Local help text exposes --output-schema on exec resume.' : 'Help text did not expose --output-schema; fallback output is capped at verified_partial.'
      ]
    },
    {
      id: 'app_server_image_fidelity',
      priority: 'P0',
      status,
      detector: 'Codex 0.132 baseline plus gpt-image-2 high-fidelity image input support',
      notes: [
        'UX-Review records original-resolution source metadata and generated/source dimension relations.',
        'If the Codex App image surface is unavailable, SKS records imagegen_capability_missing and blocks verified visual claims.'
      ]
    },
    {
      id: 'memory_summary_version_rebuild',
      priority: 'P0',
      status,
      detector: 'Codex 0.132 memory summary version/rebuild behavior mapped to SKS summary schema versions',
      notes: ['TriWiki, Wrongness, and shared memory summaries carry schema versions and rebuild metadata.']
    },
    {
      id: 'goal_continuation_blocker_stop',
      priority: 'P0',
      status,
      detector: 'Codex 0.132 goal continuation usage-limit/repeated-blocker behavior',
      notes: ['Goal, QA, Research, and UX-Review loops use the same repeated-blocker stop contract.']
    },
    {
      id: 'tui_probe_batching',
      priority: 'P0',
      status,
      detector: 'Codex 0.132 TUI startup terminal capability probe batching mapped to SKS doctor probes',
      notes: ['Doctor probes expose batchable probe ids and timeout budgets.']
    },
    {
      id: 'remote_executor_standard_auth',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex 0.132 remote executor registration can use standard Codex auth',
      notes: ['Recorded as a codex-lb/remote executor policy review item; no credential fallback is invented.']
    },
    {
      id: 'python_sdk_auth',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex 0.132 Python SDK first-class auth',
      notes: ['P1 optional adapter skeleton only; SKS eval harness remains JS-first unless explicitly configured.']
    },
    {
      id: 'python_sdk_turn_result',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: 'Codex 0.132 richer Python TurnResult',
      notes: ['P1 optional timing/usage adapter target for future scout benchmarks.']
    }
  ];
}

export function codex0132Matrix(input: {
  version?: string | null;
  available?: boolean;
  execResumeHelp?: string;
  execHelp?: string;
} = {}) {
  const capabilities = codex0132Capabilities(input);
  return {
    schema: 'sks.codex-0-132-matrix.v1',
    baseline: CODEX_0_132_BASELINE_TAG,
    required_version: CODEX_0_132_VERSION,
    release_evidence: CODEX_0_132_RELEASE_EVIDENCE,
    capabilities,
    ux_review_output_schema_preferred: capabilities.find((capability) => capability.id === 'exec_resume_output_schema')?.preferred === true,
    unknown_future_fields_policy: 'warning_only_baseline_validation',
    hook_strict_subset_baseline: 'rust-v0.131.0'
  };
}
