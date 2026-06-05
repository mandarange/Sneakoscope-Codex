import { runProcess, which } from '../fsx.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { createHash } from 'node:crypto'

export const CODEX_0_137_BASELINE_TAG = 'rust-v0.137.0'
export const CODEX_0_137_VERSION = '0.137.0'
export const CODEX_0_137_SCHEMA = 'sks.codex-0.137-compat.v1'

export type Codex0137CapabilityId =
  | 'plugin_list_json'
  | 'thread_runtime_choice'
  | 'environment_scoped_approvals'
  | 'managed_proxy_ca_bundle_child_commands'
  | 'python_sdk_app_server_json_rpc'

export function codex0137Matrix(input: {
  version?: string | null
  available?: boolean
  pluginListText?: string
  debugModelsText?: string
  doctorText?: string
  requireReal?: boolean
} = {}) {
  const version = parseCodexVersionText(input.version) || input.version || null
  const available = input.available !== false && Boolean(version)
  const meets = available && compareSemverLike(version, CODEX_0_137_VERSION) >= 0
  const pluginJsonDetected = looksLikeJson(input.pluginListText || '')
  const runtimeDetected = /runtime|model|provider|thread/i.test(input.debugModelsText || '')
  const approvalsDetected = /approval|environment|sandbox|profile|permission/i.test(input.doctorText || '')
  const localOrBaseline = (detected: boolean) => detected ? 'detected' : meets ? 'release_baseline' : available ? 'blocked' : 'unavailable'
  const capabilities = [
    capability('plugin_list_json', 'P0', localOrBaseline(pluginJsonDetected), '`codex plugin list --json` parses as JSON or 0.137 baseline records it.'),
    capability('thread_runtime_choice', 'P0', localOrBaseline(runtimeDetected), 'Thread/runtime choice is tracked by SKS per-thread proof and Codex runtime evidence.'),
    capability('environment_scoped_approvals', 'P0', localOrBaseline(approvalsDetected), 'Approval proof carries environment identity and sandbox scope.'),
    capability('managed_proxy_ca_bundle_child_commands', 'P1', meets ? 'release_baseline' : available ? 'blocked' : 'unavailable', 'Managed proxy CA bundle propagation is release-baseline plus SKS env proof.'),
    capability('python_sdk_app_server_json_rpc', 'P0', meets ? 'release_baseline' : available ? 'blocked' : 'unavailable', 'Python SDK controls local app-server over JSON-RPC per current Codex manual.')
  ]
  const below = available && version ? compareSemverLike(version, CODEX_0_137_VERSION) < 0 : false
  const blockers = [
    ...(input.requireReal && (!version || below) ? ['codex_0_137_required_but_not_detected'] : []),
    ...capabilities
      .filter((row) => input.requireReal && row.priority === 'P0' && (row.status === 'blocked' || row.status === 'unavailable'))
      .map((row) => `codex_0_137_capability_unavailable:${row.id}`)
  ]
  return {
    schema: CODEX_0_137_SCHEMA,
    baseline: CODEX_0_137_BASELINE_TAG,
    required_version: CODEX_0_137_VERSION,
    release_evidence: {
      upstream: 'openai/codex',
      npm_package: '@openai/codex-sdk',
      npm_version: '0.137.0',
      manual_source: 'https://developers.openai.com/codex/codex-manual.md',
      checked_topics: ['Codex SDK TypeScript', 'Codex SDK Python', 'CLI plugin/json/runtime/approval surfaces']
    },
    inherited_baselines: ['rust-v0.136.0', 'rust-v0.135.0', 'rust-v0.134.0'],
    detected_version: version,
    available,
    require_real: input.requireReal === true,
    capabilities,
    plugin_list_json_supported: supported(capabilities, 'plugin_list_json'),
    thread_runtime_choice_supported: supported(capabilities, 'thread_runtime_choice'),
    environment_scoped_approvals_supported: supported(capabilities, 'environment_scoped_approvals'),
    ok: blockers.length === 0,
    warnings: !input.requireReal && (!version || below) ? [`Codex ${CODEX_0_137_BASELINE_TAG} not detected; release:check treats this as warning-only.`] : [],
    blockers
  }
}

export async function collectCodex0137LocalEvidence(opts: { codexBin?: string | null } = {}) {
  const bin = opts.codexBin || await which('codex')
  if (!bin) {
    return {
      available: false,
      versionText: '',
      pluginListText: '',
      debugModelsText: '',
      doctorText: '',
      warnings: ['codex_binary_missing']
    }
  }
  const run = async (args: string[]) => runProcess(bin, args, { timeoutMs: 10000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err.message || String(err)
  }))
  const [version, pluginList, debugModels, doctor] = await Promise.all([
    run(['--version']),
    run(['plugin', 'list', '--json']),
    run(['debug', 'models', '--bundled']),
    run(['doctor', '--json'])
  ])
  return {
    available: version.code === 0,
    versionText: `${version.stdout || ''}${version.stderr || ''}`.trim(),
    pluginListText: `${pluginList.stdout || ''}${pluginList.stderr || ''}`,
    debugModelsText: summarizeCodexCommandOutput(`${debugModels.stdout || ''}${debugModels.stderr || ''}`, ['runtime', 'model', 'provider', 'thread']),
    doctorText: summarizeCodexCommandOutput(`${doctor.stdout || ''}${doctor.stderr || ''}`, ['approval', 'environment', 'sandbox', 'profile', 'permission']),
    warnings: [
      ...(pluginList.code === 0 ? [] : ['codex_plugin_list_json_unavailable']),
      ...(debugModels.code === 0 ? [] : ['codex_debug_models_unavailable']),
      ...(doctor.code === 0 ? [] : ['codex_doctor_json_unavailable'])
    ]
  }
}

function capability(id: Codex0137CapabilityId, priority: 'P0' | 'P1', status: string, detector: string) {
  return { id, priority, status, detector, notes: [] }
}

function supported(capabilities: any[], id: Codex0137CapabilityId) {
  const status = capabilities.find((capability) => capability.id === id)?.status
  return status === 'detected' || status === 'release_baseline'
}

function looksLikeJson(value: string) {
  const text = String(value || '').trim()
  if (!text) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function summarizeCodexCommandOutput(value: string, keywords: string[]) {
  const text = String(value || '')
  const lower = text.toLowerCase()
  const matched = keywords.filter((keyword) => lower.includes(keyword.toLowerCase()))
  return [
    `raw_output_redacted=true`,
    `bytes=${Buffer.byteLength(text, 'utf8')}`,
    `sha256=${createHash('sha256').update(text).digest('hex')}`,
    `matched_keywords=${matched.join(',') || 'none'}`
  ].join(' ')
}
