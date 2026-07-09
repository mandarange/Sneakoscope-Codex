// @ts-nocheck
export const HIGH_RISK_CONTRACT_TARGETS = [
  'super-search fetch',
  'commit-and-push',
  'rollback apply',
  'doctor --fix',
  'update now --dry-run',
  'db',
  'mad-sks'
] as const

export const HIGH_RISK_CONTRACT_REPORT_SCHEMA = 'sks.high-risk-contracts.v2'

export function highRiskNegativeFixtures() {
  return [
    {
      target: 'super-search fetch',
      fixture: 'private_url_without_allow_local',
      input: { url: 'http://127.0.0.1:4319/docs', allowLocal: false },
      blocker: 'direct_url_fetch_ssrf_blocked'
    },
    {
      target: 'commit-and-push',
      fixture: 'missing_remote',
      input: { remotes: [], stagedChanges: ['src/a.ts'], unstagedChanges: [] },
      blocker: 'git_remote_missing'
    },
    {
      target: 'commit-and-push',
      fixture: 'dirty_staged_ambiguity',
      input: { remotes: ['origin'], stagedChanges: ['src/a.ts'], unstagedChanges: ['src/a.ts'] },
      blocker: 'dirty_staged_ambiguity'
    },
    {
      target: 'rollback apply',
      fixture: 'missing_explicit_rollback_id',
      input: { action: 'apply', rollbackId: '' },
      blocker: 'rollback_id_required'
    },
    {
      target: 'doctor --fix',
      fixture: 'user_owned_file_without_sks_marker',
      input: { fix: true, fileText: 'user config\n', sksManagedMarker: false },
      blocker: 'user_owned_file_without_sks_marker'
    },
    {
      target: 'update now --dry-run',
      fixture: 'dry_run_attempts_real_install',
      input: { dryRun: true, plannedActions: ['npm_install_global'] },
      blocker: 'dry_run_attempted_real_install'
    },
    {
      target: 'db',
      fixture: 'destructive_sql_without_mad_sks',
      input: { sql: 'DROP TABLE users;', madSksSqlPlane: false },
      blocker: 'destructive_sql_requires_mad_sks'
    },
    {
      target: 'mad-sks',
      fixture: 'permission_not_restored',
      input: { permissionRestored: false, readBackProof: true },
      blocker: 'mad_sks_permission_not_restored'
    },
    {
      target: 'mad-sks',
      fixture: 'read_back_proof_missing',
      input: { permissionRestored: true, readBackProof: false },
      blocker: 'mad_sks_read_back_proof_missing'
    }
  ]
}

export function evaluateHighRiskFixture(fixture: any) {
  const blockers = highRiskBlockers(fixture.target, fixture.input || {})
  const expectedBlocker = fixture.blocker
  const blocked = expectedBlocker ? blockers.includes(expectedBlocker) : blockers.length > 0
  return {
    target: fixture.target,
    fixture: fixture.fixture,
    ok: false,
    status: blocked ? 'blocked_expected' : 'contract_missed_block',
    blocked,
    blockers
  }
}

export function evaluateHighRiskFixtures(fixtures: any[] = highRiskNegativeFixtures()) {
  return fixtures.map((fixture) => evaluateHighRiskFixture(fixture))
}

export function highRiskCliNegativeSmokeSpecs() {
  return [
    {
      target: 'super-search fetch',
      argv: ['sks', 'super-search', 'fetch', 'http://127.0.0.1:1', '--json'],
      expected_blockers: ['direct_url_fetch_ssrf_blocked']
    },
    {
      target: 'commit-and-push',
      argv: ['sks', 'commit-and-push', '--json'],
      expected_blockers: ['git_remote_missing']
    },
    {
      target: 'rollback apply',
      argv: ['sks', 'rollback', 'apply', '--yes', '--json'],
      expected_blockers: ['rollback_id_required']
    },
    {
      target: 'doctor --fix',
      argv: ['sks', 'doctor', '--fix', '--json', '--profile', 'fast', '--machine-only'],
      expected_blockers: ['user_owned_file_without_sks_marker']
    },
    {
      target: 'update now --dry-run',
      argv: ['sks', 'update', 'now', '--dry-run', '--json'],
      expected_blockers: ['dry_run_no_install_executed']
    },
    {
      target: 'db',
      argv: ['sks', 'db', 'check', '--sql', 'DROP TABLE users;', '--json'],
      expected_blockers: ['destructive_sql_requires_mad_sks']
    },
    {
      target: 'mad-sks',
      argv: ['sks', 'mad-sks', 'proof', '--json'],
      expected_blockers: ['mad_sks_read_back_proof_missing']
    }
  ]
}

export function evaluateHighRiskCliSmokeResult(spec: any, run: any) {
  const parsed = parseCliJson(run.stdout)
  const text = `${run.stdout || ''}\n${run.stderr || ''}`
  const blockers = [...new Set([
    ...extractBlockers(parsed),
    ...blockersFromCliText(spec.target, text, parsed, run),
    ...(run.timed_out ? ['cli_smoke_timeout'] : [])
  ])]
  const blocked = blockers.some((blocker) => (spec.expected_blockers || []).some((expected: string) => blocker === expected || blocker.startsWith(`${expected}:`)))
  return {
    target: spec.target,
    argv: spec.argv,
    exit_code: run.exit_code,
    blocked,
    blockers,
    diagnostics: run.diagnostics || null,
    stdout_excerpt: excerpt(run.stdout),
    stderr_excerpt: excerpt(run.stderr)
  }
}

function parseCliJson(text: any) {
  const value = String(text || '').trim()
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    const start = value.indexOf('{')
    const end = value.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1))
      } catch {}
    }
    return null
  }
}

function extractBlockers(value: any): string[] {
  const out: string[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    for (const key of ['blockers', 'issues', 'reasons', 'missing']) {
      if (Array.isArray(node[key])) out.push(...node[key].map((entry: any) => String(entry)))
    }
    if (node.reason) out.push(String(node.reason))
    if (node.status === 'blocked') out.push('status_blocked')
    if (node.ok === false) out.push('ok_false')
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') visit(child)
    }
  }
  visit(value)
  return out.filter(Boolean)
}

function blockersFromCliText(target: string, text: string, parsed: any, run: any) {
  const blockers: string[] = []
  if (/SKS project migration blocked|update_migration_lock_held/i.test(text)) blockers.push('update_migration_lock_held')
  if (target === 'super-search fetch' && /direct_url_fetch_ssrf_blocked/i.test(text)) blockers.push('direct_url_fetch_ssrf_blocked')
  if (target === 'commit-and-push' && /No configured push destination|No remote configured|fatal:.*remote|git_push_failed/i.test(text)) blockers.push('git_remote_missing')
  if (target === 'rollback apply' && /Unknown rollback id: (?:missing|--yes)|rollback.*missing/i.test(text)) blockers.push('rollback_id_required')
  if (target === 'doctor --fix' && /doctor_touched_user_owned_file_without_sks_marker/i.test(text)) blockers.push('doctor_touched_user_owned_file_without_sks_marker')
  else if (target === 'doctor --fix' && /(?:^|\s)user_owned_file_without_sks_marker(?:\s|$)/i.test(text)) blockers.push('user_owned_file_without_sks_marker')
  if (target === 'db' && /drop_table|drop_statement|destructive/i.test(text)) blockers.push('destructive_sql_requires_mad_sks')
  if (target === 'mad-sks' && /mad-sks-proof\.json|status.*missing|proof.*missing/i.test(text)) blockers.push('mad_sks_read_back_proof_missing')
  if (target === 'update now --dry-run') {
    const installCode = parsed?.install_code
    const dryRunStage = Array.isArray(parsed?.stages)
      && parsed.stages.some((stage: any) => stage?.id === 'npm_install' && stage?.status === 'dry_run')
    if (parsed?.status === 'dry_run' && installCode == null && dryRunStage) blockers.push('dry_run_no_install_executed')
    if (installCode !== null && installCode !== undefined) blockers.push('dry_run_attempted_real_install')
  }
  if (run.exit_code !== 0 && blockers.length === 0) blockers.push('cli_negative_smoke_failed_closed')
  return blockers
}

function excerpt(value: any) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

export function highRiskBlockers(target: string, input: any = {}) {
  switch (target) {
    case 'super-search fetch':
      return superSearchFetchBlockers(input)
    case 'commit-and-push':
      return commitAndPushBlockers(input)
    case 'rollback apply':
      return rollbackApplyBlockers(input)
    case 'doctor --fix':
      return doctorFixBlockers(input)
    case 'update now --dry-run':
      return updateNowDryRunBlockers(input)
    case 'db':
      return dbBlockers(input)
    case 'mad-sks':
      return madSksBlockers(input)
    default:
      return ['unknown_high_risk_target']
  }
}

function superSearchFetchBlockers(input: any) {
  if (input.allowLocal === true) return []
  const url = String(input.url || '')
  if (/^https?:\/\/(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i.test(url)) return ['direct_url_fetch_ssrf_blocked']
  if (/^https?:\/\/172\.(?:1[6-9]|2\d|3[0-1])\./i.test(url)) return ['direct_url_fetch_ssrf_blocked']
  if (/^https?:\/\/\[?(?:fc|fd|fe80:)/i.test(url)) return ['direct_url_fetch_ssrf_blocked']
  return []
}

function commitAndPushBlockers(input: any) {
  const blockers = []
  if (!Array.isArray(input.remotes) || input.remotes.length === 0) blockers.push('git_remote_missing')
  const staged = new Set(input.stagedChanges || [])
  const ambiguous = (input.unstagedChanges || []).some((file: string) => staged.has(file))
  if (ambiguous) blockers.push('dirty_staged_ambiguity')
  return blockers
}

function rollbackApplyBlockers(input: any) {
  return input.action === 'apply' && !String(input.rollbackId || '').trim() ? ['rollback_id_required'] : []
}

function doctorFixBlockers(input: any) {
  return input.fix === true && input.sksManagedMarker !== true ? ['user_owned_file_without_sks_marker'] : []
}

function updateNowDryRunBlockers(input: any) {
  return input.dryRun === true && (input.plannedActions || []).some((action: string) => /install|write|mutat/i.test(action))
    ? ['dry_run_attempted_real_install']
    : []
}

function dbBlockers(input: any) {
  const sql = String(input.sql || '')
  const destructive = /\b(?:drop|delete|truncate|alter\s+table|create\s+policy|drop\s+policy|execute_sql|apply_migration)\b/i.test(sql)
  return destructive && input.madSksSqlPlane !== true ? ['destructive_sql_requires_mad_sks'] : []
}

function madSksBlockers(input: any) {
  const blockers = []
  if (input.permissionRestored !== true) blockers.push('mad_sks_permission_not_restored')
  if (input.readBackProof !== true) blockers.push('mad_sks_read_back_proof_missing')
  return blockers
}
