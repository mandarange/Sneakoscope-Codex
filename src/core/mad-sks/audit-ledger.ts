import path from 'node:path';
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js';
import { redactMadSksSecrets, type MadSksActionType } from './write-guard.js';

export const MAD_SKS_AUDIT_LEDGER_SCHEMA = 'sks.mad-sks-audit-ledger.v1';

export interface MadSksAuditAction {
  id: string;
  type: MadSksActionType;
  target: string | null;
  command: string | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  exit_code: number | null;
  before_hash: string | null;
  after_hash: string | null;
  rollback_available: boolean;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  secret_redaction_status: 'applied';
  protected_core_impact: 'none' | 'blocked' | 'changed';
  local_only_artifact_policy: true;
  notes: string[];
}

export function createMadSksAuditLedger({
  authorizationManifestPath = null,
  targetRoot,
  actions = [],
  blockedActions = []
}: {
  authorizationManifestPath?: string | null;
  targetRoot: string;
  actions?: MadSksAuditAction[];
  blockedActions?: unknown[];
}) {
  return {
    schema: MAD_SKS_AUDIT_LEDGER_SCHEMA,
    ok: actions.every((action) => action.protected_core_impact !== 'changed'),
    generated_at: nowIso(),
    authorization_manifest: authorizationManifestPath,
    target_root: path.resolve(targetRoot),
    action_count: actions.length,
    blocked_action_count: blockedActions.length,
    actions,
    blocked_actions: blockedActions,
    evidence_router_linked: true,
    local_only_artifact_policy: true
  };
}

export function madSksAuditAction(input: Partial<MadSksAuditAction> & { type: MadSksActionType }): MadSksAuditAction {
  const startedAt = input.started_at || nowIso();
  const completedAt = input.completed_at || startedAt;
  return {
    id: input.id || `mad-action-${sha256(`${input.type}:${input.target || input.command || startedAt}`).slice(0, 12)}`,
    type: input.type,
    target: input.target || null,
    command: input.command ? redactMadSksSecrets(input.command) : null,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Number(input.duration_ms || 0),
    exit_code: typeof input.exit_code === 'number' ? input.exit_code : null,
    before_hash: input.before_hash || null,
    after_hash: input.after_hash || null,
    rollback_available: input.rollback_available === true,
    risk_level: input.risk_level || 'low',
    secret_redaction_status: 'applied',
    protected_core_impact: input.protected_core_impact || 'none',
    local_only_artifact_policy: true,
    notes: input.notes || []
  };
}

export async function writeMadSksAuditLedger(file: string, ledger: ReturnType<typeof createMadSksAuditLedger>) {
  await writeJsonAtomic(file, ledger);
  return ledger;
}
