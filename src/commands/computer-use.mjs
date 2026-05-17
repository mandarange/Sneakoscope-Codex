import { projectRoot } from '../core/fsx.mjs';
import { findLatestMission } from '../core/mission.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { finalizeRouteWithProof } from '../core/proof/route-finalizer.mjs';

export async function run(command, args = []) {
  const root = await projectRoot();
  const missionArg = args.find((arg) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    const result = { schema: 'sks.computer-use-evidence.v1', ok: false, status: 'missing_mission' };
    if (flag(args, '--json')) return printJson(result);
    console.error('No mission found.');
    process.exitCode = 1;
    return;
  }
  const route = command === 'cu' ? '$CU' : '$Computer-Use';
  const proof = await finalizeRouteWithProof(root, {
    missionId,
    route,
    mock: flag(args, '--mock'),
    requireRelation: flag(args, '--fix-claim') || flag(args, '--require-relation'),
    artifacts: ['computer-use-evidence-ledger.json', 'screen-capture-ledger.json', 'image-voxel-ledger.json', 'visual-anchors.json'],
    claims: [{ id: 'computer-use-evidence', status: flag(args, '--mock') ? 'verified_partial' : 'supported' }]
  });
  const result = { schema: 'sks.computer-use-evidence.v1', ok: proof.ok, mission_id: missionId, route, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Computer Use evidence: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
  if (!proof.ok) process.exitCode = 1;
}
