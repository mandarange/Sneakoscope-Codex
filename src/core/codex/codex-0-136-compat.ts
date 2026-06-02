import { runProcess, which } from '../fsx.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'

export const CODEX_0_136_BASELINE_TAG = 'rust-v0.136.0'
export const CODEX_0_136_VERSION = '0.136.0'
export const CODEX_0_136_SCHEMA = 'sks.codex-0.136-compat.v1'

export type Codex0136CapabilityStatus = 'detected' | 'release_baseline' | 'unavailable' | 'blocked'

export type Codex0136CapabilityId =
  | 'tui_hyperlink_markdown_tables'
  | 'session_archive_restore'
  | 'app_server_resume_status_stdio'
  | 'remote_api_key_registration_server_tokens'
  | 'windows_sandbox_elevated_setup'
  | 'native_image_generation_extension_pipeline'
  | 'chatgpt_auth_refresh_relogin'
  | 'command_safety_hardening'
  | 'sandbox_cleanup_deny_read_preserved'
  | 'tui_resume_hook_vim_stability'
  | 'app_server_fs_watch_search_activity'
  | 'bedrock_region_service_tier_hardening'
  | 'rmcp_1_7_compat'

export interface Codex0136Capability {
  id: Codex0136CapabilityId
  priority: 'P0' | 'P1' | 'P2'
  status: Codex0136CapabilityStatus
  detector: string
  notes: string[]
}

export interface Codex0136LocalEvidence {
  available: boolean
  versionText: string
  doctorText: string
  archiveHelp: string
  unarchiveHelp: string
  appServerHelp: string
  sandboxSetupHelp: string
  remoteControlHelp: string
  warnings: string[]
}

export const CODEX_0_136_RELEASE_EVIDENCE = Object.freeze({
  upstream: 'openai/codex',
  tag: CODEX_0_136_BASELINE_TAG,
  tag_url: 'https://github.com/openai/codex/releases/tag/rust-v0.136.0',
  commit: '7ca6113',
  release_date: '2026-06-01',
  local_detection: [
    'codex --version',
    'codex archive --help',
    'codex unarchive --help',
    'codex app-server --help',
    'codex sandbox setup --help',
    'codex remote-control --help',
    'codex doctor'
  ],
  release_notes_topics: [
    'TUI OSC 8 web links and readable cramped markdown tables',
    'session archive and unarchive commands',
    'app-server resume turns page, MCP status, and --stdio alias',
    'CODEX_API_KEY remote registration and server-token remote control',
    'Windows sandbox elevated setup and implementation requirements',
    'feature-gated standalone image generation extension pipeline',
    'ChatGPT auth refresh and relogin-required handling',
    'command-safety hardening for /diff, PowerShell parsing, and websocket origins',
    'sandbox cleanup plus deny-read preservation',
    'resumed prompt history, multiline hook output, and Vim editing stability',
    'app-server fs/watch debounce and standalone web search activity',
    'Bedrock AWS_REGION fallback and unsupported service-tier removal',
    'rmcp 1.7.0 compatibility'
  ]
})

export function codex0136Capabilities(input: {
  version?: string | null
  available?: boolean
  doctorText?: string
  archiveHelp?: string
  unarchiveHelp?: string
  appServerHelp?: string
  sandboxSetupHelp?: string
  remoteControlHelp?: string
} = {}): Codex0136Capability[] {
  const version = parseCodexVersionText(input.version) || input.version || null
  const available = input.available !== false && Boolean(version)
  const meets = available && compareSemverLike(version, CODEX_0_136_VERSION) >= 0
  const doctorText = input.doctorText || ''
  const archiveHelp = input.archiveHelp || ''
  const unarchiveHelp = input.unarchiveHelp || ''
  const appServerHelp = input.appServerHelp || ''
  const sandboxSetupHelp = input.sandboxSetupHelp || ''
  const remoteControlHelp = input.remoteControlHelp || ''
  const archiveDetected = /archive/i.test(`${archiveHelp}\n${unarchiveHelp}`)
  const appServerDetected = /--stdio|stdio|MCP|status|resume|thread/i.test(appServerHelp)
  const remoteDetected = /CODEX_API_KEY|server token|token|websocket|remote[- ]control/i.test(`${remoteControlHelp}\n${appServerHelp}\n${doctorText}`)
  const windowsSandboxDetected = /--elevated|elevated|windows|requirements|sandbox/i.test(sandboxSetupHelp)
  const authDetected = /auth|token|login|relogin|refresh/i.test(doctorText)
  const localOrBaseline = (detected: boolean): Codex0136CapabilityStatus => detected ? 'detected' : meets ? 'release_baseline' : available ? 'blocked' : 'unavailable'
  const baselineOnly: Codex0136CapabilityStatus = meets ? 'release_baseline' : available ? 'blocked' : 'unavailable'
  return [
    {
      id: 'tui_hyperlink_markdown_tables',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence; TUI rich markdown rendering is not reliably exposed by CLI help.',
      notes: ['SKS terminal-output gates keep markdown/table output stable while Codex 0.136 adds OSC 8 link preservation.']
    },
    {
      id: 'session_archive_restore',
      priority: 'P0',
      status: localOrBaseline(archiveDetected),
      detector: '`codex archive --help` or `codex unarchive --help` exposes session archive commands.',
      notes: [archiveDetected ? 'Local archive/unarchive command help was detected.' : 'Recorded from the 0.136 release baseline when local help is not explicit.']
    },
    {
      id: 'app_server_resume_status_stdio',
      priority: 'P0',
      status: localOrBaseline(appServerDetected),
      detector: '`codex app-server --help` exposes --stdio/status/resume-thread terms.',
      notes: [appServerDetected ? 'Local app-server help exposes 0.136-era terms.' : 'SKS treats app-server status/resume/stdio support as 0.136 release-baseline evidence.']
    },
    {
      id: 'remote_api_key_registration_server_tokens',
      priority: 'P0',
      status: localOrBaseline(remoteDetected),
      detector: '`codex remote-control --help`, app-server help, or doctor output mentions API-key/token/remote-control behavior.',
      notes: ['SKS remote-control readiness keeps command/version capability checks explicit and does not depend on removed feature flags.']
    },
    {
      id: 'windows_sandbox_elevated_setup',
      priority: 'P1',
      status: localOrBaseline(windowsSandboxDetected),
      detector: '`codex sandbox setup --help` exposes elevated Windows sandbox setup wording.',
      notes: ['Non-Windows hosts record this as release-readiness evidence; live Windows provisioning is not required for SKS macOS/Linux release checks.']
    },
    {
      id: 'native_image_generation_extension_pipeline',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence; feature-gated image extension capability is surfaced through Codex App/imagegen gates.',
      notes: ['SKS still requires real Codex App $imagegen/gpt-image-2 output before full visual evidence can pass.']
    },
    {
      id: 'chatgpt_auth_refresh_relogin',
      priority: 'P0',
      status: localOrBaseline(authDetected),
      detector: '`codex doctor` auth text or the 0.136 release baseline covers refresh/relogin-required behavior.',
      notes: ['SKS auth checks report blockers honestly instead of collapsing them into generic cloud errors.']
    },
    {
      id: 'command_safety_hardening',
      priority: 'P0',
      status: baselineOnly,
      detector: 'Release-baseline evidence for /diff helper isolation, PowerShell non-Windows avoidance, and browser-origin websocket rejection.',
      notes: ['SKS mutation and command-safety gates remain the local safety baseline.']
    },
    {
      id: 'sandbox_cleanup_deny_read_preserved',
      priority: 'P0',
      status: baselineOnly,
      detector: 'Release-baseline evidence for sandbox cleanup and deny-read preservation.',
      notes: ['SKS permission-profile and sandbox tests cover local deny/read behavior separately.']
    },
    {
      id: 'tui_resume_hook_vim_stability',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence for prompt history, multiline hook output, and Vim normal-mode fixes.',
      notes: ['SKS hook output gates and terminal stability checks map the local risk.']
    },
    {
      id: 'app_server_fs_watch_search_activity',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence for app-server watcher debounce and standalone web search activity restoration.',
      notes: ['SKS app-server and source-intelligence routes keep search evidence bounded in reports.']
    },
    {
      id: 'bedrock_region_service_tier_hardening',
      priority: 'P2',
      status: baselineOnly,
      detector: 'Release-baseline evidence for AWS_REGION/AWS_DEFAULT_REGION fallback and unsupported Bedrock tier removal.',
      notes: ['This is recorded as provider-catalog compatibility, not a blocker for default OpenAI-backed SKS routes.']
    },
    {
      id: 'rmcp_1_7_compat',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence for rmcp 1.7.0 compatibility updates.',
      notes: ['Existing MCP readOnly/runtime scheduler gates stay in the release chain.']
    }
  ]
}

export function codex0136Matrix(input: {
  version?: string | null
  available?: boolean
  doctorText?: string
  archiveHelp?: string
  unarchiveHelp?: string
  appServerHelp?: string
  sandboxSetupHelp?: string
  remoteControlHelp?: string
  requireReal?: boolean
} = {}) {
  const capabilities = codex0136Capabilities(input)
  const version = parseCodexVersionText(input.version) || input.version || null
  const below = input.available !== false && version ? compareSemverLike(version, CODEX_0_136_VERSION) < 0 : false
  const supported = (id: Codex0136CapabilityId) => {
    const status = capabilities.find((capability) => capability.id === id)?.status
    return status === 'detected' || status === 'release_baseline'
  }
  const blockers = [
    ...(input.requireReal && (!version || below) ? ['codex_0_136_required_but_not_detected'] : []),
    ...capabilities
      .filter((capability) => input.requireReal && capability.priority === 'P0' && (capability.status === 'blocked' || capability.status === 'unavailable'))
      .map((capability) => `codex_0_136_capability_unavailable:${capability.id}`)
  ]
  return {
    schema: CODEX_0_136_SCHEMA,
    baseline: CODEX_0_136_BASELINE_TAG,
    required_version: CODEX_0_136_VERSION,
    release_evidence: CODEX_0_136_RELEASE_EVIDENCE,
    inherited_baselines: ['rust-v0.135.0', 'rust-v0.134.0', 'rust-v0.133.0', 'rust-v0.132.0'],
    detected_version: version,
    available: input.available !== false && Boolean(version),
    require_real: input.requireReal === true,
    capabilities,
    session_archive_supported: supported('session_archive_restore'),
    app_server_stdio_supported: supported('app_server_resume_status_stdio'),
    remote_api_key_registration_supported: supported('remote_api_key_registration_server_tokens'),
    command_safety_hardening_supported: supported('command_safety_hardening'),
    native_image_generation_extension_supported: supported('native_image_generation_extension_pipeline'),
    ok: blockers.length === 0,
    warnings: !input.requireReal && (!version || below) ? [`Codex ${CODEX_0_136_BASELINE_TAG} not detected; release:check treats this as warning-only.`] : [],
    blockers
  }
}

export async function collectCodex0136LocalEvidence(opts: { codexBin?: string | null } = {}): Promise<Codex0136LocalEvidence> {
  const bin = opts.codexBin || await which('codex')
  if (!bin) {
    return {
      available: false,
      versionText: '',
      doctorText: '',
      archiveHelp: '',
      unarchiveHelp: '',
      appServerHelp: '',
      sandboxSetupHelp: '',
      remoteControlHelp: '',
      warnings: ['codex_binary_missing']
    }
  }
  const run = async (args: string[]) => runProcess(bin, args, { timeoutMs: 10000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err.message || String(err)
  }))
  const [version, doctor, archiveHelp, unarchiveHelp, appServerHelp, sandboxSetupHelp, remoteControlHelp] = await Promise.all([
    run(['--version']),
    run(['doctor']),
    run(['archive', '--help']),
    run(['unarchive', '--help']),
    run(['app-server', '--help']),
    run(['sandbox', 'setup', '--help']),
    run(['remote-control', '--help'])
  ])
  return {
    available: version.code === 0,
    versionText: `${version.stdout || ''}${version.stderr || ''}`.trim(),
    doctorText: `${doctor.stdout || ''}${doctor.stderr || ''}`,
    archiveHelp: `${archiveHelp.stdout || ''}${archiveHelp.stderr || ''}`,
    unarchiveHelp: `${unarchiveHelp.stdout || ''}${unarchiveHelp.stderr || ''}`,
    appServerHelp: `${appServerHelp.stdout || ''}${appServerHelp.stderr || ''}`,
    sandboxSetupHelp: `${sandboxSetupHelp.stdout || ''}${sandboxSetupHelp.stderr || ''}`,
    remoteControlHelp: `${remoteControlHelp.stdout || ''}${remoteControlHelp.stderr || ''}`,
    warnings: [
      ...(doctor.code === 0 ? [] : ['codex_doctor_unavailable']),
      ...(archiveHelp.code === 0 ? [] : ['codex_archive_help_unavailable']),
      ...(unarchiveHelp.code === 0 ? [] : ['codex_unarchive_help_unavailable']),
      ...(appServerHelp.code === 0 ? [] : ['codex_app_server_help_unavailable']),
      ...(sandboxSetupHelp.code === 0 ? [] : ['codex_sandbox_setup_help_unavailable']),
      ...(remoteControlHelp.code === 0 ? [] : ['codex_remote_control_help_unavailable'])
    ]
  }
}
