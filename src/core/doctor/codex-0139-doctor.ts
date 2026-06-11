import path from 'node:path'
import { readJson } from '../fsx.js'

export async function readCodex0139DoctorRealProbeStatus(root: string) {
  const summary = await readJson(path.join(root, '.sneakoscope', 'codex-0139-real-probe-summary.json'), null)
  const result = await readJson(path.join(root, '.sneakoscope', 'codex-0139-real-probes.json'), null)
  return {
    schema: 'sks.doctor-codex-0139-real-probes.v1',
    codex_cli_version: result?.version_text || null,
    capability_version_flag: Boolean(result?.parsed_version && String(result.parsed_version).startsWith('0.139')),
    real_probes_last_run_status: summary ? (summary.ok ? 'ok' : 'blocked') : 'not_run',
    skipped_probes: result?.skipped || [],
    strict_probe_command: 'npm run codex:0139-real-probes:require-real',
    unsafe_auto_fix: false
  }
}
