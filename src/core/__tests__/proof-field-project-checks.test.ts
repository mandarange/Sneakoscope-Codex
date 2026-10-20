import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProofField, validateProofFieldReport } from '../proof-field.js';
import { buildPipelinePlan } from '../pipeline-internals/runtime-core.js';

// The commands only SKS's own repository has. A user project's plan must never
// tell the agent to run them.
const SKS_REPO_COMMANDS = /packcheck|selftest|release:check|dist\/bin\/sks|db-safety\.test/;

async function project(t: any, files: Record<string, string>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-proof-field-project-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    await fsp.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fsp.writeFile(path.join(root, file), text);
  }
  return root;
}

test('proof field verification runs the target project\'s own scripts through its package manager', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: 'shop', private: true, scripts: { typecheck: 'tsc --noEmit', lint: 'next lint', test: 'vitest run', build: 'next build' } }),
    'pnpm-lock.yaml': 'lockfileVersion: 9\n'
  });
  const report: any = await buildProofField(root, { intent: 'fix the cart total rounding', changedFiles: ['src/app/cart/total.ts'] });

  assert.equal(validateProofFieldReport(report).ok, true, validateProofFieldReport(report).issues.join(','));
  assert.deepEqual(report.proof_cones.map((cone: any) => cone.id), ['source_code']);
  assert.deepEqual(report.fast_lane_decision.verification, ['pnpm run typecheck', 'pnpm run lint', 'pnpm test']);
  assert.deepEqual(report.verification_stage_cache.stage1_commands, ['pnpm run typecheck', 'pnpm run lint', 'pnpm test']);
  assert.equal(report.execution_lane.fast_lane_allowed, true);
  assert.doesNotMatch(JSON.stringify(report), SKS_REPO_COMMANDS);
});

test('a project without scripts gets plain instructions, never invented commands', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: 'notes', private: true, scripts: { test: 'echo "Error: no test specified" && exit 1' } })
  });
  const docs: any = await buildProofField(root, { intent: 'clarify the setup section', changedFiles: ['README.md'] });
  assert.deepEqual(docs.proof_cones.map((cone: any) => cone.id), ['docs_surface']);
  assert.deepEqual(docs.fast_lane_decision.verification, ['re-read the changed docs against the code they describe']);
  assert.deepEqual(docs.verification_stage_cache.stage1_commands, []);
  assert.equal(docs.execution_lane.fast_lane_allowed, true);

  // npm's placeholder test script only fails, so it is not offered as a check.
  const code: any = await buildProofField(root, { intent: 'fix the parser', changedFiles: ['lib/parse.js'] });
  assert.deepEqual(code.fast_lane_decision.verification, ['run the tests that cover the changed files']);
  assert.doesNotMatch(JSON.stringify({ docs, code }), SKS_REPO_COMMANDS);
});

test('work is skipped as negative work only when no selected cone touches it', async (t) => {
  const root = await project(t, {});
  const report: any = await buildProofField(root, { intent: 'document and fix the parser', changedFiles: ['README.md', 'lib/parse.js'] });
  const skipped = report.negative_work_cache.filter((item: any) => item.disposition === 'skip_with_evidence').map((item: any) => item.id);
  // docs_surface would skip browser e2e, but source_code may be UI code, so it stays.
  assert.ok(!skipped.includes('browser_ui_e2e'), skipped.join(','));
  assert.ok(skipped.includes('database_migration'), skipped.join(','));
});

test('an attached proof field and a release-surface plan name only project checks', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: 'widget', version: '1.0.0', scripts: { test: 'node --test', build: 'tsc -p .' } })
  });
  const proofField: any = await buildProofField(root, { intent: 'bump the widget version', changedFiles: ['package.json', 'CHANGELOG.md'] });
  assert.ok(proofField.proof_cones.some((cone: any) => cone.id === 'release_surface'));
  assert.ok(proofField.fast_lane_decision.verification.includes('npm run build'));
  assert.ok(proofField.fast_lane_decision.verification.includes('npm pack --dry-run'));

  const plan: any = buildPipelinePlan({ task: 'bump the widget version', proofField, changedFiles: proofField.changed_files });
  assert.equal(plan.verification_budget, 'release');
  assert.ok(plan.verification.includes('npm test'));
  assert.doesNotMatch(JSON.stringify(plan.verification), SKS_REPO_COMMANDS);
});
