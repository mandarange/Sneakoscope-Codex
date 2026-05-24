import { nowIso } from '../fsx.js';
import { readCombinedWrongnessRecords, summarizeWrongnessRecords } from './wrongness-ledger.js';
import { WRONGNESS_CONTEXT_SCHEMA, type WrongnessRecord } from './wrongness-schema.js';

export async function wrongnessContextForRoute(root: string, opts: {
  missionId?: string | null;
  route?: string | null;
  limit?: number;
} = {}) {
  const missionId = opts.missionId ?? null;
  const route = opts.route ?? null;
  const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 12)));
  const records = await readCombinedWrongnessRecords(root, missionId);
  const active = records.filter((record) => record.status === 'active');
  const routeRelevant = active.filter((record) => !route || !record.route || record.route === route || record.avoidance_rule.applies_to.includes(route));
  const selected = [...routeRelevant, ...active.filter((record) => !routeRelevant.some((candidate) => candidate.id === record.id))]
    .sort(sortWrongnessForRecall)
    .slice(0, limit);
  return {
    schema: WRONGNESS_CONTEXT_SCHEMA,
    generated_at: nowIso(),
    mission_id: missionId,
    route,
    summary: summarizeWrongnessRecords(records),
    active_records: selected.map(recordToContextRow),
    active_avoidance_rules: selected.map((record) => record.avoidance_rule),
    retrieval_policy: 'negative_evidence_first_for_related_claims; do not let active wrongness upgrade trust without correction evidence'
  };
}

export function agentWrongnessReferences(context: unknown, roleId: string): string[] {
  const contextRecord = asRecord(context);
  const rows: unknown[] = Array.isArray(contextRecord.active_records) ? contextRecord.active_records : [];
  const roleNeedle = roleId.toLowerCase();
  return rows
    .filter((row: unknown) => {
      const record = asRecord(row);
      const hay = `${record.kind || ''} ${record.claim || ''} ${record.avoidance_rule || ''}`.toLowerCase();
      if (/db|safety/.test(roleNeedle)) return /db|hook|trust|policy/.test(hay);
      if (/visual|voxel/.test(roleNeedle)) return /image|visual|bbox|anchor/.test(hay);
      if (/verification|test/.test(roleNeedle)) return /test|evidence|schema|trust/.test(hay);
      return true;
    })
    .map((row: unknown) => String(asRecord(row).id || ''))
    .filter(Boolean)
    .slice(0, 8);
}

function recordToContextRow(record: WrongnessRecord) {
  return {
    id: record.id,
    kind: record.wrongness_kind,
    severity: record.severity,
    route: record.route,
    claim: record.claim.text,
    root_cause: record.root_cause.category,
    avoidance_rule: record.avoidance_rule.text,
    updated_at: record.updated_at
  };
}

function sortWrongnessForRecall(a: WrongnessRecord, b: WrongnessRecord): number {
  return severityRank(b.severity) - severityRank(a.severity) || b.updated_at.localeCompare(a.updated_at);
}

function severityRank(value: string): number {
  if (value === 'critical') return 4;
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
