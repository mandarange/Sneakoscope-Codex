#!/usr/bin/env node
import path from 'node:path';
import { assertCondition, missionDir, readJson, runFiveScoutFixture, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'readonly-guard-v2' });
const guard = await readJson(path.join(missionDir(run.mission_id), 'scout-readonly-guard.json'));

assertCondition(guard?.schema === 'sks.scout-readonly-guard.v2', blockers, 'readonly_guard_schema_not_v2');
assertCondition(guard?.passed === true, blockers, 'readonly_guard_blocked');
assertCondition(Array.isArray(guard?.allowed_writes) && guard.allowed_writes.some((row) => row.includes('scout-benchmarks')), blockers, 'scout_benchmarks_allowed_write_missing');
assertCondition(Array.isArray(guard?.git_status_delta?.disallowed) && guard.git_status_delta.disallowed.length === 0, blockers, 'git_status_disallowed_delta_present');
assertCondition(guard?.external_boundary?.external_workspace_writes_allowed === false, blockers, 'external_boundary_not_sealed');

await writeReport('scouts-readonly-guard-v2.json', {
  schema: 'sks.scouts-readonly-guard-v2.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  guard,
  blockers
});
