import { nowIso } from '../fsx.js';
import { readCombinedWrongnessRecords, summarizeWrongnessRecords } from './wrongness-ledger.js';

export async function wrongnessProofEvidence(root: string, missionId: string | null = null) {
  const records = await readCombinedWrongnessRecords(root, missionId);
  const summary = summarizeWrongnessRecords(records);
  const active = records.filter((record) => record.status === 'active');
  return {
    schema: 'sks.triwiki-wrongness-proof-evidence.v1',
    generated_at: nowIso(),
    mission_id: missionId,
    ok: Number(summary.high_severity_active || 0) === 0,
    project_ledger: '.sneakoscope/wiki/wrongness-ledger.json',
    mission_ledger: missionId ? `.sneakoscope/missions/${missionId}/wrongness-ledger.json` : null,
    active_count: summary.active,
    resolved_count: summary.resolved,
    high_severity_active: summary.high_severity_active,
    medium_severity_active: summary.medium_severity_active,
    active_ids: active.map((record) => record.id),
    avoidance_rules: active.map((record) => record.avoidance_rule),
    records: active.slice(-12).map((record) => ({
      id: record.id,
      kind: record.wrongness_kind,
      severity: record.severity,
      status: record.status,
      mission_id: record.mission_id,
      claim: record.claim.text,
      root_cause: record.root_cause.category,
      avoidance_rule: record.avoidance_rule.text
    }))
  };
}

export function claimReferencesActiveWrongness(claim: unknown, evidence: unknown): boolean {
  const claimRecord = asRecord(claim);
  const wrongness = claimRecord.wrongness;
  const ids = new Set(asStringList(asRecord(evidence).active_ids));
  if (!ids.size) return false;
  return asStringList(wrongness).some((id) => ids.has(id));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean) : [];
}
