import { findCodexBinary } from '../codex-adapter.js'
import { nowIso, runProcess } from '../fsx.js'

export const CODEX_DOCTOR_BRIDGE_SCHEMA = 'sks.codex-doctor-bridge.v2'
export type DoctorDisposition = 'pass' | 'warn' | 'block'

export interface NormalizedDoctorCheck {
  id: string
  category: string
  status: string
  summary: string
  remediation: string
  severity: 'blocking' | 'warning' | 'informational'
  issue: string
}

export interface CodexDoctorBridgeReport {
  schema: typeof CODEX_DOCTOR_BRIDGE_SCHEMA
  generated_at: string
  available: boolean
  exit_code: number | null
  process_exit_code: number | null
  disposition: DoctorDisposition
  semantic_ok: boolean
  source_format: 'json' | 'text-fallback'
  blocking_checks: NormalizedDoctorCheck[]
  warning_checks: NormalizedDoctorCheck[]
  informational_checks: NormalizedDoctorCheck[]
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
      process_exit_code: null,
      disposition: opts.required ? 'block' : 'warn',
      semantic_ok: !opts.required,
      source_format: 'text-fallback',
      blocking_checks: opts.required ? [normalizedIssue('codex_doctor_binary_missing', 'runtime', 'blocked', 'Codex binary missing')] : [],
      warning_checks: opts.required ? [] : [normalizedIssue('codex_doctor_binary_missing_optional', 'runtime', 'warning', 'Codex binary missing')],
      informational_checks: [],
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
  const result = await runProcess(bin, ['doctor', '--json'], { cwd: opts.cwd || process.cwd(), timeoutMs: 60000, maxOutputBytes: 256 * 1024 })
  const text = redactDoctorText(`${result.stdout}\n${result.stderr}`)
  const parsed = parseDoctorJson(result.stdout)
  const checks = parsed?.checks && typeof parsed.checks === 'object' ? Object.values(parsed.checks) : []
  const normalizedChecks = checks.map(normalizeDoctorCheck)
  const failed = result.code !== 0
  const failedChecks = normalizedChecks.filter((check) => ['fail', 'error', 'blocked', 'unavailable'].includes(check.status))
  const installUpdateMismatchOnly = failedChecks.length > 0
    && failedChecks.every((check) => ['install', 'updates'].includes(check.category))
    && failedChecks.every((check) => /different (?:install|npm install)|update would target|package root/i.test(`${check.summary}\n${check.remediation}`))
  const hasWarning = checks.some((check: any) => String(check?.status || '').toLowerCase() === 'warning')
  const hasProblem = /fail|failed|error|blocked|unavailable/i.test(text)
  const semantic = classifyDoctorResult({
    exitCode: result.code,
    parsed: Boolean(parsed),
    failed,
    failedChecks,
    normalizedChecks,
    installUpdateMismatchOnly,
    hasWarning,
    hasProblem
  })
  const report = {
    schema: CODEX_DOCTOR_BRIDGE_SCHEMA,
    generated_at: nowIso(),
    available: true,
    exit_code: result.code,
    process_exit_code: result.code,
    disposition: semantic.disposition,
    semantic_ok: semantic.disposition !== 'block',
    source_format: parsed ? 'json' : 'text-fallback',
    blocking_checks: semantic.blocking_checks,
    warning_checks: semantic.warning_checks,
    informational_checks: semantic.informational_checks,
    environment_diagnostics_ok: checks.length ? categoryOk(normalizedChecks, ['auth', 'config', 'install', 'mcp', 'network', 'reachability', 'runtime', 'sandbox', 'search', 'system', 'updates', 'websocket']) : !failed && fieldOk(text, 'environment'),
    git_diagnostics_ok: checks.length ? categoryOk(normalizedChecks, ['git']) : !failed && fieldOk(text, 'git'),
    terminal_diagnostics_ok: checks.length ? categoryOk(normalizedChecks, ['terminal', 'title']) : !failed && fieldOk(text, 'terminal'),
    app_server_diagnostics_ok: checks.length ? categoryOk(normalizedChecks, ['app-server']) : !failed && fieldOk(text, 'app[- ]?server|app server'),
    thread_inventory_ok: checks.length ? categoryOk(normalizedChecks, ['threads']) : !failed && fieldOk(text, 'thread|session'),
    stdout_tail: redactDoctorText(String(result.stdout || '')).slice(-12000),
    stderr_tail: redactDoctorText(String(result.stderr || '')).slice(-12000),
    blockers: semantic.blockers,
    warnings: semantic.warnings
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

function parseDoctorJson(text: string): any | null {
  try {
    const parsed = JSON.parse(String(text || '').trim())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function categoryOk(checks: NormalizedDoctorCheck[], categories: string[]): boolean {
  const wanted = new Set(categories)
  const matched = checks.filter((check) => wanted.has(check.category))
  if (!matched.length) return true
  return matched.every((check) => check.severity !== 'blocking')
}

function doctorScore(report: CodexDoctorBridgeReport | null): number {
  if (!report) return 0
  return [
    report.available,
    report.semantic_ok,
    report.environment_diagnostics_ok,
    report.git_diagnostics_ok,
    report.terminal_diagnostics_ok,
    report.app_server_diagnostics_ok,
    report.thread_inventory_ok
  ].filter(Boolean).length
}

function classifyDoctorResult(input: {
  exitCode: number | null
  parsed: boolean
  failed: boolean
  failedChecks: NormalizedDoctorCheck[]
  normalizedChecks: NormalizedDoctorCheck[]
  installUpdateMismatchOnly: boolean
  hasWarning: boolean
  hasProblem: boolean
}) {
  const warningChecks = input.normalizedChecks.filter((check) => check.severity === 'warning')
  const informationalChecks = input.normalizedChecks.filter((check) => check.severity === 'informational')
  let blockingChecks = input.failedChecks.filter((check) => check.severity === 'blocking')
  const warnings: string[] = warningChecks.map((check) => check.issue)
  if (input.installUpdateMismatchOnly) {
    warnings.push('codex_doctor_install_update_path_mismatch')
    blockingChecks = []
  }
  if (!input.parsed && input.failed) {
    blockingChecks = [normalizedIssue('codex_doctor_unparseable_nonzero_result', 'runtime', 'blocked', 'Codex doctor exited non-zero and did not return parseable JSON')]
  }
  if (input.hasWarning || (input.hasProblem && !input.failed)) warnings.push('codex_doctor_reported_warnings')
  const blockers = [...new Set(blockingChecks.map((check) => check.issue))]
  const disposition: DoctorDisposition = blockers.length ? 'block' : warnings.length || input.failed ? 'warn' : 'pass'
  return {
    disposition,
    blockers,
    warnings: [...new Set(warnings)],
    blocking_checks: blockingChecks,
    warning_checks: warningChecks,
    informational_checks: informationalChecks
  }
}

function normalizeDoctorCheck(check: any): NormalizedDoctorCheck {
  const category = String(check?.category || check?.group || 'unknown').toLowerCase()
  const status = String(check?.status || 'unknown').toLowerCase()
  const summary = redactDoctorText(String(check?.summary || check?.message || check?.name || ''))
  const remediation = redactDoctorText(String(check?.remediation || check?.next_action || ''))
  const issue = classifyIssue(category, status, `${summary}\n${remediation}`)
  const severity = issueSeverity(category, status, issue)
  return {
    id: String(check?.id || check?.name || issue),
    category,
    status,
    summary,
    remediation,
    severity,
    issue
  }
}

function classifyIssue(category: string, status: string, text: string): string {
  if (/different (?:install|npm install)|update would target|package root/i.test(text) && ['install', 'updates'].includes(category)) return 'codex_doctor_install_update_path_mismatch'
  if (/parse|toml|config/i.test(text) || category === 'config') return 'codex_doctor_config_parse_failed'
  if (/auth|login|credential/i.test(text) || category === 'auth') return 'codex_doctor_auth_required'
  if (/binary|version|runtime|app-server|initialize|protocol/i.test(text) || ['runtime', 'app-server'].includes(category)) return 'codex_doctor_runtime_unavailable'
  if (/mcp|transport/i.test(text) || category === 'mcp') return 'codex_doctor_mcp_transport_invalid'
  if (/thread|sqlite|store|corrupt/i.test(text) || category === 'threads') return 'codex_doctor_thread_store_unavailable'
  if (['warning', 'warn'].includes(status)) return `codex_doctor_${safeIssuePart(category)}_warning`
  return `codex_doctor_${safeIssuePart(category)}_${safeIssuePart(status || 'issue')}`
}

function issueSeverity(category: string, status: string, issue: string): NormalizedDoctorCheck['severity'] {
  if (['ok', 'pass', 'passed', 'success', 'info', 'skipped'].includes(status)) return 'informational'
  if (issue === 'codex_doctor_install_update_path_mismatch') return 'warning'
  if (['warning', 'warn'].includes(status)) return 'warning'
  if (['app', 'gui', 'plugin', 'marketplace', 'terminal', 'title'].includes(category)) return 'warning'
  if (['fail', 'error', 'blocked', 'unavailable'].includes(status)) return 'blocking'
  return 'informational'
}

function normalizedIssue(issue: string, category: string, status: string, summary: string): NormalizedDoctorCheck {
  return {
    id: issue,
    category,
    status,
    summary: redactDoctorText(summary),
    remediation: '',
    severity: status === 'warning' ? 'warning' : status === 'blocked' ? 'blocking' : 'informational',
    issue
  }
}

function safeIssuePart(value: string): string {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}

function redactDoctorText(text: string): string {
  return String(text || '')
    .replace(/\/Users\/[^/\s]+/g, '~')
    .replace(/\/home\/[^/\s]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, '~')
    .replace(/(sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*)[^\s"']+/g, '$1[REDACTED]')
}
