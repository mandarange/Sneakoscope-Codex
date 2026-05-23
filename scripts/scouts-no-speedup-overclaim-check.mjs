#!/usr/bin/env node
import { assertCondition, runFiveScoutFixture, runSksJson, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'no-speedup-overclaim' });
const bench = await runSksJson(['scouts', 'bench', run.mission_id, '--engine', 'local-static', '--mock', '--json']);

assertCondition(run.performance?.claim_allowed === false, blockers, 'local_static_run_claim_allowed_true');
assertCondition(run.real_parallel === false, blockers, 'local_static_run_real_parallel_true');
assertCondition(bench.claim_allowed === false, blockers, 'local_static_benchmark_claim_allowed_true');
assertCondition(bench.real_parallel === false, blockers, 'local_static_benchmark_real_parallel_true');
assertCondition(bench.speedup === 0, blockers, 'local_static_benchmark_speedup_nonzero');
assertCondition(Array.isArray(bench.notes) && bench.notes.some((note) => /cannot claim real speedup/.test(note)), blockers, 'no_speedup_note_missing');

await writeReport('scouts-no-speedup-overclaim.json', {
  schema: 'sks.scouts-no-speedup-overclaim.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  benchmark: bench,
  blockers
});
