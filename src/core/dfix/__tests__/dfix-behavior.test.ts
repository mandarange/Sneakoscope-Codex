import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {
  DFIX_GATE_ARTIFACT,
  DFIX_PATCH_RESULT_ARTIFACT,
  createDfixRun,
  writeDfixDiagnosis,
  writeDfixGate,
  writeDfixPatchPlan,
  writeDfixPatchResult,
  writeDfixVerification
} from '../../dfix.js';

async function tempRoot() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sks-dfix-test-'));
}

test('DFix writes patch envelope artifacts', async () => {
  const root = await tempRoot();
  const run = await createDfixRun(root, ['fixture']);
  await writeDfixDiagnosis(root, run.dir, { prompt: 'fixture', error: 'Expected value', file: 'fixture.ts', mock: true });
  await writeDfixPatchPlan(run.dir, { file: 'fixture.ts' });
  await writeDfixPatchResult(root, run.dir, { apply: false, file: 'fixture.ts' });

  const patchResult = JSON.parse(await fsp.readFile(path.join(run.dir, DFIX_PATCH_RESULT_ARTIFACT), 'utf8'));
  assert.equal(patchResult.schema, 'sks.dfix-patch-result.v1');
  assert.equal(Array.isArray(patchResult.rollback_plan), true);
});

test('DFix verification failure does not pass the gate', async () => {
  const root = await tempRoot();
  const run = await createDfixRun(root, ['fixture']);
  await writeDfixDiagnosis(root, run.dir, { prompt: 'fixture', error: 'Expected value', file: 'fixture.ts', mock: true });
  await writeDfixPatchPlan(run.dir, { file: 'fixture.ts' });
  await writeDfixPatchResult(root, run.dir, { apply: false, file: 'fixture.ts' });
  await writeDfixVerification(root, run.dir, { command: 'node -e "process.exit(2)"', runCommand: true });
  const { gate } = await writeDfixGate(run.dir, {});

  assert.equal(gate.passed, false);
  assert.ok(gate.blockers.includes('verification_command_failed'));
});

test('DFix gate blocks when required artifacts are incomplete', async () => {
  const root = await tempRoot();
  const run = await createDfixRun(root, ['fixture']);
  const { gate } = await writeDfixGate(run.dir, {});

  assert.equal(gate.passed, false);
  assert.equal(gate.schema, 'sks.dfix-gate.v1');
  assert.equal((await fsp.stat(path.join(run.dir, DFIX_GATE_ARTIFACT))).isFile(), true);
});
