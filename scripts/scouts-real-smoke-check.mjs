#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runFiveScoutFixture, writeReport } from './scouts-1-14-1-lib.mjs';

if (process.env.SKS_TEST_REAL_SCOUTS !== '1') {
  await writeReport('scouts-real-smoke-1.15.0.json', {
    schema: 'sks.scouts-real-smoke.v1',
    ok: true,
    status: 'integration_optional',
    release_gate: 'release:real-check_only',
    reason: 'Set SKS_TEST_REAL_SCOUTS=1 to run real Codex exec Scout smoke.'
  });
  process.exit(0);
}

const full = process.env.SKS_TEST_REAL_SCOUTS_FULL === '1';
const run = await runFiveScoutFixture({
  engine: 'codex-exec-parallel',
  mock: false,
  requireOutputSchema: true,
  writeCanonical: false,
  mode: full ? 'real-smoke-full' : 'real-smoke-minimal',
  task: full ? 'SKS 1.15.0 full real Scout smoke' : 'SKS 1.15.0 minimal real Scout smoke'
});
const noSourceMutation = run.gate?.read_only_guard === true;
const outputSchemaParsed = run.performance?.claim_allowed === true || run.completed_scouts > 0;
const report = {
  schema: 'sks.scouts-real-smoke.v1',
  ok: run.ok === true && noSourceMutation && outputSchemaParsed,
  status: run.ok === true ? 'passed' : 'blocked',
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  mode: full ? 'five_role' : 'minimal_two_role_policy',
  read_only_guard: noSourceMutation ? 'passed' : 'blocked',
  output_schema_parsing: outputSchemaParsed ? 'checked' : 'blocked',
  no_source_file_mutation: noSourceMutation,
  speedup_claim_policy: run.performance?.claim_allowed === true ? 'claim_allowed_with_evidence' : 'no_speedup_claim_without_evidence',
  blockers: run.gate?.blockers || []
};
const out = path.join(process.cwd(), '.sneakoscope', 'reports', 'scouts-real-smoke-1.15.0.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
