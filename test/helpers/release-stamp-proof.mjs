import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  RELEASE_REAL_CHECK_IDS,
  RELEASE_REAL_OPTIONAL_CHECK_IDS,
  RELEASE_REAL_REQUIRED_CHECK_IDS
} from '../../dist/core/release/release-real-contract.js';
import { releaseAuthorizationSnapshot } from '../../dist/core/release/release-authorization-snapshot.js';
import { currentDistFreshness } from '../../dist/scripts/lib/ensure-dist-fresh.js';

export function createReleaseStampProof(root = process.cwd()) {
  const runId = `test-full-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dir = path.join(root, '.sneakoscope', 'reports', 'release-gates', runId);
  const summaryPath = path.join(dir, 'summary.json');
  const realSummaryPath = path.join(dir, 'release-real-check.json');
  const stampPath = path.join(dir, 'release-check-stamp.json');
  fs.mkdirSync(dir, { recursive: true });
  const releaseManifest = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8'));
  const releaseGateIds = releaseManifest.gates
    .filter((gate) => Array.isArray(gate?.preset) && gate.preset.includes('release'))
    .map((gate) => String(gate.id));
  const freshness = currentDistFreshness();
  const currentPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const authorizationSnapshot = releaseAuthorizationSnapshot(root, currentPackage);
  const summaryBytes = Buffer.from(`${JSON.stringify({
    schema: 'sks.release-gate-dag-run.v1',
    ok: true,
    run_id: runId,
    selected_preset: 'release',
    total_gates: releaseManifest.gates.length,
    selected_gates: releaseGateIds.length,
    selected_gate_ids: releaseGateIds,
    completed: releaseGateIds.length,
    failed: 0,
    skipped_by_affected: [],
    affected_selection: { mode: 'full', selected_gate_ids: releaseGateIds, skipped_gate_ids: [] },
    release_authorization_snapshot: authorizationSnapshot,
    completion_certificate: {
      ok: true,
      confidence: 'full-release-proof',
      full_release_proof: 'current_run'
    }
  }, null, 2)}\n`);
  fs.writeFileSync(summaryPath, summaryBytes);
  const summarySha256 = crypto.createHash('sha256').update(summaryBytes).digest('hex');
  const requiredIds = new Set(RELEASE_REAL_REQUIRED_CHECK_IDS);
  const optionalIds = new Set(RELEASE_REAL_OPTIONAL_CHECK_IDS);
  const allChecks = RELEASE_REAL_CHECK_IDS.map((id) => ({
    id,
    ok: true,
    contract_ok: true,
    process_ok: true,
    release_blocking: false,
    required_for_release: requiredIds.has(id),
    requirement: optionalIds.has(id) ? 'live_optional' : 'release_authorizing',
    outcome: 'passed',
    passed: true
  }));
  const revalidation = {
    ok: true,
    run_id: runId,
    latest_summary_sha256: summarySha256,
    ...authorizationSnapshot,
    dist_source_digest: freshness.source_digest,
    dist_source_file_count: freshness.source_file_count,
    dist_stamp_source_digest: freshness.stamp?.source_digest || null,
    blockers: []
  };
  const skipProof = {
    ...revalidation,
    stable_through_real_checks: true,
    final_revalidation: { ...revalidation }
  };
  fs.writeFileSync(realSummaryPath, `${JSON.stringify({
    schema: 'sks.release-real-check.v1',
    generated_at: new Date().toISOString(),
    ok: true,
    task_contract: { ok: true, actual_ids: [...RELEASE_REAL_CHECK_IDS] },
    release_check: {
      id: 'release:check',
      ok: true,
      outcome: 'passed',
      required_for_release: true,
      proof: skipProof
    },
    skip_release_check_proof: skipProof,
    all_checks: allChecks,
    release_authorizing_checks: allChecks.filter((row) => row.required_for_release),
    blockers: [],
    warnings: []
  }, null, 2)}\n`);
  const relative = path.relative(root, summaryPath);
  const realRelative = path.relative(root, realSummaryPath);
  return {
    summaryPath,
    realSummaryPath,
    stampPath,
    env: { SKS_RELEASE_STAMP_PATH: stampPath },
    writeArgs: ['write', '--preset', 'release', '--full', '--summary', relative, '--real-summary', realRelative],
    writeCommand: `${JSON.stringify(process.execPath)} ./dist/scripts/release-check-stamp.js write --preset release --full --summary ${JSON.stringify(relative)} --real-summary ${JSON.stringify(realRelative)}`,
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}
