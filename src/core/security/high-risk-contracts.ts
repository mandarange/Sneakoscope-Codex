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
