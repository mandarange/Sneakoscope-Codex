import path from 'node:path';
import { projectRoot, writeJsonAtomic } from '../fsx.mjs';
import { createMission, missionDir, setCurrent } from '../mission.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { routePrompt } from '../routes.mjs';
import { latestTrustReport } from '../trust-kernel/trust-report.mjs';
import { flag, positionalArgs } from './command-utils.mjs';

export async function runCommand(args = []) {
  const root = await projectRoot();
  const prompt = positionalArgs(args).join(' ').trim();
  if (!prompt) {
    console.error('Usage: sks run "task" [--visual|--research|--db] [--mock] [--json]');
    process.exitCode = 2;
    return;
  }
  const route = classifyRunRoute(prompt, args);
  const { id, dir } = await createMission(root, { mode: 'run', prompt });
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: flag(args, '--mock') ? 'RUN_MOCK_FINALIZE' : 'RUN_ROUTE_SELECTED',
    implementation_allowed: true
  });
  const classification = {
    schema: 'sks.run-classification.v1',
    mission_id: id,
    prompt,
    route: route.command,
    reason: route.description || 'route classifier selected this SKS route',
    mock: flag(args, '--mock'),
    next_action: runNextAction(route, id, args)
  };
  await writeJsonAtomic(path.join(dir, 'run-classification.json'), classification);
  if (!flag(args, '--mock')) {
    const result = { schema: 'sks.run.v1', ok: true, mission_id: id, route: route.command, classification, status: 'prepared' };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`SKS run prepared ${route.command} mission ${id}`);
    console.log(`Next: ${classification.next_action}`);
    return result;
  }
  const gate = { schema: 'sks.run-gate.v1', ok: true, passed: true, route: route.command, mock: true };
  await writeJsonAtomic(path.join(missionDir(root, id), 'run-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route: route.command,
    gateFile: 'run-gate.json',
    gate,
    artifacts: ['run-classification.json', 'run-gate.json', 'completion-proof.json'],
    mock: true,
    visual: flag(args, '--visual'),
    statusHint: 'verified_partial',
    command: { cmd: `sks run "${prompt}" --mock`, status: 0 }
  });
  const trust = await latestTrustReport(root, id);
  const result = {
    schema: 'sks.run.v1',
    ok: proof.ok,
    mission_id: id,
    route: route.command,
    status: proof.proof?.status || 'not_verified',
    trust_status: trust.status,
    classification,
    completion_proof: { ok: proof.ok, validation: proof.validation },
    trust_report: trust
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`SKS run: ${result.status} (${route.command})`);
  console.log(`Mission: ${id}`);
  console.log(`Trust: ${trust.status}`);
  return result;
}

function classifyRunRoute(prompt, args) {
  if (flag(args, '--visual')) return routePrompt('$Image-UX-Review');
  if (flag(args, '--research')) return routePrompt('$Research');
  if (flag(args, '--db')) return routePrompt('$DB');
  const route = routePrompt(prompt);
  return route?.command === '$SKS' ? routePrompt('$Team') : route;
}

function runNextAction(route, id, args) {
  if (flag(args, '--mock')) return 'mock run finalizes immediately for release fixture evidence';
  if (route.command === '$Research') return `sks research run ${id} --json`;
  if (route.command === '$QA-LOOP') return `sks qa-loop run ${id} --json`;
  return `continue ${route.command} mission ${id} through the selected SKS route`;
}
