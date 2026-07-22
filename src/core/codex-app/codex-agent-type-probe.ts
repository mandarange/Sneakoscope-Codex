import fs from 'node:fs/promises'
import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { type CodexAgentRolePayload, type CodexAgentTypeProbe, isRecord } from './codex-app-types.js'

export async function probeCodexAgentTypeSupport(root: string, input: {
  codexBin?: string | null
  env?: NodeJS.ProcessEnv
  writeReport?: boolean
} = {}): Promise<CodexAgentTypeProbe> {
  const env = input.env || process.env
  const fixture = await fixtureSchemaProbe(env)
  if (fixture) return persist(root, fixture, input.writeReport !== false)

  const schema = await readSchemaFromEnv(env)
  if (schema) return persist(root, probeSchema(schema.value, schema.source, schema.schemaPath), input.writeReport !== false)

  const doctor = await probeDoctorJson(input.codexBin, env)
  if (doctor.source !== 'unknown') return persist(root, doctor, input.writeReport !== false)

  const help = await probeHelp(input.codexBin, env)
  if (help.source !== 'unknown') return persist(root, help, input.writeReport !== false)

  const envProbe = envFallbackProbe(env)
  if (envProbe) return persist(root, envProbe, input.writeReport !== false)

  return persist(root, {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: true,
    supported: false,
    source: 'unknown',
    spawn_tool_name: 'unknown',
    schema_path: null,
    evidence: [],
    blockers: [],
    warnings: ['agent_type_support_unknown_message_role_fallback']
  }, input.writeReport !== false)
}

export function agentRolePayloadFor(role: string, probe: CodexAgentTypeProbe): CodexAgentRolePayload {
  if (probe.supported) return { strategy: 'agent_type', agent_type: role, probe_artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json' }
  return {
    strategy: 'message-role',
    message_role_prefix: `Role: ${role}. Use this as a message-level role because native agent_type is unavailable or unverified.`,
    probe_artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json'
  }
}

async function fixtureSchemaProbe(env: NodeJS.ProcessEnv): Promise<CodexAgentTypeProbe | null> {
  const raw = env.SKS_CODEX_AGENT_TYPE_FIXTURE
  if (!raw) return null
  const supported = raw === '1' || raw === 'supported' || raw === 'true'
  return {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: true,
    supported,
    source: 'fixture',
    spawn_tool_name: supported ? 'spawn_agent' : 'unknown',
    schema_path: supported ? 'fixture.spawn_agent.parameters.agent_type' : null,
    evidence: [`fixture:${raw}`],
    blockers: [],
    warnings: []
  }
}

async function readSchemaFromEnv(env: NodeJS.ProcessEnv): Promise<{ value: unknown; source: CodexAgentTypeProbe['source']; schemaPath: string | null } | null> {
  if (env.SKS_CODEX_TOOL_SCHEMA_FILE) {
    const file = path.resolve(env.SKS_CODEX_TOOL_SCHEMA_FILE)
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    if (text) return { value: JSON.parse(text) as unknown, source: 'codex-tool-schema', schemaPath: file }
  }
  if (env.SKS_CODEX_TOOL_SCHEMA_JSON) {
    return { value: JSON.parse(env.SKS_CODEX_TOOL_SCHEMA_JSON) as unknown, source: 'codex-tool-schema', schemaPath: 'env:SKS_CODEX_TOOL_SCHEMA_JSON' }
  }
  return null
}

async function probeDoctorJson(codexBin: string | null | undefined, env: NodeJS.ProcessEnv): Promise<CodexAgentTypeProbe> {
  const bin = codexBin || env.CODEX_BIN || await findCodexBinary().catch(() => null)
  if (!bin) return unknownProbe(['codex_cli_missing'])
  const run = await runProcess(bin, ['doctor', '--json'], { env, timeoutMs: 8000, maxOutputBytes: 256 * 1024 }).catch(() => null)
  const text = `${run?.stdout || ''}${run?.stderr || ''}`.trim()
  if (!run || run.code !== 0 || !text) return unknownProbe(['codex_doctor_json_unavailable'])
  try {
    const parsed = JSON.parse(text) as unknown
    const probed = probeSchema(parsed, 'codex-doctor-json', 'doctor-json')
    return { ...probed, source: probed.supported ? 'codex-doctor-json' : 'unknown' }
  } catch {
    return unknownProbe(['codex_doctor_json_parse_failed'])
  }
}

async function probeHelp(codexBin: string | null | undefined, env: NodeJS.ProcessEnv): Promise<CodexAgentTypeProbe> {
  const bin = codexBin || env.CODEX_BIN || await findCodexBinary().catch(() => null)
  if (!bin) return unknownProbe(['codex_cli_missing'])
  const run = await runProcess(bin, ['--help'], { env, timeoutMs: 5000, maxOutputBytes: 128 * 1024 }).catch(() => null)
  const text = `${run?.stdout || ''}${run?.stderr || ''}`
  if (!run || run.code !== 0 || !text) return unknownProbe(['codex_help_unavailable'])
  // Codex 0.145+ stabilizes opt-in multi-agent V2; spawn_agent/agent_type remain
  // the native role surface under that backend.
  const multiAgentV2 = /\bmulti_agent_v2\b/.test(text)
  const supported = /\bagent_type\b/.test(text) && /\bspawn_agent\b/.test(text)
  return {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: true,
    supported,
    source: supported ? 'codex-help' : 'unknown',
    spawn_tool_name: supported ? 'spawn_agent' : 'unknown',
    schema_path: supported ? 'codex --help' : null,
    evidence: [
      ...(supported ? ['help_mentions_agent_type', 'help_mentions_spawn_agent'] : []),
      ...(multiAgentV2 ? ['help_mentions_multi_agent_v2'] : [])
    ],
    blockers: [],
    warnings: [
      ...(supported ? [] : ['agent_type_not_found_in_help'])
    ]
  }
}

function envFallbackProbe(env: NodeJS.ProcessEnv): CodexAgentTypeProbe | null {
  if (env.SKS_CODEX_AGENT_TYPE_SUPPORTED === undefined) return null
  if (env.SKS_CODEX_AGENT_TYPE_ALLOW_ENV_FALLBACK !== '1' && env.NODE_ENV !== 'test') {
    return {
      schema: 'sks.codex-agent-type-probe.v1',
      generated_at: nowIso(),
      ok: true,
      supported: false,
      source: 'env',
      spawn_tool_name: 'unknown',
      schema_path: null,
      evidence: [],
      blockers: [],
      warnings: ['env_agent_type_fallback_ignored_outside_test_mode']
    }
  }
  const supported = env.SKS_CODEX_AGENT_TYPE_SUPPORTED === '1'
  return {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: true,
    supported,
    source: 'env',
    spawn_tool_name: supported ? 'spawn_agent' : 'unknown',
    schema_path: supported ? 'env:SKS_CODEX_AGENT_TYPE_SUPPORTED' : null,
    evidence: [`env:SKS_CODEX_AGENT_TYPE_SUPPORTED=${env.SKS_CODEX_AGENT_TYPE_SUPPORTED}`],
    blockers: [],
    warnings: ['env_agent_type_fallback_test_only']
  }
}

function probeSchema(value: unknown, source: CodexAgentTypeProbe['source'], schemaPath: string | null): CodexAgentTypeProbe {
  const found = findAgentType(value)
  return {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: true,
    supported: found.supported,
    source,
    spawn_tool_name: found.tool,
    schema_path: found.path || schemaPath,
    evidence: found.supported
      ? [`agent_type:${found.path || 'found'}`, ...(found.multi_agent_v2_path ? [`multi_agent_v2:${found.multi_agent_v2_path}`] : [])]
      : ['agent_type_absent'],
    blockers: [],
    warnings: [
      ...(found.supported ? [] : ['agent_type_not_supported_message_role_fallback'])
    ]
  }
}

function findAgentType(
  value: unknown,
  trail: string[] = []
): {
  supported: boolean
  tool: 'spawn_agent' | 'unknown'
  path: string | null
  multi_agent_v2_path?: string | null
} {
  if (Array.isArray(value)) {
    let multiAgentPath: string | null = null
    for (let index = 0; index < value.length; index += 1) {
      const found = findAgentType(value[index], [...trail, String(index)])
      if (found.supported) return found
      if (!multiAgentPath && found.multi_agent_v2_path) multiAgentPath = found.multi_agent_v2_path
    }
    return { supported: false, tool: 'unknown', path: null, multi_agent_v2_path: multiAgentPath }
  }
  if (!isRecord(value)) return { supported: false, tool: 'unknown', path: null }
  const name = String(value.name || value.tool || value.id || '')
  const multiAgentV2 = name.includes('multi_agent_v2')
  const tool = name.includes('spawn_agent') ? 'spawn_agent' : 'unknown'
  if ('agent_type' in value || isRecord(value.properties) && 'agent_type' in value.properties) {
    return {
      supported: true,
      tool: tool === 'unknown' ? 'spawn_agent' : tool,
      path: [...trail, 'agent_type'].join('.'),
      multi_agent_v2_path: multiAgentV2 ? trail.join('.') || 'multi_agent_v2' : null
    }
  }
  let multiAgentPath: string | null = multiAgentV2 ? trail.join('.') || 'multi_agent_v2' : null
  for (const [key, entry] of Object.entries(value)) {
    const found = findAgentType(entry, [...trail, key])
    if (found.supported) {
      return {
        ...found,
        tool: found.tool === 'unknown' && tool !== 'unknown' ? tool : found.tool,
        multi_agent_v2_path: found.multi_agent_v2_path || multiAgentPath
      }
    }
    if (!multiAgentPath && found.multi_agent_v2_path) multiAgentPath = found.multi_agent_v2_path
  }
  return { supported: false, tool, path: null, multi_agent_v2_path: multiAgentPath }
}

function unknownProbe(blockers: string[]): CodexAgentTypeProbe {
  return {
    schema: 'sks.codex-agent-type-probe.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    supported: false,
    source: 'unknown',
    spawn_tool_name: 'unknown',
    schema_path: null,
    evidence: [],
    blockers,
    warnings: ['agent_type_support_unknown_message_role_fallback']
  }
}

async function persist(root: string, report: CodexAgentTypeProbe, writeReport: boolean): Promise<CodexAgentTypeProbe> {
  if (writeReport) await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-agent-type-probe.json'), report).catch(() => undefined)
  return report
}
