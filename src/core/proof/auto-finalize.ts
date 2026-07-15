import path from 'node:path';
import { exists, readJson, type JsonData } from '../fsx.js';
import { finalizeRouteWithProof } from './route-finalizer.js';
import { evaluateGate } from '../stop-gate/gate-evaluator.js';

export async function maybeFinalizeRoute(root: any, {
  missionId,
  route,
  gateFile = null,
  gate = null,
  artifacts = [],
  claims = [],
  visualEvidence = null,
  visual = false,
  fixClaim = false,
  requireRelation = false,
  mock = false,
  statusHint = null,
  reason = null,
  command = null,
  dbEvidence = null,
  testEvidence = null,
  blockers = [],
  unverified = [],
  agents = undefined,
  allowActiveWrongnessPartial = false,
  failureAnalysis = null,
  lightweightEvidence = false
}: any = {}): Promise<JsonData> {
  if (!missionId || !route) {
    return { ok: false, skipped: true, reason: 'mission_id_or_route_missing' };
  }
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  const diskGateObject = gateFile && await exists(path.join(missionDir, gateFile))
    ? await readJson(path.join(missionDir, gateFile), null)
    : null;
  const gateObject = diskGateObject || gate || null;
  const gateVerdict = gateFile ? await evaluateGate(root, missionId, gateFile) : null;
  const callerGateMismatch = Boolean(gate && diskGateObject && stableJson(gate) !== stableJson(diskGateObject));
  const passed = gateVerdict ? gateVerdict.pass && !callerGateMismatch : gateObject?.passed === true || gateObject?.ok === true || gateObject?.status === 'pass';
  const gateBlockers = gateVerdict && !gateVerdict.pass
    ? [`route_gate_${gateVerdict.verdict}`, ...gateVerdict.reasons.map((item) => `route_gate_${item}`)]
    : [];
  if (callerGateMismatch) gateBlockers.push('route_gate_caller_disk_mismatch');
  const computedStatus = computeAutoFinalizeStatus({
    mock,
    passed,
    blockers: [...blockers, ...gateBlockers]
  });
  const statusResolution = applyStatusHint(computedStatus, statusHint);
  const finalStatus = statusResolution.status;
  const proof = await finalizeRouteWithProof(root, {
    missionId,
    route,
    gateFile,
    gate: gateObject,
    artifacts,
    claims: claims.length ? claims : [{ id: String(route).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '-auto-finalize', status: mock ? 'verified_partial' : 'supported', evidence: gateFile || 'route-command' }],
    visualEvidence,
    dbEvidence,
    testEvidence,
    commandEvidence: command ? [{ ...command, ok: command.ok !== false }] : null,
    unverified: [
      ...unverified,
      ...(mock ? ['Route was finalized from an explicit mock/fixture command path.'] : []),
      ...(gateVerdict?.verdict === 'mock_only' ? ['Route gate is mock fixture evidence and cannot satisfy a real completion gate.'] : []),
      ...(statusResolution.rejected ? [`statusHint rejected: requested ${statusResolution.rejected.requested}, computed ${statusResolution.rejected.computed}.`] : []),
      ...(!passed && !mock ? ['Route gate did not pass' + (reason ? ': ' + reason : '') + '.'] : [])
    ],
    blockers: [
      ...blockers,
      ...gateBlockers,
      ...(!passed && !mock && !gateBlockers.length ? ['route_gate_not_passed'] : [])
    ],
    statusHint: finalStatus,
    statusHintRejected: statusResolution.rejected,
    mock,
    fixClaim,
    requireRelation,
    visualClaim: visual,
    agents,
    allowActiveWrongnessPartial,
    failureAnalysis,
    lightweightEvidence
  });
  return { ...proof, auto_finalized: true, gate_passed: passed, gate_verdict: gateVerdict, status_hint: finalStatus, status_hint_rejected: statusResolution.rejected };
}

const STATUS_RANK: Record<string, number> = {
  blocked: 0,
  failed: 0,
  not_verified: 0,
  mock_only: 1,
  verified_partial: 2,
  verified: 3
};

function computeAutoFinalizeStatus({ mock, passed, blockers }: { mock: boolean; passed: boolean; blockers: unknown[] }) {
  if (mock) return 'mock_only';
  if (blockers.length > 0) return 'blocked';
  return passed ? 'verified' : 'blocked';
}

function applyStatusHint(computed: string, requested: string | null) {
  if (!requested) return { status: computed, rejected: null };
  const requestedRank = STATUS_RANK[requested];
  const computedRank = STATUS_RANK[computed];
  if (requestedRank === undefined || computedRank === undefined) {
    return { status: computed, rejected: { requested, computed, reason: 'unknown_status_hint' } };
  }
  if (computed === 'mock_only' && requested !== 'mock_only') {
    return { status: computed, rejected: { requested, computed, reason: 'mock_fixture_status_cap' } };
  }
  if (requestedRank > computedRank) {
    return { status: computed, rejected: { requested, computed, reason: 'status_hint_upgrade_rejected' } };
  }
  return { status: requested, rejected: null };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
