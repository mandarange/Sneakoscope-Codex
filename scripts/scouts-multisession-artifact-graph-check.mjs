#!/usr/bin/env node
import path from 'node:path';
import { assertCondition, missionDir, readJson, runFiveScoutFixture, scoutRoleResults, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'artifact-graph' });
const dir = missionDir(run.mission_id);
const engine = await readJson(path.join(dir, 'scout-engine-result.json'));
const gate = await readJson(path.join(dir, 'scout-gate.json'));
const guard = await readJson(path.join(dir, 'scout-readonly-guard.json'));
const consensus = await readJson(path.join(dir, 'scout-consensus.json'));
const roles = await scoutRoleResults(run.mission_id);

assertCondition(/^scout-run-\d+.*-local-static-[a-f0-9]{8}$/.test(run.engine_run_id), blockers, 'engine_run_id_format_invalid');
assertCondition(run.artifact_namespace === 'canonical', blockers, 'canonical_artifact_namespace_missing');
assertCondition(engine?.schema === 'sks.scout-engine-result.v2', blockers, 'engine_result_v2_missing');
assertCondition(gate?.passed === true, blockers, 'scout_gate_not_passed');
assertCondition(gate?.schema_valid_confirmed === true, blockers, 'schema_valid_confirmed_missing');
assertCondition(guard?.schema === 'sks.scout-readonly-guard.v2' && guard.passed === true, blockers, 'readonly_guard_v2_missing_or_blocked');
assertCondition(consensus?.schema_valid_results === 5, blockers, 'consensus_schema_valid_count_mismatch');
for (const result of roles) {
  assertCondition(result?.schema === 'sks.scout-result.v3', blockers, `${result?.scout_id || 'unknown'}:result_schema_not_v3`);
  assertCondition(result?.engine_run_id === run.engine_run_id, blockers, `${result?.scout_id || 'unknown'}:engine_run_id_missing`);
  assertCondition(Boolean(result?.scout_session_id), blockers, `${result?.scout_id || 'unknown'}:scout_session_id_missing`);
  assertCondition(result?.session_lifecycle?.status === 'completed', blockers, `${result?.scout_id || 'unknown'}:session_lifecycle_missing`);
}

await writeReport('scouts-multisession-artifact-graph.json', {
  schema: 'sks.scouts-multisession-artifact-graph.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  artifact_namespace: run.artifact_namespace,
  artifacts_dir: run.artifacts_dir,
  blockers
});
