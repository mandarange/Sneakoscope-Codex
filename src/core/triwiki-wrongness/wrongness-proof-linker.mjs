import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../fsx.mjs';

export async function wrongnessProofEvidence(root, missionId = null, opts = {}) {
  const records = await readCombinedWrongnessRecords(root, missionId);
  const summary = summarizeWrongnessRecords(records);
  const active = records.filter((record) => record.status === 'active');
  const route = opts.route || null;
  const relevant = active.filter((record) => !route || !record.route || record.route === route || asRuleAppliesTo(record).includes(route));
  const relevantSummary = summarizeWrongnessRecords(relevant);
  return {
    schema: 'sks.triwiki-wrongness-proof-evidence.v1',
    generated_at: nowIso(),
    mission_id: missionId,
    route,
    ok: Number(relevantSummary.high_severity_active || 0) === 0,
    project_ledger: '.sneakoscope/wiki/wrongness-ledger.json',
    mission_ledger: missionId ? `.sneakoscope/missions/${missionId}/wrongness-ledger.json` : null,
    active_count: relevantSummary.active,
    resolved_count: summary.resolved,
    high_severity_active: relevantSummary.high_severity_active,
    medium_severity_active: relevantSummary.medium_severity_active,
    global_active_count: summary.active,
    global_high_severity_active: summary.high_severity_active,
    active_ids: relevant.map((record) => record.id),
    avoidance_rules: relevant.map((record) => record.avoidance_rule).filter(Boolean),
    records: relevant.slice(-12).map((record) => ({
      id: record.id,
      kind: record.wrongness_kind,
      severity: record.severity,
      status: record.status,
      mission_id: record.mission_id,
      claim: record.claim?.text || null,
      root_cause: record.root_cause?.category || null,
      avoidance_rule: record.avoidance_rule?.text || ''
    }))
  };
}

export function claimReferencesActiveWrongness(claim = {}, evidence = {}) {
  const ids = new Set(asStringList(evidence.active_ids));
  if (!ids.size) return false;
  return asStringList(claim.wrongness).some((id) => ids.has(id));
}

async function readCombinedWrongnessRecords(root, missionId = null) {
  const project = await readWrongnessRecords(path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json'));
  const mission = missionId
    ? await readWrongnessRecords(path.join(root, '.sneakoscope', 'missions', missionId, 'wrongness-ledger.json'))
    : [];
  const seen = new Set();
  return [...project, ...mission].filter((record) => {
    const id = String(record.id || JSON.stringify(record));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function readWrongnessRecords(file) {
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8'));
    return Array.isArray(raw.records) ? raw.records : [];
  } catch {
    return [];
  }
}

function summarizeWrongnessRecords(records = []) {
  const active = records.filter((record) => record.status === 'active');
  return {
    schema: 'sks.triwiki-wrongness-summary.v1',
    generated_at: nowIso(),
    total: records.length,
    active: active.length,
    resolved: records.filter((record) => record.status === 'resolved').length,
    high_severity_active: active.filter((record) => record.severity === 'high' || record.severity === 'critical').length,
    medium_severity_active: active.filter((record) => record.severity === 'medium').length,
    active_ids: active.map((record) => record.id),
    avoidance_rules: active.map((record) => record.avoidance_rule).filter((rule) => rule?.text)
  };
}

function asRuleAppliesTo(record) {
  const appliesTo = record?.avoidance_rule?.applies_to;
  return Array.isArray(appliesTo) ? appliesTo.map((item) => String(item)) : [];
}

function asStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean) : [];
}
