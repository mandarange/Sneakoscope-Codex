#!/usr/bin/env node
import path from 'node:path';
import { assertCondition, missionDir, readJson, runFiveScoutFixture, scoutRoleResults, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({
  engine: 'fake-codex-exec',
  mock: true,
  requireOutputSchema: true,
  writeCanonical: true,
  mode: 'output-schema-wiring'
});
const dir = missionDir(run.mission_id);
const engine = await readJson(path.join(dir, 'scout-engine-result.json'));
const roles = await scoutRoleResults(run.mission_id);

assertCondition(run.engine === 'fake-codex-exec', blockers, 'fake_codex_exec_not_selected');
assertCondition(engine?.output_schema_used === true, blockers, 'engine_output_schema_used_false');
assertCondition(String(engine?.output_schema_path || '').endsWith('schemas/codex/scout-result.schema.json'), blockers, 'engine_output_schema_path_missing');
for (const result of roles) {
  assertCondition(result?.output_schema_used === true, blockers, `${result?.scout_id || 'unknown'}:output_schema_used_false`);
  assertCondition(String(result?.output_schema_path || '').endsWith('schemas/codex/scout-result.schema.json'), blockers, `${result?.scout_id || 'unknown'}:output_schema_path_missing`);
  assertCondition(result?.schema_validation?.ok === true, blockers, `${result?.scout_id || 'unknown'}:schema_validation_failed`);
}

await writeReport('scouts-output-schema-wiring.json', {
  schema: 'sks.scouts-output-schema-wiring.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  output_schema_path: engine?.output_schema_path || null,
  blockers
});
