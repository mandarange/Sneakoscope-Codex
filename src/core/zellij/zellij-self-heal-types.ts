import { nowIso } from '../fsx.js'

export interface ZellijCompactCapability {
  status: string
  version: string | null
  bin: string | null
}

export interface ZellijPlannedMutation {
  command: string
  reason: string
}

export type ZellijSelfHealRequestedBy =
  | 'doctor --fix'
  | 'sks --mad'
  | 'sks deps check --yes'
  | 'sks zellij update'
  | 'setup'

export type ZellijSelfHealStrategy =
  | 'none-current'
  | 'brew-install-zellij'
  | 'brew-upgrade-zellij'
  | 'brew-install-homebrew-then-zellij'
  | 'manual-required'
  | 'headless-fallback'
  | 'failed'

export interface ZellijSelfHealResult {
  schema: 'sks.zellij-self-heal.v1'
  ok: boolean
  requested_by: ZellijSelfHealRequestedBy
  fix_requested: boolean
  auto_approved: boolean
  install_homebrew_allowed: boolean
  dry_run: boolean
  planned_mutations: ZellijPlannedMutation[]
  before: ZellijCompactCapability
  latest_version: string | null
  strategy: ZellijSelfHealStrategy
  command: string | null
  after: ZellijCompactCapability
  mutation_guard_artifact: string | null
  homebrew: {
    present: boolean
    bin: string | null
    install_attempted: boolean
    install_allowed: boolean
  }
  blockers: string[]
  warnings: string[]
}

export function isZellijSelfHealResult(value: unknown): value is ZellijSelfHealResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.schema === 'sks.zellij-self-heal.v1'
    && typeof row.ok === 'boolean'
    && typeof row.requested_by === 'string'
    && typeof row.strategy === 'string'
    && row.before !== null
    && typeof row.before === 'object'
    && row.after !== null
    && typeof row.after === 'object'
    && Array.isArray(row.blockers)
    && Array.isArray(row.warnings)
}

export function normalizeZellijSelfHealResult(value: unknown): ZellijSelfHealResult {
  if (isZellijSelfHealResult(value)) {
    return {
      ...value,
      dry_run: value.dry_run === true,
      planned_mutations: Array.isArray(value.planned_mutations) ? value.planned_mutations : []
    }
  }
  return {
    schema: 'sks.zellij-self-heal.v1',
    ok: false,
    requested_by: 'setup',
    fix_requested: false,
    auto_approved: false,
    install_homebrew_allowed: false,
    dry_run: false,
    planned_mutations: [],
    before: { status: 'unknown', version: null, bin: null },
    latest_version: null,
    strategy: 'failed',
    command: null,
    after: { status: 'unknown', version: null, bin: null },
    mutation_guard_artifact: null,
    homebrew: { present: false, bin: null, install_attempted: false, install_allowed: false },
    blockers: ['invalid_zellij_self_heal_result'],
    warnings: [`normalized_at:${nowIso()}`]
  }
}

