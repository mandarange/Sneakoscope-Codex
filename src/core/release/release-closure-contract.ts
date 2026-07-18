export const RELEASE_CLOSURE_SCHEMA = 'sks.release-closure.v1'
export const RELEASE_CLOSURE_MANIFEST_SCHEMA = 'sks.release-closure-manifest.v1'
export const RELEASE_CLOSURE_AUDIT_VERSION = '6.3.0'
export const RELEASE_630_MISSION_ID = 'M-20260715-150100-34bb'

export const FINDING_PROOF_SCHEMA = 'sks.release-finding-proof.v1'
export const LIFECYCLE_PROVENANCE_SCHEMA = 'sks.codex-rollout-event-proof.v1'
export const DELETION_COUNTING_SEMANTICS = 'git_diff_deleted_files_numstat_v1'
export const SLICE_HASH_SEMANTICS = 'utf8_lf_lines_with_terminal_lf_v1'
export const HEAD_BINDING_MODE = 'tracked_manifest_git_blob_at_head_v1'
export const FINDING_STATUSES = ['fixed', 'not_reproducible_with_evidence', 'accepted_risk_with_expiry', 'deferred_because_out_of_scope']
export const P0_FINDING_STATUSES = new Set(['fixed', 'not_reproducible_with_evidence'])
export const FINDING_IDS = Array.from({ length: 28 }, (_, index) => `F-${String(index + 1).padStart(3, '0')}`)
export const WORK_ORDER_IDS = Array.from({ length: 28 }, (_, index) => `WO-${String(index).padStart(3, '0')}`)
export const P0 = new Set(['F-001', 'F-002', 'F-003', 'F-006', 'F-009', 'F-013', 'F-015', 'F-018', 'F-019', 'F-020', 'F-025', 'F-027'])
export const P2 = new Set(['F-017', 'F-023'])
export const WORK_ORDER_SHA256 = '601bb141c9365c541a0abf3f361c2bafbd7b5a7c80557bccb8dd1dedaa12aa11'
export const POST_MAIN_WORK_ORDERS = new Set(['WO-002', 'WO-019', 'WO-020', 'WO-022', 'WO-023', 'WO-024', 'WO-026'])

export const REQUIRED_ARTIFACTS = {
  findings: { path: (version: string) => `.sneakoscope/release/${version}/audit/findings.json`, schema: 'sks.release-findings.v1' },
  deletion: { path: (version: string) => `.sneakoscope/release/${version}/audit/overengineering-deletions.json`, schema: 'sks.release-overengineering-deletions.v1' },
  mission: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/mission.json`, schema: null },
  plan: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-plan.json`, schema: 'sks.subagent-plan.v1' },
  events: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-events.jsonl`, schema: 'sks.subagent-event-log.v1' },
  parent_summary: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-parent-summary.json`, schema: 'sks.subagent-parent-summary.v1' },
  evidence: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-evidence.json`, schema: 'sks.subagent-evidence.v1' },
  summary: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/naruto-summary.json`, schema: 'sks.naruto-subagent-workflow.v1' },
  gate: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/naruto-gate.json`, schema: 'sks.naruto-gate.v1' },
  ssot: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/ssot-guard.json`, schema: 'sks.ssot-guard.v1' },
  ledger: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/work-order-ledger.json`, schema: null }
} as const

export interface ReleaseClosureInput {
  root: string
  version: string
  expectedHead: string
  expectedBaseline: string
  expectedMissionId?: string
  expectedWorkOrderSha256?: string
}

export interface ReleaseClosureManifestInput {
  root: string
  version: string
  baseline: string
  sourceCommit: string
  missionId?: string
}
