#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertCondition, existingCanonicalFingerprint, missionDir, readJson, runFiveScoutFixture, runSksJson, writeReport } from './scouts-1-14-1-lib.mjs';

const seed = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'benchmark-isolation-seed' });
const before = await existingCanonicalFingerprint(seed.mission_id);
const bench = await runSksJson(['scouts', 'bench', seed.mission_id, '--engine', 'local-static', '--mock', '--json']);
const after = await existingCanonicalFingerprint(seed.mission_id);
const blockers = [];
const parallelDir = bench.parallel_artifacts_dir;
const sequentialDir = bench.sequential_artifacts_dir;
const parallelGate = await readJson(path.join(parallelDir, 'scout-gate.json'));
const sequentialGate = await readJson(path.join(sequentialDir, 'scout-gate.json'));

assertCondition(bench.schema === 'sks.scout-benchmark.v3', blockers, 'benchmark_schema_not_v3');
assertCondition(bench.canonical_artifacts_modified === false, blockers, 'benchmark_report_says_canonical_modified');
assertCondition(JSON.stringify(before) === JSON.stringify(after), blockers, 'canonical_artifacts_changed');
assertCondition(bench.parallel_engine_run_id && bench.sequential_engine_run_id && bench.parallel_engine_run_id !== bench.sequential_engine_run_id, blockers, 'benchmark_run_ids_not_distinct');
assertCondition(fs.existsSync(parallelDir) && fs.existsSync(sequentialDir), blockers, 'benchmark_artifact_dirs_missing');
assertCondition(parallelGate?.engine_run_id === bench.parallel_engine_run_id, blockers, 'parallel_gate_engine_run_id_mismatch');
assertCondition(sequentialGate?.engine_run_id === bench.sequential_engine_run_id, blockers, 'sequential_gate_engine_run_id_mismatch');

await writeReport('scouts-benchmark-isolation.json', {
  schema: 'sks.scouts-benchmark-isolation.v1',
  ok: blockers.length === 0,
  mission_id: seed.mission_id,
  benchmark_file: path.join(missionDir(seed.mission_id), 'scout-benchmark.json'),
  benchmark: bench,
  blockers
});
