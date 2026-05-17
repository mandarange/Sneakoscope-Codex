import path from 'node:path';
import { projectRoot, readJson } from '../core/fsx.mjs';
import { findLatestMission, loadMission } from '../core/mission.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { writeImageUxReviewRouteArtifacts } from '../core/image-ux-review.mjs';
import { finalizeRouteWithProof } from '../core/proof/route-finalizer.mjs';

export async function run(command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const missionArg = args[1] && !String(args[1]).startsWith('--') ? args[1] : 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    const result = { schema: 'sks.image-ux-review-status.v1', ok: false, status: 'missing_mission' };
    if (flag(args, '--json')) return printJson(result);
    console.error('No mission found.');
    process.exitCode = 1;
    return;
  }
  const { dir, mission } = await loadMission(root, missionId);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  if (action === 'build' || action === 'run' || (action === 'status' && flag(args, '--mock'))) {
    const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract);
    const route = command === 'ux-review' ? '$UX-Review' : command === 'visual-review' ? '$Visual-Review' : command === 'ui-ux-review' ? '$UI-UX-Review' : '$Image-UX-Review';
    const proof = await finalizeRouteWithProof(root, { missionId, route, mock: flag(args, '--mock'), artifacts: Object.keys(artifacts), claims: [{ id: 'image-ux-review-fixture', status: 'verified_partial' }] });
    const result = { schema: 'sks.image-ux-review-build.v1', ok: proof.ok, mission_id: missionId, artifacts, proof: proof.validation };
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image UX review: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
    if (!proof.ok) process.exitCode = 1;
    return;
  }
  const gate = await readJson(path.join(dir, 'image-ux-review-gate.json'), null);
  const result = { schema: 'sks.image-ux-review-status.v1', ok: true, mission_id: missionId, gate };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Image UX Review mission: ${missionId}`);
  console.log(`Gate: ${gate?.passed ? 'passed' : gate ? 'present' : 'missing'}`);
}
