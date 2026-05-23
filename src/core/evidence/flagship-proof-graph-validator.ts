import path from 'node:path';
import { exists, readJson } from '../fsx.js';
import { missionDir } from '../mission.js';

export const FLAGSHIP_PROOF_GRAPH_SCHEMA = 'sks.flagship-proof-graph.v2';

export async function validateFlagshipProofGraph(root: string, opts: any = {}) {
  const missionId = opts.missionId || null;
  const missionPath = missionId ? missionDir(root, missionId) : null;
  const routes = opts.routes || ['hooks', 'ux_review', 'ppt_review', 'dfix'];
  const checks = await Promise.all(routes.map((route: string) => validateRoute(root, route, missionPath)));
  const blockers = checks.flatMap((check) => check.blockers || []);
  return {
    schema: FLAGSHIP_PROOF_GRAPH_SCHEMA,
    ok: blockers.length === 0,
    mission_id: missionId,
    routes: checks,
    local_only_policy: checks.every((check) => check.local_only_policy !== 'blocked'),
    mock_real_cap_enforced: checks.every((check) => check.mock_real_cap !== 'blocked'),
    blockers
  };
}

async function validateRoute(root: string, route: string, missionPath: string | null) {
  const required = requiredArtifacts(route, missionPath);
  const artifacts = [];
  const blockers = [];
  for (const rel of required) {
    const file = path.isAbsolute(rel) ? rel : path.join(root, rel);
    const present = await exists(file);
    const parsed = present ? await readJson<any>(file, null) : null;
    artifacts.push({
      path: rel,
      present,
      schema: parsed?.schema || null,
      status: parsed?.status || parsed?.gate || null,
      ok: typeof parsed?.ok === 'boolean' ? parsed.ok : null,
      proof_status: proofStatus(parsed),
      trust_status: trustStatus(parsed),
      trust_ok: trustOk(parsed),
      signals: graphSignals(parsed)
    });
    if (!present) blockers.push(`missing:${route}:${rel}`);
    if (present && !artifactIsAcceptable(parsed)) blockers.push(`blocked:${route}:${rel}`);
    for (const blocker of artifactBlockers(parsed)) blockers.push(`artifact:${route}:${rel}:${blocker}`);
  }
  const evidenceIndexLinked = artifacts.some((item) => /evidence|proof|trust/i.test(item.path) && item.present)
    || artifacts.some((item) => item.signals.evidence_index_linked);
  const completionProofLinked = artifacts.some((item) => /completion-proof\.json$/.test(item.path) && item.present)
    || artifacts.some((item) => item.signals.completion_proof_linked);
  const trustReportLinked = artifacts.some((item) => /trust-report\.json$/.test(item.path) && item.present)
    || artifacts.some((item) => item.signals.trust_report_linked);
  const wrongnessLinked = artifacts.some((item) => item.signals.wrongness_linked);
  const mockRealBlocked = artifacts.some((item) => item.signals.mock_real_cap === 'blocked');
  const localOnlyBlocked = artifacts.some((item) => item.signals.local_only_policy === 'blocked');
  if (!evidenceIndexLinked) blockers.push(`graph:${route}:evidence_index_unlinked`);
  if (!completionProofLinked) blockers.push(`graph:${route}:completion_proof_unlinked`);
  if (!trustReportLinked) blockers.push(`graph:${route}:trust_report_unlinked`);
  if (!wrongnessLinked) blockers.push(`graph:${route}:wrongness_unlinked`);
  if (mockRealBlocked) blockers.push(`graph:${route}:mock_real_cap_blocked`);
  if (localOnlyBlocked) blockers.push(`graph:${route}:local_only_policy_blocked`);
  return {
    route,
    artifacts,
    evidence_index_linked: evidenceIndexLinked,
    completion_proof_linked: completionProofLinked,
    trust_report_linked: trustReportLinked,
    wrongness_linked: wrongnessLinked,
    mock_real_cap: mockRealBlocked ? 'blocked' : 'enforced',
    local_only_policy: localOnlyBlocked ? 'blocked' : 'enforced',
    blockers
  };
}

function graphSignals(parsed: any = {}) {
  const proofOk = completionProofStatusOk(proofStatus(parsed));
  const trustReportOk = trustOk(parsed) === true || trustStatusOk(trustStatus(parsed));
  return {
    evidence_index_linked: parsed?.evidence_index_linked === true,
    completion_proof_linked: parsed?.completion_proof_linked === true
      || proofOk,
    trust_report_linked: parsed?.trust_report_linked === true
      || parsed?.trust_linked === true
      || trustReportOk,
    wrongness_linked: parsed?.wrongness_linked === true
      || parsed?.wrongness_behavior_defined === true,
    mock_real_cap: mockRealCapSignal(parsed),
    local_only_policy: localOnlySignal(parsed)
  };
}

function artifactIsAcceptable(parsed: any = {}) {
  if (!parsed || typeof parsed !== 'object') return true;
  if (parsed.ok !== false) return true;
  const status = String(parsed.status || parsed.gate || '');
  if (/^integration_optional/.test(status)) return true;
  if (status === 'skipped' && parsed.release_gate === 'release:real-check_only') return true;
  return false;
}

function artifactBlockers(parsed: any = {}) {
  if (!parsed || typeof parsed !== 'object') return [];
  const blockers = Array.isArray(parsed.blockers) ? parsed.blockers.map((blocker: any) => String(blocker)) : [];
  if (hasCompletionProofSchema(parsed) && !completionProofStatusOk(proofStatus(parsed))) {
    blockers.push(`completion_proof_status_${proofStatus(parsed) || 'missing'}`);
  }
  if (hasTrustReportSchema(parsed) && !(trustOk(parsed) === true || trustStatusOk(trustStatus(parsed)))) {
    blockers.push(`trust_report_status_${trustStatus(parsed) || 'missing'}`);
  }
  return blockers;
}

function hasCompletionProofSchema(parsed: any = {}) {
  return parsed?.proof_schema === 'sks.completion-proof.v1'
    || parsed?.artifacts?.proof_schema === 'sks.completion-proof.v1'
    || parsed?.proof?.schema === 'sks.completion-proof.v1';
}

function hasTrustReportSchema(parsed: any = {}) {
  return parsed?.trust_schema === 'sks.trust-report.v1'
    || parsed?.artifacts?.trust_schema === 'sks.trust-report.v1'
    || parsed?.trust?.schema === 'sks.trust-report.v1';
}

function proofStatus(parsed: any = {}) {
  return parsed?.proof_status || parsed?.artifacts?.proof_status || parsed?.proof?.status || null;
}

function trustStatus(parsed: any = {}) {
  return parsed?.trust_status || parsed?.artifacts?.trust_status || parsed?.trust?.status || null;
}

function trustOk(parsed: any = {}) {
  if (typeof parsed?.trust_ok === 'boolean') return parsed.trust_ok;
  if (typeof parsed?.artifacts?.trust_ok === 'boolean') return parsed.artifacts.trust_ok;
  if (typeof parsed?.trust?.ok === 'boolean') return parsed.trust.ok;
  return null;
}

function completionProofStatusOk(status: any) {
  return ['verified', 'verified_partial'].includes(String(status || ''));
}

function trustStatusOk(status: any) {
  return ['verified', 'verified_partial'].includes(String(status || ''));
}

function mockRealCapSignal(value: any) {
  if (value?.mock_fake_not_verified_real === false) return 'blocked';
  let blocked = false;
  walk(value, (node) => {
    if (node && typeof node === 'object') {
      if (node.mock === true && node.real_generated === true) blocked = true;
      if (node.fake_adapter === true && node.real_generated === true) blocked = true;
    }
  });
  return blocked ? 'blocked' : 'enforced';
}

function localOnlySignal(value: any) {
  let blocked = false;
  walk(value, (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'local_only' || key === 'local_only_policy' || key === 'local_only_artifact_policy' || key === 'deck_local_only')
        && child === false) {
        blocked = true;
      }
    }
  });
  return blocked ? 'blocked' : 'enforced';
}

function walk(value: any, visit: (node: any) => void) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function requiredArtifacts(route: string, missionPath: string | null) {
  if (missionPath) {
    if (route === 'ppt_review') return [
      path.join(missionPath, 'ppt-deck-inventory.json'),
      path.join(missionPath, 'ppt-slide-export-ledger.json'),
      path.join(missionPath, 'ppt-slide-callout-ledger.json'),
      path.join(missionPath, 'ppt-slide-issue-ledger.json'),
      path.join(missionPath, 'ppt-deck-issue-ledger.json'),
      path.join(missionPath, 'completion-proof.json'),
      path.join(missionPath, 'trust-report.json')
    ];
    return [path.join(missionPath, 'completion-proof.json')];
  }
  if (route === 'hooks') return ['.sneakoscope/reports/codex-hook-parity-1.14.1.json', '.sneakoscope/reports/evidence-flagship-coverage.json'];
  if (route === 'ppt_review') return ['.sneakoscope/reports/ppt-full-e2e-blackbox.json', '.sneakoscope/reports/evidence-flagship-coverage.json'];
  if (route === 'ux_review') return ['.sneakoscope/reports/real-imagegen-smoke-1.14.1.json', '.sneakoscope/reports/evidence-flagship-coverage.json'];
  if (route === 'dfix') return ['.sneakoscope/reports/evidence-flagship-coverage.json'];
  return [];
}
