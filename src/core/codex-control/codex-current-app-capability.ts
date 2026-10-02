import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { meetsCodexFloor, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

// `/app` handoff only needs a Codex at or above the supported floor; everything else
// the Codex App offers is Codex's own to test.
export interface CodexCurrentAppCapability {
  schema: 'sks.codex-current-app-capability.v1'
  ok: boolean
  codex_bin: string | null
  version_text: string | null
  parsed_version: string | null
  supports_app_handoff: boolean
  blockers: string[]
}

export async function detectCodexCurrentAppCapability(input: { codexBin?: string | null; versionText?: string | null } = {}): Promise<CodexCurrentAppCapability> {
  const codexBin = input.codexBin || process.env.CODEX_BIN || await findCodexBinary()
  const versionText = input.versionText !== undefined ? input.versionText : await readCodexVersionText(codexBin)
  const parsed = parseCodexVersionText(versionText)
  const currentRelease = meetsCodexFloor(parsed)
  const blockers = [
    ...(!codexBin ? ['codex_cli_missing'] : []),
    ...(currentRelease ? [] : ['codex_current_release_required_for_app_plugin_features'])
  ]
  return {
    schema: 'sks.codex-current-app-capability.v1',
    ok: currentRelease && blockers.length === 0,
    codex_bin: codexBin || null,
    version_text: versionText || null,
    parsed_version: parsed,
    supports_app_handoff: currentRelease,
    blockers
  }
}

export async function writeCodexCurrentAppCapabilityArtifacts(root: string, input: { missionId?: string | null; codexBin?: string | null } = {}) {
  const capability = await detectCodexCurrentAppCapability({ codexBin: input.codexBin || null })
  const report = { ...capability, generated_at: nowIso() }
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-current-app-capability.json')
  await writeJsonAtomic(rootArtifact, report)
  let missionArtifact: string | null = null
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-current-app-capability.json')
    await writeJsonAtomic(missionArtifact, report)
  }
  return { report, root_artifact: rootArtifact, mission_artifact: missionArtifact }
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
