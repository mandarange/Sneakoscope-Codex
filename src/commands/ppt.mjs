import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic } from '../core/fsx.mjs';
import { findLatestMission, loadMission } from '../core/mission.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { writePptBuildArtifacts, writePptRouteArtifacts } from '../core/ppt.mjs';
import { finalizeRouteWithProof } from '../core/proof/route-finalizer.mjs';

export async function run(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
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
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  if (action === 'build') {
    await writePptRouteArtifacts(dir, contract);
    const build = await writePptBuildArtifacts(dir, contract);
    const proof = await finalizeRouteWithProof(root, { missionId, route: '$PPT', mock: flag(args, '--mock'), artifacts: build.files || [], claims: [{ id: 'ppt-build-fixture', status: 'verified_partial' }] });
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
  console.error('Usage: sks ppt build|status <mission-id|latest> [--json] [--mock]');
  process.exitCode = 1;
}
