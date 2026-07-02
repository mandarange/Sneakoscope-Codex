import path from 'node:path';
import { exists, readJson, writeJsonAtomic, type JsonData } from '../fsx.js';
import { finalizeRouteWithProof } from './route-finalizer.js';
import { routeRequiresAgentIntake } from '../agents/agent-plan.js';
import { readAgentGateStatus } from '../agents/agent-gate.js';
import { DEFAULT_AGENT_COUNT } from '../agents/agent-schema.js';
import { evaluateGate } from '../stop-gate/gate-evaluator.js';

const AGENT_ARTIFACTS = [
  'agents/agent-proof-evidence.json',
  'agents/agent-sessions.json',
  'agents/agent-leases.json',
  'agents/agent-consensus.json',
  'agents/agent-events.jsonl',
  'agents/agent-task-board.json',
  'agents/agent-concurrency-policy.json'
];

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
  const mission = await readJson(path.join(missionDir, 'mission.json'), {});
  const prompt = mission.prompt || '';
  const agentRequired = agents !== false && routeRequiresAgentIntake(route, { task: prompt, noAgents: agents === false });
  if (agentRequired && mock) await ensureMockAgentEvidence(root, missionId, route, prompt);
  const agentGate = agentRequired ? await readAgentGateStatus(root, missionId) : null;
  const agentArtifacts = agentGate ? await existingAgentArtifacts(root, missionId) : [];
  const agentBlockers = agentRequired && agentGate?.ok !== true ? ['agent_gate_not_passed'] : [];
  const gateBlockers = gateVerdict && !gateVerdict.pass
    ? [`route_gate_${gateVerdict.verdict}`, ...gateVerdict.reasons.map((item) => `route_gate_${item}`)]
    : [];
  if (callerGateMismatch) gateBlockers.push('route_gate_caller_disk_mismatch');
  const computedStatus = computeAutoFinalizeStatus({
    mock,
    passed,
    blockers: [...blockers, ...agentBlockers, ...gateBlockers]
  });
  const statusResolution = applyStatusHint(computedStatus, statusHint);
  const finalStatus = statusResolution.status;
  const proof = await finalizeRouteWithProof(root, {
    missionId,
    route,
    gateFile,
    gate: gateObject,
    artifacts: [...artifacts, ...agentArtifacts],
    claims: claims.length ? claims : [{ id: String(route).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '-auto-finalize', status: mock ? 'verified_partial' : 'supported', evidence: gateFile || 'route-command' }],
    visualEvidence,
    dbEvidence,
    testEvidence,
    commandEvidence: command ? [{ ...command, ok: command.ok !== false }] : null,
    unverified: [
      ...unverified,
      ...(agentGate?.proof?.fake_backend_disclaimer ? [agentGate.proof.fake_backend_disclaimer] : []),
      ...(mock && agentBlockers.length ? [`Mock agent intake does not satisfy full production gate: ${agentBlockers.join(', ')}`] : []),
      ...(mock ? ['Route was finalized from an explicit mock/fixture command path.'] : []),
      ...(gateVerdict?.verdict === 'mock_only' ? ['Route gate is mock fixture evidence and cannot satisfy a real completion gate.'] : []),
      ...(statusResolution.rejected ? [`statusHint rejected: requested ${statusResolution.rejected.requested}, computed ${statusResolution.rejected.computed}.`] : []),
      ...(!passed && !mock ? ['Route gate did not pass' + (reason ? ': ' + reason : '') + '.'] : [])
    ],
    blockers: [
      ...blockers,
      ...agentBlockers,
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

async function existingAgentArtifacts(root: any, missionId: any) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const artifacts: any[] = [];
  for (const artifact of AGENT_ARTIFACTS) {
    if (await exists(path.join(dir, artifact))) artifacts.push('.sneakoscope/missions/' + missionId + '/' + artifact);
  }
  return artifacts;
}

async function ensureMockAgentEvidence(root: any, missionId: string, route: string, prompt: string) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId, 'agents');
  if (!(await exists(path.join(dir, 'agent-sessions.json')))) await writeJsonAtomic(path.join(dir, 'agent-sessions.json'), { schema: 'sks.agent-sessions.v1', sessions: [], all_closed: true });
  if (!(await exists(path.join(dir, 'agent-leases.json')))) await writeJsonAtomic(path.join(dir, 'agent-leases.json'), { schema: 'sks.agent-leases.v1', leases: [], no_overlap_ok: true });
  if (!(await exists(path.join(dir, 'agent-consensus.json')))) await writeJsonAtomic(path.join(dir, 'agent-consensus.json'), { schema: 'sks.agent-consensus.v1', ok: true, route, prompt, blockers: [] });
  if (!(await exists(path.join(dir, 'agent-task-board.json')))) await writeJsonAtomic(path.join(dir, 'agent-task-board.json'), { schema: 'sks.agent-task-board.v1', tasks: [] });
  if (!(await exists(path.join(dir, 'agent-janitor-report.json')))) await writeJsonAtomic(path.join(dir, 'agent-janitor-report.json'), { schema: 'sks.agent-janitor-report.v1', ok: true, mission_id: missionId, project_hash: null, blockers: [] });
  if (!(await exists(path.join(dir, 'agent-concurrency-policy.json')))) {
    await writeJsonAtomic(path.join(dir, 'agent-concurrency-policy.json'), { schema: 'sks.agent-concurrency-policy.v1', agents: DEFAULT_AGENT_COUNT, concurrency: DEFAULT_AGENT_COUNT, backend: 'fake' });
  }
  if (!(await exists(path.join(dir, 'agent-proof-evidence.json')))) {
    await writeJsonAtomic(path.join(dir, 'agent-proof-evidence.json'), {
      schema: 'sks.agent-proof-evidence.v1',
      ok: false,
      status: 'mock_fixture',
      execution_class: 'mock_fixture',
      mission_id: missionId,
      route,
      backend: 'fake',
      real_parallel_claim: false,
      fake_backend_disclaimer: 'fixture only; no real parallel execution claim',
      agent_count: DEFAULT_AGENT_COUNT,
      max_agents: 20,
      all_sessions_closed: true,
      ledger_hash_chain_ok: true,
      no_overlap_ok: true,
      consensus_ok: true,
      janitor_report: 'agents/agent-janitor-report.json',
      janitor_ok: true,
      blockers: ['mock_fixture_cannot_satisfy_real_agent_gate']
    });
  }
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
