import path from 'node:path';
import { projectRoot, readJson } from '../fsx.js';
import { listSessionStates, stateFile } from '../mission.js';
import { readRouteProof } from '../proof/proof-reader.js';
import { latestTrustReport } from '../trust-kernel/trust-report.js';
import { flag } from './command-utils.js';

export async function statusCommand(args: any = []) {
  const root = await projectRoot();
  const state = await readJson(stateFile(root), {});
  const sessions = await listSessionStates(root);
  const missionId = state.mission_id || null;
  const proof: any = missionId ? await readRouteProof(root, missionId) : null;
  const trust = missionId ? await latestTrustReport(root, missionId) : null;
  const result = {
    schema: 'sks.status.v1',
    root,
    active_mission: missionId,
    route: state.route_command || state.route || state.mode || proof?.route || null,
    phase: state.phase || null,
    trust_status: trust?.status || 'not_verified',
    trust_ok: trust?.ok === true,
    proof_status: proof?.status || 'not_verified',
    agent_status: proof?.evidence?.agents?.status || (state.agents_required === false ? 'not_required' : 'not_recorded'),
    image_voxel_status: proof?.evidence?.image_voxels?.status || 'not_recorded',
    db_safety_status: proof?.evidence?.db || proof?.evidence?.db_safety ? 'recorded' : 'not_recorded',
    next_action: nextAction(state, trust, proof),
    sessions: sessions.map(sessionStatusRow),
    files: missionId ? {
      mission: path.join(root, '.sneakoscope', 'missions', missionId),
      completion_proof: path.join(root, '.sneakoscope', 'missions', missionId, 'completion-proof.json'),
      trust_report: path.join(root, '.sneakoscope', 'missions', missionId, 'trust-report.json')
    } : {}
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`Mission: ${result.active_mission || 'none'}`);
  console.log(`Route:   ${result.route || 'unknown'}`);
  console.log(`Phase:   ${result.phase || 'unknown'}`);
  console.log(`Trust:   ${result.trust_status}`);
  console.log(`Proof:   ${result.proof_status}`);
  console.log(`Agents:  ${result.agent_status}`);
  console.log(`Image:   ${result.image_voxel_status}`);
  console.log(`DB:      ${result.db_safety_status}`);
  console.log(`Next:    ${result.next_action}`);
  printSessionTable(sessions);
}

function sessionStatusRow(row: any) {
  return {
    session_key: row.session_key,
    mission_id: row.mission_id,
    route: row.state?.route_command || row.state?.route || row.state?.mode || null,
    phase: row.phase,
    updated_at: row.updated_at
  };
}

function printSessionTable(sessions: any[] = []) {
  if (!sessions.length) return;
  console.log('Sessions:');
  for (const row of sessions.slice(0, 12).map(sessionStatusRow)) {
    console.log(`  ${row.session_key}  ${row.mission_id || 'none'}  ${row.route || '-'}  ${row.phase || '-'}`);
  }
}

function nextAction(state: any = {}, trust: any = {}, proof: any = {}) {
  if (!state.mission_id) return 'start a route with sks run, $Team, or $Goal';
  if (!proof?.schema) return `write completion proof for ${state.mission_id}`;
  if (trust?.ok) return 'ready for final Honest Mode summary';
  if (trust?.issues?.length) return `resolve trust blocker: ${trust.issues[0]}`;
  return 'run sks trust validate latest --json';
}
