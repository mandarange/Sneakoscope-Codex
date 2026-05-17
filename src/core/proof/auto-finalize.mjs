import path from 'node:path';
import { exists, readJson } from '../fsx.mjs';
import { finalizeRouteWithProof } from './route-finalizer.mjs';
import { ensureFiveScoutIntake } from '../scouts/scout-runner.mjs';
import { routeRequiresScoutIntake } from '../scouts/scout-plan.mjs';
import { scoutArtifactList } from '../scouts/scout-artifacts.mjs';

export async function maybeFinalizeRoute(root, {
  missionId,
  route,
  gateFile = null,
  gate = null,
  artifacts = [],
  claims = [],
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
  scouts = undefined
} = {}) {
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
  const scoutResult = scoutRequired
    ? await ensureFiveScoutIntake(root, {
      missionId,
      route,
      task: mission.prompt || '',
      mock,
      mode: mock ? 'auto-finalize-mock' : 'auto-finalize'
    })
    : null;
  const scoutArtifacts = scoutResult?.required === false ? [] : scoutArtifactList();
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
    visualEvidence: null,
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
    visualClaim: visual
  });
  return { ...proof, auto_finalized: true, gate_passed: passed, status_hint: finalStatus };
}
