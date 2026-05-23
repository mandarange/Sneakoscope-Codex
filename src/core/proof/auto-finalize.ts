import path from 'node:path';
import { exists, readJson, type JsonData } from '../fsx.js';
import { finalizeRouteWithProof } from './route-finalizer.js';
import { ensureFiveScoutIntake } from '../scouts/scout-runner.js';
import { routeRequiresScoutIntake } from '../scouts/scout-plan.js';
import { scoutArtifactList } from '../scouts/scout-artifacts.js';

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
  scouts = undefined,
  allowActiveWrongnessPartial = false
}: any = {}): Promise<JsonData> {
  if (!missionId || !route) {
    return { ok: false, skipped: true, reason: 'mission_id_or_route_missing' };
  }
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  const gateObject = gate || (gateFile && await exists(path.join(missionDir, gateFile))
    ? await readJson(path.join(missionDir, gateFile), null)
    : null);
  const passed = gateObject?.passed === true || gateObject?.ok === true || gateObject?.status === 'pass';
  const mission = await readJson(path.join(missionDir, 'mission.json'), {});
  const scoutRequired = scouts !== false && routeRequiresScoutIntake(route, { task: mission.prompt || '' });
  const scoutResult: any = scoutRequired
    ? await ensureFiveScoutIntake(root, {
      missionId,
      route,
      task: mission.prompt || '',
      mock,
      mode: mock ? 'auto-finalize-mock' : 'auto-finalize'
    })
    : null;
  const scoutArtifacts = scoutResult ? (scoutResult.required === false ? [] : await existingScoutArtifacts(root, missionId)) : [];
  const scoutBlockers = scoutResult?.required && scoutResult.gate?.passed !== true && scoutResult.status !== 'already_passed'
    ? ['scout_gate_not_passed']
    : [];
  const finalStatus = statusHint || (blockers.length ? 'blocked' : (passed ? (mock ? 'verified_partial' : 'verified') : (mock ? 'verified_partial' : 'blocked')));
  const proof = await finalizeRouteWithProof(root, {
    missionId,
    route,
    gateFile,
    gate: gateObject,
    artifacts: [...artifacts, ...scoutArtifacts],
    claims: claims.length ? claims : [{ id: `${String(route).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-auto-finalize`, status: mock ? 'verified_partial' : 'supported', evidence: gateFile || 'route-command' }],
    visualEvidence,
    dbEvidence,
    testEvidence,
    commandEvidence: command ? [{ ...command, ok: command.ok !== false }] : null,
    unverified: [
      ...unverified,
      ...(scoutResult?.performance?.claim_allowed === false ? ['Scout performance timing recorded; no real speedup claim is made.'] : []),
      ...(mock ? ['Route was finalized from an explicit mock/fixture command path.'] : []),
      ...(!passed && !mock ? [`Route gate did not pass${reason ? `: ${reason}` : ''}.`] : [])
    ],
    blockers: [
      ...blockers,
      ...scoutBlockers,
      ...(!passed && !mock ? ['route_gate_not_passed'] : [])
    ],
    statusHint: finalStatus,
    mock,
    fixClaim,
    requireRelation,
    visualClaim: visual,
    scouts,
    allowActiveWrongnessPartial
  });
  return { ...proof, auto_finalized: true, gate_passed: passed, status_hint: finalStatus };
}

async function existingScoutArtifacts(root: any, missionId: any) {
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const artifacts: any[] = [];
  for (const artifact of scoutArtifactList()) {
    if (await exists(path.join(dir, artifact))) artifacts.push(artifact);
  }
  return artifacts;
}
