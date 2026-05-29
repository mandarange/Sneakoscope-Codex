import { findCodexBinary } from '../codex-adapter.js'
import { nowIso, runProcess } from '../fsx.js'

export const CODEX_DOCTOR_BRIDGE_SCHEMA = 'sks.codex-doctor-bridge.v1'

export interface CodexDoctorBridgeReport {
  schema: typeof CODEX_DOCTOR_BRIDGE_SCHEMA
  generated_at: string
  available: boolean
  exit_code: number | null
  environment_diagnostics_ok: boolean
  git_diagnostics_ok: boolean
  terminal_diagnostics_ok: boolean
  app_server_diagnostics_ok: boolean
  thread_inventory_ok: boolean
  stdout_tail: string
  stderr_tail: string
  blockers: string[]
  warnings: string[]
}

export async function runCodexDoctorBridge(opts: { codexBin?: string | null; cwd?: string; required?: boolean } = {}): Promise<CodexDoctorBridgeReport> {
  const bin = opts.codexBin || await findCodexBinary()
  if (!bin) {
    return {
      schema: CODEX_DOCTOR_BRIDGE_SCHEMA,
      generated_at: nowIso(),
      available: false,
      exit_code: null,
      environment_diagnostics_ok: false,
      git_diagnostics_ok: false,
      terminal_diagnostics_ok: false,
      app_server_diagnostics_ok: false,
      thread_inventory_ok: false,
      stdout_tail: '',
      stderr_tail: '',
      blockers: opts.required ? ['codex_doctor_binary_missing'] : [],
      warnings: opts.required ? [] : ['codex_doctor_binary_missing_optional']
    }
  }
  const result = await runProcess(bin, ['doctor'], { cwd: opts.cwd || process.cwd(), timeoutMs: 15000, maxOutputBytes: 128 * 1024 })
  const text = `${result.stdout}\n${result.stderr}`
  const failed = result.code !== 0
  const hasProblem = /fail|failed|error|blocked|unavailable/i.test(text)
  const report = {
    schema: CODEX_DOCTOR_BRIDGE_SCHEMA,
    generated_at: nowIso(),
    available: true,
    exit_code: result.code,
    environment_diagnostics_ok: fieldOk(text, 'environment'),
    git_diagnostics_ok: fieldOk(text, 'git'),
    terminal_diagnostics_ok: fieldOk(text, 'terminal'),
    app_server_diagnostics_ok: fieldOk(text, 'app[- ]?server|app server'),
    thread_inventory_ok: fieldOk(text, 'thread|session'),
    stdout_tail: String(result.stdout || '').slice(-12000),
    stderr_tail: String(result.stderr || '').slice(-12000),
    blockers: opts.required && failed ? ['codex_doctor_failed_required'] : [],
    warnings: [
      ...(!opts.required && failed ? ['codex_doctor_failed_optional'] : []),
      ...(hasProblem && !failed ? ['codex_doctor_reported_warnings'] : [])
    ]
  } satisfies CodexDoctorBridgeReport
  return report
}

export function compareCodexDoctorBridge(before: CodexDoctorBridgeReport | null, after: CodexDoctorBridgeReport | null) {
  const beforeScore = doctorScore(before)
  const afterScore = doctorScore(after)
  return {
    schema: 'sks.codex-doctor-bridge-diff.v1',
    generated_at: nowIso(),
    ok: afterScore >= beforeScore,
    before_score: beforeScore,
    after_score: afterScore,
    worse_after_rewrite: afterScore < beforeScore,
    blockers: afterScore < beforeScore ? ['codex_doctor_regressed_after_rewrite'] : []
  }
}

function fieldOk(text: string, pattern: string): boolean {
  const re = new RegExp(pattern, 'i')
  if (!re.test(text)) return true
  const lines = text.split(/\n+/).filter((line) => re.test(line)).join('\n')
  return !/fail|failed|error|blocked|unavailable/i.test(lines)
}

function doctorScore(report: CodexDoctorBridgeReport | null): number {
  if (!report) return 0
  return [
    report.available,
    report.exit_code === 0,
    report.environment_diagnostics_ok,
    report.git_diagnostics_ok,
    report.terminal_diagnostics_ok,
    report.app_server_diagnostics_ok,
    report.thread_inventory_ok
  ].filter(Boolean).length
}
