import { runProcess, which } from '../fsx.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'

export const CODEX_0_135_BASELINE_TAG = 'rust-v0.135.0'
export const CODEX_0_135_VERSION = '0.135.0'
export const CODEX_0_135_SCHEMA = 'sks.codex-0.135-compat.v1'

export type Codex0135CapabilityStatus = 'detected' | 'release_baseline' | 'unavailable' | 'blocked'

export interface Codex0135Capability {
  id: string
  priority: 'P0' | 'P1' | 'P2'
  status: Codex0135CapabilityStatus
  detector: string
  notes: string[]
}

export interface Codex0135LocalEvidence {
  available: boolean
  versionText: string
  doctorText: string
  permissionsText: string
  execHelp: string
  resumeHelp: string
  warnings: string[]
}

export const CODEX_0_135_RELEASE_EVIDENCE = Object.freeze({
  upstream: 'openai/codex',
  tag: CODEX_0_135_BASELINE_TAG,
  tag_url: 'https://github.com/openai/codex/releases/tag/rust-v0.135.0',
  local_detection: [
    'codex --version',
    'codex doctor',
    'codex exec --help',
    'codex resume --help'
  ],
  release_notes_topics: [
    'richer codex doctor diagnostics',
    'named permission profiles',
    'bundled patched zsh helper discovery',
    'resume and cwd override inventory',
    'MCP tool naming centralization',
    'Responses retry centralization',
    'markdown table rendering',
    'memory runtime state separation'
  ]
})

export function codex0135Capabilities(input: {
  version?: string | null
  available?: boolean
  doctorText?: string
  permissionsText?: string
  execHelp?: string
  resumeHelp?: string
} = {}): Codex0135Capability[] {
  const version = parseCodexVersionText(input.version) || input.version || null
  const available = input.available !== false && Boolean(version)
  const meets = available && compareSemverLike(version, CODEX_0_135_VERSION) >= 0
  const doctorText = input.doctorText || ''
  const permissionsText = input.permissionsText || ''
  const execHelp = input.execHelp || ''
  const resumeHelp = input.resumeHelp || ''
  const doctorDetected = /environment|terminal|app[- ]?server|thread|git/i.test(doctorText)
  const profileDetected = /permission.+profile|permissions.+profile|--permissions-profile/i.test(`${permissionsText}\n${execHelp}`)
  const zshDetected = /zsh|shell helper|patched helper/i.test(doctorText)
  const resumeDetected = /cwd|working directory|workspace|resume|session/i.test(`${resumeHelp}\n${doctorText}`)
  const localOrBaseline = (detected: boolean): Codex0135CapabilityStatus => detected ? 'detected' : meets ? 'release_baseline' : available ? 'blocked' : 'unavailable'
  const baselineOnly: Codex0135CapabilityStatus = meets ? 'release_baseline' : available ? 'blocked' : 'unavailable'
  return [
    {
      id: 'codex_doctor_richer_diagnostics',
      priority: 'P0',
      status: localOrBaseline(doctorDetected),
      detector: '`codex doctor` includes environment/Git/terminal/app-server/thread diagnostics.',
      notes: [doctorDetected ? 'Local doctor output exposed richer diagnostics terms.' : 'Local doctor output did not expose all richer diagnostics terms.']
    },
    {
      id: 'named_permission_profiles',
      priority: 'P0',
      status: localOrBaseline(profileDetected),
      detector: '`codex exec --help` or permission UI text exposes named permission profiles.',
      notes: [profileDetected ? 'Local permission profile surface detected.' : 'SKS records named permission profiles independently from config profiles.']
    },
    {
      id: 'bundled_patched_zsh_helper',
      priority: 'P0',
      status: localOrBaseline(zshDetected),
      detector: '`codex doctor` mentions shell helper/zsh helper diagnostics.',
      notes: [zshDetected ? 'Local doctor mentioned shell helper diagnostics.' : 'Recorded as release-baseline evidence when local text is not explicit.']
    },
    {
      id: 'resume_noninteractive_cwd_inventory',
      priority: 'P0',
      status: localOrBaseline(resumeDetected),
      detector: '`codex resume --help` or doctor output mentions cwd/workspace/session inventory.',
      notes: [resumeDetected ? 'Local resume/cwd wording detected.' : 'SKS adds its own resume/cwd truth inventory gate.']
    },
    {
      id: 'legacy_config_profile_removed',
      priority: 'P0',
      status: meets ? 'release_baseline' : available ? 'blocked' : 'unavailable',
      detector: '0.135 release baseline removes legacy config-profile consumers.',
      notes: ['SKS project-local config policy keeps config profiles separate from permission profiles.']
    },
    {
      id: 'mcp_tool_naming_centralized',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence; local CLI detection is not reliable.',
      notes: ['SKS adds a local MCP tool name normalizer gate.']
    },
    {
      id: 'responses_retry_centralized',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence; local CLI detection is not reliable.',
      notes: ['SKS adds a local retry policy centralization gate.']
    },
    {
      id: 'markdown_table_rendering',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence and local SKS markdown table helper.',
      notes: ['SKS reports can render stable markdown tables.']
    },
    {
      id: 'memory_runtime_state_separation',
      priority: 'P1',
      status: baselineOnly,
      detector: 'Release-baseline evidence and SKS runtime-state docs.',
      notes: ['TriWiki durable memory and runtime scratch state are documented separately.']
    }
  ]
}

export function codex0135Matrix(input: {
  version?: string | null
  available?: boolean
  doctorText?: string
  permissionsText?: string
  execHelp?: string
  resumeHelp?: string
  requireReal?: boolean
} = {}) {
  const capabilities = codex0135Capabilities(input)
  const version = parseCodexVersionText(input.version) || input.version || null
  const below = input.available !== false && version ? compareSemverLike(version, CODEX_0_135_VERSION) < 0 : false
  const blockers = [
    ...(input.requireReal && (!version || below) ? ['codex_0_135_required_but_not_detected'] : []),
    ...capabilities.filter((capability) => input.requireReal && capability.priority === 'P0' && (capability.status === 'blocked' || capability.status === 'unavailable')).map((capability) => `codex_0_135_capability_unavailable:${capability.id}`)
  ]
  return {
    schema: CODEX_0_135_SCHEMA,
    baseline: CODEX_0_135_BASELINE_TAG,
    required_version: CODEX_0_135_VERSION,
    release_evidence: CODEX_0_135_RELEASE_EVIDENCE,
    detected_version: version,
    available: input.available !== false && Boolean(version),
    require_real: input.requireReal === true,
    capabilities,
    ok: blockers.length === 0,
    warnings: !input.requireReal && (!version || below) ? [`Codex ${CODEX_0_135_BASELINE_TAG} not detected; release:check treats this as warning-only.`] : [],
    blockers
  }
}

export async function collectCodex0135LocalEvidence(opts: { codexBin?: string | null } = {}): Promise<Codex0135LocalEvidence> {
  const bin = opts.codexBin || await which('codex')
  if (!bin) {
    return {
      available: false,
      versionText: '',
      doctorText: '',
      permissionsText: '',
      execHelp: '',
      resumeHelp: '',
      warnings: ['codex_binary_missing']
    }
  }
  const run = async (args: string[]) => runProcess(bin, args, { timeoutMs: 10000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err.message || String(err)
  }))
  const [version, doctor, permissions, execHelp, resumeHelp] = await Promise.all([
    run(['--version']),
    run(['doctor']),
    run(['exec', '--help']),
    run(['exec', '--help']),
    run(['resume', '--help'])
  ])
  return {
    available: version.code === 0,
    versionText: `${version.stdout || ''}${version.stderr || ''}`.trim(),
    doctorText: `${doctor.stdout || ''}${doctor.stderr || ''}`,
    permissionsText: `${permissions.stdout || ''}${permissions.stderr || ''}`,
    execHelp: `${execHelp.stdout || ''}${execHelp.stderr || ''}`,
    resumeHelp: `${resumeHelp.stdout || ''}${resumeHelp.stderr || ''}`,
    warnings: [
      ...(doctor.code === 0 ? [] : ['codex_doctor_unavailable']),
      ...(execHelp.code === 0 ? [] : ['codex_exec_help_unavailable']),
      ...(resumeHelp.code === 0 ? [] : ['codex_resume_help_unavailable'])
    ]
  }
}
