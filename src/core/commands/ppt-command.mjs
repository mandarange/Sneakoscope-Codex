import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { createMission, findLatestMission, loadMission } from '../mission.mjs';
import { flag } from '../../cli/args.mjs';
import { printJson } from '../../cli/output.mjs';
import { writePptBuildArtifacts, writePptRouteArtifacts } from '../ppt.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';

export async function pptCommand(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  if (action === 'fixture') return pptFixture(root, args);
  const missionArg = args[1] && !String(args[1]).startsWith('--') ? args[1] : 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    const result = { schema: 'sks.ppt-status.v1', ok: false, status: 'missing_mission' };
    if (flag(args, '--json')) return printJson(result);
    console.error('No mission found.');
    process.exitCode = 1;
    return;
  }
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: fixtureAnswers(), sealed_hash: 'ppt-fixture-contract' });
  if (action === 'build') {
    await writePptRouteArtifacts(dir, contract);
    const build = await writePptBuildArtifacts(dir, contract);
    const proof = await maybeFinalizeRoute(root, { missionId, route: '$PPT', gateFile: 'ppt-gate.json', gate: build.gate, mock: flag(args, '--mock'), visual: true, artifacts: Object.keys(build.files || {}), claims: [{ id: 'ppt-build-fixture', status: 'verified_partial' }], command: { cmd: `sks ppt build ${missionId}`, status: 0 } });
    const result = { schema: 'sks.ppt-build.v1', ok: proof.ok, mission_id: missionId, build, proof: proof.validation };
    if (flag(args, '--json')) return printJson(result);
    console.log(`PPT build: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
    if (!proof.ok) process.exitCode = 1;
    return;
  }
  if (action === 'status') {
    const gate = await readJson(path.join(dir, 'ppt-gate.json'), null);
    const result = { schema: 'sks.ppt-status.v1', ok: true, mission_id: missionId, gate };
    if (flag(args, '--json')) return printJson(result);
    console.log(`PPT mission: ${missionId}`);
    console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
    return;
  }
  await writeJsonAtomic(path.join(dir, 'ppt-command-error.json'), { action, args });
  console.error('Usage: sks ppt fixture|build|status <mission-id|latest> [--json] [--mock]');
  process.exitCode = 1;
}

async function pptFixture(root, args) {
  const { id, dir, mission } = await createMission(root, { mode: 'ppt', prompt: 'PPT fixture route build' });
  const contract = { prompt: mission.prompt, answers: fixtureAnswers(), sealed_hash: 'ppt-fixture-contract' };
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), contract);
  await writePptRouteArtifacts(dir, contract);
  const build = await writePptBuildArtifacts(dir, contract);
  const gate = mockPptFixtureGate(build.gate);
  await writeJsonAtomic(path.join(dir, 'ppt-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$PPT', gateFile: 'ppt-gate.json', gate, mock: true, visual: true, artifacts: Object.keys(build.files || {}), claims: [{ id: 'ppt-fixture', status: 'verified_partial' }], command: { cmd: 'sks ppt fixture --mock', status: 0 } });
  const result = { schema: 'sks.ppt-fixture.v1', ok: proof.ok, mission_id: id, build: { ...build, ok: true, gate }, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`PPT fixture: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
}

function mockPptFixtureGate(gate = {}) {
  return {
    ...gate,
    passed: true,
    mock_fixture: true,
    unsupported_critical_claims_zero: true,
    image_asset_policy_satisfied: true,
    bounded_iteration_complete: true,
    critical_review_issues_zero: true,
    render_report_passed: true,
    fact_ledger_passed: true,
    image_asset_ledger_passed: true,
    review_ledger_passed: true,
    iteration_report_passed: true,
    cleanup_report_passed: true,
    parallel_report_passed: true,
    honest_mode_complete: true,
    blockers: []
  };
}

function fixtureAnswers() {
  return {
    PRESENTATION_AUDIENCE_PROFILE: 'Release reviewer validating SKS 0.9.17 route evidence.',
    PRESENTATION_STP_STRATEGY: 'Segment: developer tooling. Target: Codex trust-layer maintainers. Positioning: proof-first release readiness.',
    PRESENTATION_DELIVERY_CONTEXT: 'Mock release gate fixture.',
    PRESENTATION_PAINPOINT_SOLUTION_MAP: [
      'Route proof gaps -> automatic completion proof',
      'Visual evidence ambiguity -> image voxel anchors',
      'Fixture placeholders -> actual artifact validation'
    ]
  };
}
