#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_REAL_CHECK_IDS,
  RELEASE_REAL_OPTIONAL_CHECK_IDS,
  RELEASE_REAL_REQUIRED_CHECK_IDS,
  releaseDagSummaryIdentityBlockers
} from '../core/release/release-real-contract.js';
import {
  RELEASE_AUTHORIZATION_SNAPSHOT_KEYS,
  releaseAuthorizationSnapshot,
  sameReleaseAuthorizationSnapshot
} from '../core/release/release-authorization-snapshot.js';
import { releaseGateContractSnapshot } from '../core/release/release-gate-contract.js';
import { readCurrentCanonicalTestProof } from '../core/release/canonical-test-proof.js';
import { currentDistFreshness } from './lib/ensure-dist-fresh.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stampPath = process.env.SKS_RELEASE_STAMP_PATH || path.join(root, '.sneakoscope', 'reports', 'release-check-stamp.json');
const command = process.argv[2] || 'verify';
const commandArgs = process.argv.slice(3);
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message, detail = '') {
  console.error(`Release check stamp failed: ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(2);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function releaseManifestContract() {
  const manifest = readJson('release-gates.v2.json');
  const contract = releaseGateContractSnapshot();
  const allGates = Array.isArray(manifest?.gates) ? manifest.gates : [];
  const releaseGateIds = allGates
    .filter((gate) => Array.isArray(gate?.preset) && gate.preset.includes('release'))
    .map((gate) => String(gate.id || ''))
    .filter(Boolean);
  return {
    schema: manifest?.schema || null,
    totalGateCount: allGates.length,
    releaseGateIds,
    releaseGateIdsSorted: [...new Set(releaseGateIds)].sort(),
    expectedReleaseGateIds: [...contract.ids].sort(),
    missingExpectedGateIds: contract.ids.filter((id) => !releaseGateIds.includes(id)),
    unexpectedReleaseGateIds: [...new Set(releaseGateIds)].filter((id) => !contract.ids.includes(id)).sort(),
    contract
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runRefreshCommand() {
  const override = process.env.SKS_RELEASE_CHECK_REFRESH_COMMAND;
  if (override) {
    return spawnSync(override, {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      shell: true,
      stdio: 'inherit'
    });
  }
  return spawnSync(npmCmd, ['run', 'release:check:full'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit'
  });
}

function currentStampPayload() {
  const pkg = readJson('package.json');
  const authorization = releaseAuthorizationSnapshot(root, pkg);
  const freshness = currentDistFreshness();
  const gateContract = releaseGateContractSnapshot();
  return {
    schema: 'sks.release-check-stamp.v2',
    package_name: pkg.name,
    package_version: pkg.version,
    package_json_sha256: sha256(fs.readFileSync(path.join(root, 'package.json'))),
    ...authorization,
    dist_source_digest: freshness.source_digest,
    dist_source_file_count: freshness.source_file_count,
    release_check_sha256: sha256(pkg.scripts?.['release:check'] || ''),
    release_gate_contract_schema: gateContract.schema,
    release_gate_contract_count: gateContract.count,
    release_gate_contract_sha256: gateContract.sha256
  };
}

function writeStamp() {
  const before = currentStampPayload();
  const releaseGateProof = fullReleaseGateProofForWrite(before);
  const current = currentStampPayload();
  const changedDuringWrite = stampIdentityKeys().filter((key) => before[key] !== current[key]);
  if (changedDuringWrite.length) fail('release inputs changed while writing the stamp', changedDuringWrite.join('\n'));
  const payload = {
    ...current,
    release_gate_proof: releaseGateProof,
    generated_at: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Release check stamp written: ${path.relative(root, stampPath)} (${payload.source_file_count} files)`);
}

function inspectStamp() {
  if (!fs.existsSync(stampPath)) {
    return {
      ok: false,
      message: 'missing release:check stamp',
      detail: 'Run `npm run release:check:full` once, then rerun the publish command.'
    };
  }
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      message: 'unable to read release:check stamp',
      detail: err.message
    };
  }
  const current = currentStampPayload();
  const mismatches = [];
  for (const key of stampIdentityKeys()) {
    if (stamp[key] !== current[key]) mismatches.push(`${key}: stamp=${stamp[key] || 'missing'} current=${current[key] || 'missing'}`);
  }
  const proofInspection = inspectFullReleaseGateProof(stamp.release_gate_proof, current);
  if (!proofInspection.ok) mismatches.push(...proofInspection.blockers.map((blocker) => `release_gate_proof:${blocker}`));
  if (mismatches.length) {
    return {
      ok: false,
      message: 'release:check stamp is stale',
      detail: `${mismatches.join('\n')}\nRun \`npm run release:check:full\` again before publishing.`,
      current
    };
  }
  return { ok: true, current };
}

function stampIdentityKeys() {
  return [
    'schema',
    'package_name',
    'package_version',
    'package_json_sha256',
    ...RELEASE_AUTHORIZATION_SNAPSHOT_KEYS,
    'dist_source_digest',
    'dist_source_file_count',
    'release_check_sha256',
    'release_gate_contract_schema',
    'release_gate_contract_count',
    'release_gate_contract_sha256'
  ];
}

function fullReleaseGateProofForWrite(currentPayload) {
  const preset = argValue('--preset');
  const full = commandArgs.includes('--full');
  if (preset !== 'release' || !full) {
    fail('full release proof required to write publish stamp', 'Use `npm run release:check:full`; affected/fast/confidence checks cannot authorize publish.');
  }
  const managedReports = path.resolve(root, '.sneakoscope', 'reports');
  const releaseGateReportsRoot = path.join(managedReports, 'release-gates');
  const explicit = argValue('--summary');
  const summaryPath = explicit ? path.resolve(root, explicit) : latestFullReleaseSummaryPath(releaseGateReportsRoot);
  if (!summaryPath) fail('full release DAG summary missing', 'Run `npm run release:check:full` before writing the publish stamp.');
  const relative = path.relative(releaseGateReportsRoot, summaryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('release DAG summary is outside the managed report root');
  let summary;
  let summaryBytes;
  try {
    summaryBytes = fs.readFileSync(summaryPath);
    summary = JSON.parse(summaryBytes.toString('utf8'));
  } catch (error) {
    fail('unable to read full release DAG summary', error?.message || String(error));
  }
  const summaryIdentityRoot = releaseGateSummaryIdentityRoot(summaryPath, releaseGateReportsRoot);
  const fixtureSummary = summaryIdentityRoot !== releaseGateReportsRoot;
  const productionStamp = path.resolve(stampPath) === path.join(managedReports, 'release-check-stamp.json');
  if (fixtureSummary && !isWithin(summaryIdentityRoot, stampPath)) {
    fail('fixture release DAG evidence requires a stamp inside the same fixture root');
  }
  const validation = validateFullReleaseSummary(summary, summaryPath, summaryIdentityRoot);
  if (validation.length) fail('release DAG summary is not full publish proof', validation.join('\n'));
  const canonicalProofInput = argValue('--canonical-proof');
  const requestedCanonicalProofPath = canonicalProofInput
    ? path.resolve(root, canonicalProofInput)
    : path.join(managedReports, 'canonical-test-proof.json');
  const canonicalRelative = path.relative(managedReports, requestedCanonicalProofPath);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) fail('canonical test proof is outside the managed artifact root');
  if (fixtureSummary && !isWithin(summaryIdentityRoot, requestedCanonicalProofPath)) fail('fixture canonical test proof is outside its fixture root');
  if (productionStamp && requestedCanonicalProofPath !== path.join(managedReports, 'canonical-test-proof.json')) fail('production release stamp requires the default canonical test proof');
  const canonicalInspection = readCurrentCanonicalTestProof(root, requestedCanonicalProofPath);
  if (!canonicalInspection.ok) fail('canonical test proof is not current', (canonicalInspection.blockers || []).join('\n'));
  const canonicalProofPath = canonicalInspection.proof_path;
  const canonicalProofMtimeMs = fileMtime(canonicalProofPath);
  const buildStampMtimeMs = fileMtime(currentDistFreshness().stamp_path);
  const summaryMtimeMs = fileMtime(summaryPath);
  if (!Number.isFinite(summaryMtimeMs) || !Number.isFinite(buildStampMtimeMs) || summaryMtimeMs < buildStampMtimeMs) {
    fail('full release DAG summary predates the current build');
  }
  if (!Number.isFinite(canonicalProofMtimeMs) || summaryMtimeMs < canonicalProofMtimeMs) {
    fail('full release DAG summary predates the current canonical test proof');
  }
  const explicitRealSummary = argValue('--real-summary');
  const realSummaryPath = explicitRealSummary
    ? path.resolve(root, explicitRealSummary)
    : path.join(managedReports, 'release-real-check.json');
  const realRelative = path.relative(managedReports, realSummaryPath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail('release real-check summary is outside the managed report root');
  if (fixtureSummary && !isWithin(summaryIdentityRoot, realSummaryPath)) fail('fixture release real-check summary is outside its fixture root');
  if (productionStamp && realSummaryPath !== path.join(managedReports, 'release-real-check.json')) fail('production release stamp requires the default release real-check summary');
  let realSummary;
  try {
    realSummary = JSON.parse(fs.readFileSync(realSummaryPath, 'utf8'));
  } catch (error) {
    fail('unable to read release real-check summary', error?.message || String(error));
  }
  const summarySha256 = sha256(summaryBytes);
  const canonicalIdentity = {
    path: managedPath(canonicalProofPath),
    sha256: canonicalInspection.proof_sha256
  };
  const realValidation = validateReleaseRealSummary(realSummary, { runId: summary.run_id, summarySha256, currentPayload, canonicalIdentity });
  if (realValidation.length) fail('release real-check summary is not publish proof', realValidation.join('\n'));
  if (fs.statSync(realSummaryPath).mtimeMs < fs.statSync(summaryPath).mtimeMs) fail('release real-check predates the full release DAG summary');
  return {
    schema: 'sks.release-check-full-proof.v1',
    preset: 'release',
    full: true,
    run_id: summary.run_id,
    summary_path: managedPath(summaryPath),
    summary_sha256: summarySha256,
    release_preset_gate_ids_sha256: sha256([...summary.selected_gate_ids].sort().join('\n')),
    release_gate_contract_sha256: currentPayload.release_gate_contract_sha256,
    selected_gates: summary.selected_gates,
    completed: summary.completed,
    failed: summary.failed,
    affected_mode: summary.affected_selection?.mode,
    confidence: summary.completion_certificate?.confidence || null,
    real_check_path: managedPath(realSummaryPath),
    real_check_sha256: sha256(fs.readFileSync(realSummaryPath)),
    real_check_count: realSummary.all_checks.length,
    canonical_test_proof_path: managedPath(canonicalProofPath),
    canonical_test_proof_sha256: canonicalIdentity.sha256
  };
}

function latestFullReleaseSummaryPath() {
  const reportRoot = path.join(root, '.sneakoscope', 'reports', 'release-gates');
  if (!fs.existsSync(reportRoot)) return null;
  return fs.readdirSync(reportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(reportRoot, entry.name, 'summary.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, stat: fs.statSync(file) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .map((row) => row.file)
    .find((file) => {
      try {
        return validateFullReleaseSummary(JSON.parse(fs.readFileSync(file, 'utf8')), file, reportRoot).length === 0;
      } catch {
        return false;
      }
    }) || null;
}

function validateFullReleaseSummary(summary, summaryPath = null, releaseGateReportsRoot = null) {
  const blockers = [];
  const contract = releaseManifestContract();
  const selectedRaw = Array.isArray(summary?.selected_gate_ids) ? summary.selected_gate_ids.map(String).filter(Boolean) : [];
  const selectedUnique = [...new Set(selectedRaw)].sort();
  if (summary?.schema !== 'sks.release-gate-dag-run.v1') blockers.push('summary_schema_invalid');
  if (summaryPath && releaseGateReportsRoot) blockers.push(...releaseDagSummaryIdentityBlockers(summary, summaryPath, releaseGateReportsRoot));
  if (summary?.ok !== true) blockers.push('summary_not_ok');
  if (summary?.selected_preset !== 'release') blockers.push('preset_not_release');
  if (summary?.affected_selection?.mode !== 'full') blockers.push('affected_mode_not_full');
  if (!Number.isInteger(summary?.selected_gates) || summary.selected_gates <= 0) blockers.push('selected_gates_empty');
  if (contract.schema !== 'sks.release-gates.v2') blockers.push('release_manifest_schema_invalid');
  if (contract.releaseGateIds.length !== contract.releaseGateIdsSorted.length) blockers.push('release_manifest_duplicate_gate_ids');
  if (contract.missingExpectedGateIds.length) blockers.push(`release_manifest_missing_contract_ids:${contract.missingExpectedGateIds.join(',')}`);
  if (contract.unexpectedReleaseGateIds.length) blockers.push(`release_manifest_unexpected_contract_ids:${contract.unexpectedReleaseGateIds.join(',')}`);
  if (summary?.total_gates !== contract.totalGateCount) blockers.push('manifest_total_gate_count_mismatch');
  if (summary?.selected_gates !== contract.contract.count) blockers.push('release_preset_gate_count_mismatch');
  if (summary?.failed !== 0) blockers.push('failed_gates_present');
  if (summary?.completed !== summary?.selected_gates) blockers.push('not_all_selected_gates_completed');
  if (!Array.isArray(summary?.selected_gate_ids) || summary.selected_gate_ids.length !== summary.selected_gates) blockers.push('selected_gate_ids_incomplete');
  if (selectedRaw.length !== selectedUnique.length) blockers.push('selected_gate_ids_duplicate');
  if (!sameStringList(selectedUnique, contract.expectedReleaseGateIds)) blockers.push('selected_gate_ids_not_release_contract');
  const affectedSelected = [...new Set((Array.isArray(summary?.affected_selection?.selected_gate_ids) ? summary.affected_selection.selected_gate_ids : []).map(String).filter(Boolean))].sort();
  if (!sameStringList(affectedSelected, contract.expectedReleaseGateIds)) blockers.push('affected_selected_gate_ids_not_release_contract');
  if (Array.isArray(summary?.skipped_by_affected) && summary.skipped_by_affected.length > 0) blockers.push('full_release_has_skipped_gates');
  if (summary?.completion_certificate?.confidence !== 'full-release-proof') blockers.push('completion_confidence_not_full');
  if (summary?.completion_certificate?.full_release_proof !== 'current_run') blockers.push('full_release_proof_not_current_run');
  if (summary?.completion_certificate?.ok !== true) blockers.push('completion_certificate_not_ok');
  return blockers;
}

function validateReleaseRealSummary(summary, context = {}) {
  const blockers = [];
  if (summary?.schema !== 'sks.release-real-check.v1') blockers.push('real_check_schema_invalid');
  if (summary?.ok !== true) blockers.push('real_check_not_ok');
  if (!Array.isArray(summary?.blockers) || summary.blockers.length > 0) blockers.push('real_check_blockers_present');
  const rows = Array.isArray(summary?.all_checks) ? summary.all_checks : [];
  const rowIds = rows.map((row) => String(row?.id || '')).filter(Boolean);
  const uniqueRowIds = [...new Set(rowIds)];
  const expectedIds = [...RELEASE_REAL_CHECK_IDS];
  if (!rows.length) blockers.push('real_check_empty');
  if (rowIds.length !== uniqueRowIds.length) blockers.push('real_check_duplicate_ids');
  if (!sameStringList([...uniqueRowIds].sort(), [...expectedIds].sort())) blockers.push('real_check_ids_not_contract');
  if (rows.some((row) => row?.ok !== true || row?.contract_ok !== true || row?.release_blocking === true)) blockers.push('real_check_failures_present');
  const requiredIds = new Set(RELEASE_REAL_REQUIRED_CHECK_IDS);
  const optionalIds = new Set(RELEASE_REAL_OPTIONAL_CHECK_IDS);
  for (const row of rows) {
    const id = String(row?.id || '');
    if (requiredIds.has(id) && !(row?.required_for_release === true && row?.requirement === 'release_authorizing' && row?.outcome === 'passed' && row?.passed === true && row?.process_ok === true)) {
      blockers.push(`real_required_check_not_passed:${id}`);
    }
    if (optionalIds.has(id) && !(row?.required_for_release === false && row?.requirement === 'live_optional')) blockers.push(`real_optional_check_contract_invalid:${id}`);
  }
  const authorizingIds = [...new Set((Array.isArray(summary?.release_authorizing_checks) ? summary.release_authorizing_checks : []).map((row) => String(row?.id || '')).filter(Boolean))].sort();
  if (!sameStringList(authorizingIds, [...RELEASE_REAL_REQUIRED_CHECK_IDS].sort())) blockers.push('real_authorizing_check_ids_not_contract');
  if (summary?.task_contract?.ok !== true || !sameStringList([...(summary?.task_contract?.actual_ids || [])].sort(), [...expectedIds].sort())) blockers.push('real_task_contract_invalid');
  if (!(summary?.release_check?.id === 'release:check' && summary?.release_check?.ok === true && summary?.release_check?.outcome === 'passed' && summary?.release_check?.required_for_release === true)) blockers.push('real_release_check_invalid');
  const skipProof = summary?.skip_release_check_proof;
  if (!(skipProof?.ok === true && skipProof?.stable_through_real_checks === true && skipProof?.final_revalidation?.ok === true)) blockers.push('real_skip_proof_invalid');
  if (context.runId && (skipProof?.run_id !== context.runId || skipProof?.final_revalidation?.run_id !== context.runId)) blockers.push('real_skip_proof_run_mismatch');
  if (context.summarySha256 && (skipProof?.latest_summary_sha256 !== context.summarySha256 || skipProof?.final_revalidation?.latest_summary_sha256 !== context.summarySha256)) blockers.push('real_skip_proof_summary_hash_mismatch');
  if (context.canonicalIdentity) {
    for (const [label, proof] of [['initial', skipProof], ['final', skipProof?.final_revalidation]]) {
      if (proof?.canonical_test_proof_path !== context.canonicalIdentity.path) blockers.push(`real_skip_${label}_canonical_test_proof_path_not_current`);
      if (proof?.canonical_test_proof_sha256 !== context.canonicalIdentity.sha256) blockers.push(`real_skip_${label}_canonical_test_proof_hash_not_current`);
    }
  }
  if (context.currentPayload) {
    for (const [label, proof] of [['initial', skipProof], ['final', skipProof?.final_revalidation]]) {
      for (const key of RELEASE_AUTHORIZATION_SNAPSHOT_KEYS) {
        if (proof?.[key] !== context.currentPayload[key]) blockers.push(`real_skip_${label}_${key}_not_current`);
      }
      if (proof?.dist_source_digest !== context.currentPayload.dist_source_digest) blockers.push(`real_skip_${label}_dist_source_digest_not_current`);
      if (proof?.dist_source_file_count !== context.currentPayload.dist_source_file_count) blockers.push(`real_skip_${label}_dist_source_file_count_not_current`);
    }
  }
  return blockers;
}

function sameStringList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function inspectFullReleaseGateProof(proof, currentPayload) {
  const blockers = [];
  let boundSummary = null;
  let boundSummarySha256 = null;
  const managedReports = path.resolve(root, '.sneakoscope', 'reports');
  const canonicalProofPath = proof?.canonical_test_proof_path ? path.resolve(root, proof.canonical_test_proof_path) : null;
  if (canonicalProofPath) {
    const canonicalRelative = path.relative(managedReports, canonicalProofPath);
    if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) blockers.push('canonical_test_proof_outside_artifact_root');
  }
  const canonicalInspection = canonicalProofPath
    ? readCurrentCanonicalTestProof(root, canonicalProofPath)
    : readCurrentCanonicalTestProof(root);
  const canonicalIdentity = {
    path: canonicalProofPath ? managedPath(canonicalProofPath) : null,
    sha256: canonicalInspection.proof_sha256 || null
  };
  if (!canonicalInspection.ok) blockers.push(...(canonicalInspection.blockers || ['canonical_test_proof_invalid']).map((blocker) => `canonical_test_proof:${blocker}`));
  if (proof?.canonical_test_proof_path !== canonicalIdentity.path) blockers.push('canonical_test_proof_path_mismatch');
  if (proof?.canonical_test_proof_sha256 !== canonicalIdentity.sha256) blockers.push('canonical_test_proof_hash_mismatch');
  if (proof?.schema !== 'sks.release-check-full-proof.v1') blockers.push('proof_schema_invalid');
  if (proof?.preset !== 'release' || proof?.full !== true) blockers.push('proof_not_full_release');
  if (proof?.release_gate_contract_sha256 !== currentPayload.release_gate_contract_sha256) blockers.push('release_gate_contract_hash_mismatch');
  const summaryPath = proof?.summary_path ? path.resolve(root, proof.summary_path) : null;
  const reportRoot = path.join(managedReports, 'release-gates');
  if (!summaryPath || !fs.existsSync(summaryPath)) blockers.push('summary_missing');
  else {
    const relative = path.relative(reportRoot, summaryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) blockers.push('summary_outside_managed_reports');
    else {
      const bytes = fs.readFileSync(summaryPath);
      if (sha256(bytes) !== proof.summary_sha256) blockers.push('summary_hash_mismatch');
      try {
        const summary = JSON.parse(bytes);
        boundSummary = summary;
        boundSummarySha256 = sha256(bytes);
        const summaryIdentityRoot = releaseGateSummaryIdentityRoot(summaryPath, reportRoot);
        blockers.push(...validateFullReleaseSummary(summary, summaryPath, summaryIdentityRoot));
        const productionStamp = path.resolve(stampPath) === path.join(managedReports, 'release-check-stamp.json');
        if (productionStamp && summaryIdentityRoot !== reportRoot) blockers.push('production_stamp_summary_not_direct_release_run');
        if (productionStamp && canonicalProofPath !== path.join(managedReports, 'canonical-test-proof.json')) blockers.push('production_stamp_canonical_test_proof_not_default');
        if (summaryIdentityRoot !== reportRoot && !isWithin(summaryIdentityRoot, stampPath)) {
          blockers.push('fixture_release_dag_stamp_outside_fixture_root');
        }
        if (summaryIdentityRoot !== reportRoot && canonicalProofPath && !isWithin(summaryIdentityRoot, canonicalProofPath)) {
          blockers.push('fixture_canonical_test_proof_outside_fixture_root');
        }
        const summaryMtimeMs = fileMtime(summaryPath);
        const distFreshness = currentDistFreshness();
        const buildStampMtimeMs = fileMtime(distFreshness.stamp_path);
        const canonicalProofMtimeMs = fileMtime(canonicalProofPath);
        for (const key of RELEASE_AUTHORIZATION_SNAPSHOT_KEYS) {
          if (summary.release_authorization_snapshot?.[key] !== currentPayload[key]) {
            blockers.push(`summary_authorization_mismatch:${key}`);
          }
        }
        const identicalAuthorizedBuild = distFreshness.ok === true && sameReleaseAuthorizationSnapshot(
          summary.release_authorization_snapshot,
          currentPayload
        );
        if (!Number.isFinite(summaryMtimeMs) || !Number.isFinite(buildStampMtimeMs)) blockers.push('proof_mtime_missing');
        // npm publish performs a deterministic clean rebuild after the full
        // release run. Permit only that content-identical case; any source,
        // package, dist, or gate identity drift still fails the checks above.
        if (Number.isFinite(summaryMtimeMs) && Number.isFinite(buildStampMtimeMs) && summaryMtimeMs < buildStampMtimeMs && !identicalAuthorizedBuild) blockers.push('summary_predates_current_build');
        if (!Number.isFinite(summaryMtimeMs) || !Number.isFinite(canonicalProofMtimeMs) || summaryMtimeMs < canonicalProofMtimeMs) blockers.push('summary_predates_current_canonical_test_proof');
        if (summary.run_id !== proof.run_id || summary.selected_gates !== proof.selected_gates || summary.completed !== proof.completed || summary.failed !== proof.failed) blockers.push('summary_identity_mismatch');
        if (sha256([...summary.selected_gate_ids].sort().join('\n')) !== proof.release_preset_gate_ids_sha256) blockers.push('release_preset_gate_ids_hash_mismatch');
      } catch {
        blockers.push('summary_parse_failed');
      }
    }
  }
  const realCheckPath = proof?.real_check_path ? path.resolve(root, proof.real_check_path) : null;
  if (!realCheckPath || !fs.existsSync(realCheckPath)) blockers.push('real_check_summary_missing');
  else {
    const relative = path.relative(managedReports, realCheckPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) blockers.push('real_check_summary_outside_managed_reports');
    else {
      if (boundSummary && summaryPath) {
        const summaryIdentityRoot = releaseGateSummaryIdentityRoot(summaryPath, reportRoot);
        if (summaryIdentityRoot !== reportRoot && !isWithin(summaryIdentityRoot, realCheckPath)) blockers.push('fixture_real_check_summary_outside_fixture_root');
      }
      if (path.resolve(stampPath) === path.join(managedReports, 'release-check-stamp.json') && realCheckPath !== path.join(managedReports, 'release-real-check.json')) {
        blockers.push('production_stamp_real_check_summary_not_default');
      }
      const bytes = fs.readFileSync(realCheckPath);
      if (sha256(bytes) !== proof.real_check_sha256) blockers.push('real_check_summary_hash_mismatch');
      try {
        const realSummary = JSON.parse(bytes);
        blockers.push(...validateReleaseRealSummary(realSummary, { runId: boundSummary?.run_id || proof.run_id, summarySha256: boundSummarySha256 || proof.summary_sha256, currentPayload, canonicalIdentity }));
        if (realSummary.all_checks?.length !== proof.real_check_count) blockers.push('real_check_identity_mismatch');
      } catch {
        blockers.push('real_check_summary_parse_failed');
      }
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

function argValue(name) {
  const index = commandArgs.indexOf(name);
  return index >= 0 ? commandArgs[index + 1] || null : null;
}

function managedPath(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function releaseGateSummaryIdentityRoot(summaryPath, reportRoot) {
  const relative = path.relative(reportRoot, summaryPath);
  const parts = relative.split(path.sep);
  if (parts.length === 4 && parts[0] === '.fixtures' && parts[1] && parts[2] && parts[3] === 'summary.json') {
    return path.join(reportRoot, '.fixtures', parts[1]);
  }
  return reportRoot;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function fileMtime(file) {
  try { return file ? fs.statSync(file).mtimeMs : null; } catch { return null; }
}

function verifyStamp() {
  const result = inspectStamp();
  if (!result.ok) fail(result.message, result.detail);
  const current = result.current;
  console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${current.source_file_count} files)`);
}

function ensureStamp() {
  const first = inspectStamp();
  if (first.ok) {
    console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${first.current.source_file_count} files)`);
    return;
  }
  console.error('Release check stamp is not current; running full `npm run release:check:full` refresh.');
  if (first.detail) console.error(first.detail.trim());

  const refresh = runRefreshCommand();
  if (refresh.status !== 0) process.exit(refresh.status || 1);

  const second = inspectStamp();
  if (!second.ok) fail(second.message, second.detail);
  console.log(`Release check stamp verified: ${path.relative(root, stampPath)} (${second.current.source_file_count} files)`);
}

if (command === 'write') writeStamp();
else if (command === 'verify') verifyStamp();
else if (command === 'ensure') ensureStamp();
else fail(`unknown command ${command}`, 'Usage: node ./dist/scripts/release-check-stamp.js <write --preset release --full [--summary path]|verify|ensure>');
