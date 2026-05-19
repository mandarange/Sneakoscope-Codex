import path from 'node:path';
import { nowIso, projectRoot, writeJsonAtomic } from '../fsx.js';
import { createMission, findLatestMission } from '../mission.js';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { computerUseStatusReport } from '../computer-use-status.js';

export async function computerUseCommand(command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'import';
  if (action === 'status' || action === 'doctor') {
    const result = await computerUseStatusReport();
    if (flag(args, '--json')) return printJson(result);
    console.log(`Computer Use status: ${result.status}`);
    if (result.guidance?.length) for (const line of result.guidance) console.log(`- ${line}`);
    if (!result.ok && action === 'doctor') process.exitCode = result.status === 'not_macos' ? 0 : 1;
    return;
  }
  if (action === 'enable') {
    const result = await computerUseStatusReport();
    const response = {
      schema: 'sks.computer-use-enable.v1',
      ok: result.status === 'available',
      status: result.status,
      macos: process.platform === 'darwin',
      guidance: [
        'Open Codex App and grant Screen Recording/Accessibility if macOS prompts.',
        'SKS does not widen MAD-SKS or DB permissions for Computer Use.'
      ],
      current: result
    };
    if (flag(args, '--json')) return printJson(response);
    console.log(`Computer Use enable: ${response.ok ? 'available' : response.status}`);
    for (const line of response.guidance) console.log(`- ${line}`);
    return;
  }
  if (action === 'require') {
    const routeArg = args.includes('--route') ? args[args.indexOf('--route') + 1] : null;
    const result = await computerUseStatusReport();
    const response = { schema: 'sks.computer-use-require.v1', ok: result.status === 'available', route: routeArg || null, status: result.status, evidence: result.evidence, blocker: result.status === 'available' ? null : result.status };
    if (flag(args, '--json')) return printJson(response);
    console.log(`Computer Use requirement for ${routeArg || 'route'}: ${response.ok ? 'available' : `blocked (${response.blocker})`}`);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  if (action === 'import-fixture') return importFixture(root, command, args);
  const missionArg = args.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    const result = { schema: 'sks.computer-use-evidence.v1', ok: false, status: 'missing_mission' };
    if (flag(args, '--json')) return printJson(result);
    console.error('No mission found.');
    process.exitCode = 1;
    return;
  }
  const route = command === 'cu' ? '$CU' : '$Computer-Use';
  const proof = await maybeFinalizeRoute(root, {
    missionId,
    route,
    mock: flag(args, '--mock'),
    visual: true,
    requireRelation: flag(args, '--fix-claim') || flag(args, '--require-relation'),
    artifacts: ['computer-use-evidence-ledger.json', 'screen-capture-ledger.json', 'image-voxel-ledger.json', 'visual-anchors.json'],
    claims: [{ id: 'computer-use-evidence', status: flag(args, '--mock') ? 'verified_partial' : 'supported' }],
    command: { cmd: `sks ${command} ${args.join(' ')}`.trim(), status: 0 }
  });
  const result = { schema: 'sks.computer-use-evidence.v1', ok: proof.ok, mission_id: missionId, route, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Computer Use evidence: ${proof.ok ? 'ok' : 'blocked'} ${missionId}`);
  if (!proof.ok) process.exitCode = 1;
}

async function importFixture(root: any, command: any, args: any) {
  const route = command === 'cu' ? '$CU' : '$Computer-Use';
  const { id, dir } = await createMission(root, { mode: 'computer-use', prompt: 'Computer Use fixture evidence import' });
  const evidence = {
    schema: 'sks.computer-use-evidence-ledger.v1',
    generated_at: nowIso(),
    mission_id: id,
    route,
    actions: [{ id: 'action-1', type: 'click', bbox: [0, 0, 1, 1], status: 'mocked', evidence: 'visual-fixture.png' }],
    mock: true
  };
  const captures = {
    schema: 'sks.screen-capture-ledger.v1',
    generated_at: nowIso(),
    mission_id: id,
    captures: [
      { id: 'before', path: `.sneakoscope/missions/${id}/visual-fixture.png`, status: 'mocked' },
      { id: 'after', path: `.sneakoscope/missions/${id}/visual-fixture.png`, status: 'mocked' }
    ],
    mock: true
  };
  await writeJsonAtomic(path.join(dir, 'computer-use-evidence-ledger.json'), evidence);
  await writeJsonAtomic(path.join(dir, 'screen-capture-ledger.json'), captures);
  const gate = { schema_version: 1, passed: true, ok: true, computer_use_evidence: true, screen_capture_evidence: true, mock: true };
  await writeJsonAtomic(path.join(dir, 'computer-use-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route,
    gateFile: 'computer-use-gate.json',
    gate,
    mock: true,
    visual: true,
    requireRelation: flag(args, '--fix-claim') || flag(args, '--require-relation'),
    artifacts: ['computer-use-evidence-ledger.json', 'screen-capture-ledger.json', 'image-voxel-ledger.json', 'visual-anchors.json', 'completion-proof.json'],
    claims: [{ id: 'computer-use-import-fixture', status: 'verified_partial' }],
    command: { cmd: `sks ${command} import-fixture --mock`, status: 0 }
  });
  const result = { schema: 'sks.computer-use-import-fixture.v1', ok: proof.ok, mission_id: id, route, proof: proof.validation };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Computer Use fixture imported: ${proof.ok ? 'ok' : 'blocked'} ${id}`);
}
