import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export interface Codex0138Capability {
  schema: 'sks.codex-0138-capability.v1'
  ok: boolean
  codex_bin: string | null
  version_text: string | null
  parsed_version: string | null
  supports_app_handoff: boolean
  supports_plugin_json: boolean
  supports_image_path_exposure: boolean
  supports_model_defined_efforts: boolean
  supports_app_server_token_usage: boolean
  supports_v2_pat_auth: boolean
  supports_oauth_mcp_prerefresh: boolean
  blockers: string[]
}

export async function detectCodex0138Capability(input: { codexBin?: string | null } = {}): Promise<Codex0138Capability> {
  const fake = process.env.SKS_CODEX_0138_FAKE === '1'
  const codexBin = fake
    ? input.codexBin || process.env.CODEX_BIN || 'codex'
    : input.codexBin || process.env.CODEX_BIN || await findCodexBinary()
  const versionText = fake
    ? String(process.env.SKS_CODEX_VERSION_FAKE || 'codex-cli 0.138.0')
    : await readCodexVersionText(codexBin)
  const parsed = parseCodexVersion(versionText)
  const atLeast138 = Boolean(parsed && semverGte(parsed, '0.138.0'))
  const blockers = [
    ...(!codexBin ? ['codex_cli_missing'] : []),
    ...(atLeast138 ? [] : ['codex_0_138_required_for_app_plugin_features'])
  ]
  return {
    schema: 'sks.codex-0138-capability.v1',
    ok: atLeast138,
    codex_bin: codexBin || null,
    version_text: versionText || null,
    parsed_version: parsed,
    supports_app_handoff: atLeast138,
    supports_plugin_json: atLeast138,
    supports_image_path_exposure: atLeast138,
    supports_model_defined_efforts: atLeast138,
    supports_app_server_token_usage: atLeast138,
    supports_v2_pat_auth: atLeast138,
    supports_oauth_mcp_prerefresh: atLeast138,
    blockers
  }
}

export async function writeCodex0138CapabilityArtifacts(root: string, input: { missionId?: string | null; codexBin?: string | null } = {}) {
  const capability = await detectCodex0138Capability({ codexBin: input.codexBin || null })
  const report = { ...capability, generated_at: nowIso() }
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-0138-capability.json')
  await writeJsonAtomic(rootArtifact, report)
  let missionArtifact: string | null = null
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-0138-capability.json')
    await writeJsonAtomic(missionArtifact, report)
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact }
}

export function parseCodexVersion(text: unknown): string | null {
  return parseCodexVersionText(text)
}

export function semverGte(actual: unknown, minimum: unknown): boolean {
  return compareSemverLike(actual, minimum) >= 0
}

async function readCodexVersionText(codexBin: string | null): Promise<string | null> {
  if (!codexBin) return null
  const result = await runProcess(codexBin, ['--version'], { timeoutMs: 10_000, maxOutputBytes: 16 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
  return result.code === 0 ? text : text || null
}
