import path from 'node:path';
import { exists, readJson } from '../fsx.js';
import { missionDir } from '../mission.js';
import { SCOUT_COUNT, SCOUT_GATE_SCHEMA, SCOUT_ROLES } from './scout-schema.js';

export function evaluateScoutGate({ missionId = null, route = '$Team', plan = null, results = [], consensus = null, handoffWritten = false }: any = {}) {
  const completed = results.filter((result: any) => result.status === 'done').length;
  const readOnlyConfirmed = results.length === SCOUT_COUNT && results.every((result: any) => result.read_only === true);
  const implementationSlicesPresent = Array.isArray(consensus?.implementation_slices) && consensus.implementation_slices.length > 0;
  const verificationPlanPresent = Array.isArray(consensus?.required_tests) && consensus.required_tests.length > 0;
  const riskReviewPresent = results.some((result: any) => result.scout_id === 'scout-3-safety-db' && result.status === 'done');
  const visualVoxelReviewPresent = results.some((result: any) => result.scout_id === 'scout-4-visual-voxel' && result.status === 'done');
  const blockers = [
    ...(completed !== SCOUT_COUNT ? [`completed_scouts_${completed}_of_${SCOUT_COUNT}`] : []),
    ...(readOnlyConfirmed ? [] : ['read_only_not_confirmed']),
    ...(consensus ? [] : ['scout-consensus.json_missing']),
    ...(handoffWritten ? [] : ['scout-handoff.md_missing']),
    ...(implementationSlicesPresent ? [] : ['implementation_slices_missing']),
    ...(verificationPlanPresent ? [] : ['verification_plan_missing']),
    ...(riskReviewPresent ? [] : ['risk_review_missing']),
    ...(visualVoxelReviewPresent ? [] : ['visual_voxel_review_missing']),
    ...results.flatMap((result: any) => result.blockers || []),
    ...(plan?.scout_count === SCOUT_COUNT ? [] : ['scout-team-plan_count_mismatch'])
  ];
  return {
    schema: SCOUT_GATE_SCHEMA,
    mission_id: missionId,
    route,
    passed: blockers.length === 0,
    required_scouts: SCOUT_COUNT,
    completed_scouts: completed,
    read_only_confirmed: readOnlyConfirmed,
    consensus_written: Boolean(consensus),
    handoff_written: Boolean(handoffWritten),
    implementation_slices_present: implementationSlicesPresent,
    verification_plan_present: verificationPlanPresent,
    risk_review_present: riskReviewPresent,
    visual_voxel_review_present: visualVoxelReviewPresent,
    blockers,
    unverified: results.flatMap((result: any) => result.unverified || [])
  };
}

export async function readScoutResults(root: any, missionId: any) {
  const dir = missionDir(root, missionId);
  const results: any[] = [];
  for (const role of SCOUT_ROLES) {
    const file = path.join(dir, role.json);
    const result = await readJson(file, null);
    if (result) results.push(result);
  }
  return results;
}

export async function readScoutGateStatus(root: any, missionId: any) {
  if (!missionId) return { ok: false, missing: ['mission_id'], gate: null };
  const dir = missionDir(root, missionId);
  const gateFile = path.join(dir, 'scout-gate.json');
  const gate = await readJson(gateFile, null);
  if (!gate) return {
    ok: false,
    missing: ['scout-gate.json', 'scout-consensus.json', 'scout-handoff.md'],
    gate: null
  };
  const missing: any[] = [];
  if (gate.passed !== true) missing.push(...(gate.blockers?.length ? gate.blockers : ['scout_gate_not_passed']));
  for (const file of ['scout-consensus.json', 'scout-handoff.md']) {
    if (!(await exists(path.join(dir, file)))) missing.push(file);
  }
  return {
    ok: gate.passed === true && missing.length === 0,
    missing,
    gate
  };
}
