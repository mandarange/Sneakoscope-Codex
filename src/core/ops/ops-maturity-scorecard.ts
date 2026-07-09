import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso, readJsonFile, writeOpsReport, type OpsReport } from './reporting.js';

export interface OpsMaturityScorecard extends OpsReport {
  schema: 'sks.ops-maturity-scorecard.v1';
  total_score: number;
  pass_threshold: number;
  item_threshold: number;
  critical_threshold: number;
  rows: OpsMaturityRow[];
}

export interface OpsMaturityRow {
  id: string;
  label: string;
  weight: number;
  critical: boolean;
  score: number;
  evidence_path: string | null;
  evidence_status: string;
  blockers: string[];
}

const ROWS = [
  ['fresh_install_smoke', 'Fresh install smoke', 10, false, 'installed-package-smoke.json'],
  ['upgrade_migration', 'Upgrade/migration smoke', 12, true, 'upgrade-migration-matrix.json'],
  ['doctor_semantics', 'Doctor fast/full/fix separation', 10, false, 'doctor-ops-semantics.json'],
  ['rollback_recovery', 'Rollback/recovery safety', 12, true, 'rollback-recovery-smoke.json'],
  ['real_runtime_e2e', 'Real runtime E2E evidence', 12, true, 'naruto-real-write-e2e.json'],
  ['high_risk_command_safety', 'High-risk command negative smoke', 10, true, 'high-risk-contracts.json'],
  ['long_run_retention', 'Long-run state/retention health', 10, false, 'retention-long-run-smoke.json'],
  ['performance_state', 'Performance under realistic state', 8, false, 'perf-budget.json'],
  ['package_surface', 'Package surface/publish readiness', 8, false, 'packlist-performance.json'],
  ['diagnostics_actionability', 'Error diagnostics/actionability', 8, false, 'ops-diagnostics-bundle.json']
] as const;

export async function buildOpsMaturityScorecard(root: string): Promise<OpsMaturityScorecard> {
  const reportDir = path.join(root, '.sneakoscope', 'reports');
  const rows: OpsMaturityRow[] = [];
  for (const [id, label, weight, critical, fileName] of ROWS) {
    rows.push(await scoreRow(reportDir, id, label, weight, critical, fileName));
  }
  const total = rows.reduce((sum, row) => sum + (row.score / 100) * row.weight, 0);
  const blockers = [
    ...(total >= 94 ? [] : [`total_below_94:${Number(total.toFixed(2))}`]),
    ...rows.filter((row) => row.score < 85).map((row) => `${row.id}:below_item_threshold:${row.score}`),
    ...rows.filter((row) => row.critical && row.score < 90).map((row) => `${row.id}:below_critical_threshold:${row.score}`),
    ...rows.flatMap((row) => row.blockers.map((blocker) => `${row.id}:${blocker}`))
  ];
  return {
    schema: 'sks.ops-maturity-scorecard.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    total_score: Number(total.toFixed(2)),
    pass_threshold: 94,
    item_threshold: 85,
    critical_threshold: 90,
    rows,
    blockers
  };
}

export async function writeOpsMaturityScorecard(root: string): Promise<string> {
  return writeOpsReport(root, 'ops-maturity-scorecard.json', await buildOpsMaturityScorecard(root));
}

async function scoreRow(reportDir: string, id: string, label: string, weight: number, critical: boolean, fileName: string): Promise<OpsMaturityRow> {
  const evidencePath = path.join(reportDir, fileName);
  const evidence = await readJsonFile(evidencePath);
  if (!evidence) return row(id, label, weight, critical, 0, evidencePath, 'missing', ['evidence_missing']);
  const blockers = invalidEvidenceBlockers(evidence);
  if (blockers.length) return row(id, label, weight, critical, 0, evidencePath, 'invalid', blockers);
  if (evidence.ok !== true) return row(id, label, weight, critical, 0, evidencePath, String(evidence.status || 'failed'), blockersOf(evidence));
  return row(id, label, weight, critical, 100, evidencePath, String(evidence.status || 'passed'), []);
}

function row(id: string, label: string, weight: number, critical: boolean, score: number, evidencePath: string | null, evidenceStatus: string, blockers: string[]): OpsMaturityRow {
  return { id, label, weight, critical, score, evidence_path: evidencePath, evidence_status: evidenceStatus, blockers };
}

export function invalidEvidenceBlockers(evidence: any): string[] {
  const blockers = [];
  if (evidence?.ok === true && blockersOf(evidence).length > 0) blockers.push('ok_true_with_blockers');
  if (evidence?.stale === true) blockers.push('stale_report');
  if (evidence?.evidence_kind === 'metadata_only') blockers.push('metadata_only');
  if (evidence?.production_evidence === true && evidence?.fixture_only === true) blockers.push('fixture_only_for_production');
  if (evidence?.hermetic_result_counted_as_real === true) blockers.push('hermetic_counted_as_real');
  if (evidence?.local_smoke_counted_as_live === true) blockers.push('local_smoke_counted_as_live');
  if (evidence?.fast_doctor_counted_as_full === true) blockers.push('fast_doctor_counted_as_full');
  return blockers;
}

function blockersOf(evidence: any): string[] {
  return Array.isArray(evidence?.blockers) ? evidence.blockers.map(String) : [];
}
