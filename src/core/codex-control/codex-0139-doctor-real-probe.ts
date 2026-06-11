import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { ensureDir, runProcess } from '../fsx.js'
import { redactCodexDoctorEnvDetails } from './codex-0139-capability.js'
import { codex0139ProbeTail, skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

export async function runCodex0139DoctorEnvRealProbe(input: {
  root: string
  requireReal?: boolean
  timeoutMs?: number
  codexBin?: string | null
}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  const codexBin = input.codexBin || await findCodexBinary()
  if (!codexBin) return skippedCodex0139Probe('codex_cli_missing')
  const tempDir = path.join(input.root, '.sneakoscope', 'tmp', 'codex-0139-real-probes', `doctor-${Date.now()}`)
  await ensureDir(tempDir)
  const env = {
    ...process.env,
    EDITOR: 'vim',
    PAGER: 'less',
    OPENAI_API_KEY: 'sk-test-secret-value',
    CODEX_AUTH_TOKEN: 'test-secret-token'
  }
  const result = await runProcess(codexBin, ['doctor', '--json'], {
    cwd: tempDir,
    env,
    timeoutMs: input.timeoutMs || 60000,
    maxOutputBytes: 512 * 1024,
    stdoutFile: path.join(tempDir, 'codex-doctor.stdout.json'),
    stderrFile: path.join(tempDir, 'codex-doctor.stderr.log')
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const combined = `${(result as any).stdout || ''}\n${(result as any).stderr || ''}`
  const redacted = redactCodexDoctorEnvDetails(parseJson((result as any).stdout) || combined)
  const redactedText = JSON.stringify(redacted)
  const editorPagerPresent = /(EDITOR|editor|vim)/.test(combined) && /(PAGER|pager|less)/.test(combined)
  const rawSecretAbsent = !combined.includes('sk-test-secret-value') && !combined.includes('test-secret-token')
  const redactedMarkerOrOmitted = rawSecretAbsent || /redacted|omitted|hidden/i.test(combined)
  const ok = (result as any).code === 0 && editorPagerPresent && rawSecretAbsent && redactedMarkerOrOmitted
  return {
    ok,
    mode: 'actual-cli',
    command_line: [codexBin, 'doctor', '--json'],
    duration_ms: Date.now() - started,
    stdout_tail: codex0139ProbeTail((result as any).stdout),
    stderr_tail: codex0139ProbeTail((result as any).stderr),
    artifact_paths: [tempDir],
    evidence: {
      editor_pager_present: editorPagerPresent,
      raw_secret_absent: rawSecretAbsent,
      redacted_marker_or_omitted: redactedMarkerOrOmitted,
      redacted_sample_contains_secret: redactedText.includes('sk-test-secret-value') || redactedText.includes('test-secret-token')
    },
    blockers: ok ? [] : ['codex_doctor_env_redaction_real_probe_failed']
  }
}

function parseJson(text: string) {
  try {
    return JSON.parse(String(text || ''))
  } catch {
    return null
  }
}
