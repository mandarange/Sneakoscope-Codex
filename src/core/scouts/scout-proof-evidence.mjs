import path from 'node:path';
import { exists, readJson } from '../fsx.mjs';
import { missionDir } from '../mission.mjs';
import { SCOUT_COUNT, SCOUT_PROOF_EVIDENCE_SCHEMA } from './scout-schema.mjs';

export async function readScoutProofEvidence(root, missionId) {
  if (!missionId) return null;
  const dir = missionDir(root, missionId);
  const gateFile = path.join(dir, 'scout-gate.json');
  const consensusFile = path.join(dir, 'scout-consensus.json');
  const handoffFile = path.join(dir, 'scout-handoff.md');
  if (!(await exists(gateFile)) && !(await exists(consensusFile)) && !(await exists(handoffFile))) return null;
  const gate = await readJson(gateFile, null);
  const consensus = await readJson(consensusFile, null);
  return {
    schema: SCOUT_PROOF_EVIDENCE_SCHEMA,
    required: true,
    status: gate?.passed === true ? 'passed' : 'blocked',
    scout_count: Number(consensus?.scout_count || gate?.required_scouts || SCOUT_COUNT),
    completed_scouts: Number(consensus?.completed_scouts || gate?.completed_scouts || 0),
    parallel_mode: consensus?.parallel_mode || null,
    gate: gate?.passed === true ? 'passed' : 'blocked',
    consensus: `.sneakoscope/missions/${missionId}/scout-consensus.json`,
    handoff: `.sneakoscope/missions/${missionId}/scout-handoff.md`,
    gate_file: `.sneakoscope/missions/${missionId}/scout-gate.json`,
    read_only_confirmed: gate?.read_only_confirmed === true,
    blockers: gate?.blockers || [],
    unverified: gate?.unverified || []
  };
}

export function disabledScoutProofEvidence(reason = 'explicitly disabled by sealed contract') {
  return {
    schema: SCOUT_PROOF_EVIDENCE_SCHEMA,
    required: false,
    reason,
    status: 'not_verified_for_parallel_speed'
  };
}
