import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { runSearchVisibilityCommand } from '../seo-command.js';

async function makeSeoMission(options: {
  seoGate?: Record<string, unknown> | null;
  mutationPlan?: boolean;
  rollbackManifest?: boolean;
} = {}): Promise<{ root: string; missionId: string }> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-seo-command-'));
  const missionId = 'M-seo-fixture-0001';
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  const artifactDir = path.join(missionDir, 'search-visibility');
  await fsp.mkdir(artifactDir, { recursive: true });
  await fsp.writeFile(path.join(missionDir, 'mission.json'), JSON.stringify({
    id: missionId,
    mode: 'seo',
    prompt: 'seo audit',
    created_at: new Date().toISOString(),
    phase: 'PREPARE',
    questions_allowed: true,
    implementation_allowed: false,
  }, null, 2));
  if (options.seoGate !== undefined && options.seoGate !== null) {
    await fsp.writeFile(path.join(missionDir, 'seo-gate.json'), JSON.stringify(options.seoGate, null, 2));
  }
  if (options.mutationPlan) {
    await fsp.writeFile(path.join(artifactDir, 'mutation-plan.json'), JSON.stringify({
      schema: 'sks.search-visibility.mutation-plan.v1',
      mission_id: missionId,
      status: 'planned',
      operations: [],
      blockers: [],
    }, null, 2));
  }
  if (options.rollbackManifest) {
    await fsp.writeFile(path.join(artifactDir, 'rollback-manifest.json'), JSON.stringify({
      schema: 'sks.search-visibility.rollback-manifest.v1',
      mission_id: missionId,
      operations: [],
      blockers: [],
    }, null, 2));
  }
  return { root, missionId };
}

test('seo apply is blocked before mutation when no mutation plan exists yet', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const { root, missionId } = await makeSeoMission({ seoGate: { passed: false, ok: false, blockers: [] } });
  const result: any = await runSearchVisibilityCommand('seo', ['apply', missionId, '--root', root, '--apply', '--yes', '--json']);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('seo_apply_missing_mutation_plan'));
  process.exitCode = previousExit;
});

test('seo status surfaces gate_verdict mock_only when the on-disk gate is execution_class mock_fixture', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const { root, missionId } = await makeSeoMission({
    seoGate: { passed: true, ok: true, blockers: [], execution_class: 'mock_fixture' },
  });
  const result: any = await runSearchVisibilityCommand('seo', ['status', missionId, '--root', root, '--json']);
  assert.equal(result.ok, false);
  assert.equal(result.gate_verdict, 'mock_only');
  assert.ok(Array.isArray(result.blockers) && result.blockers.length > 0, 'blockers should be non-empty for a mock-only gate');
  process.exitCode = previousExit;
});

test('seo status surfaces gate_verdict fail when the on-disk gate has passed:false', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const { root, missionId } = await makeSeoMission({
    seoGate: { passed: false, ok: false, blockers: ['some_real_blocker'] },
  });
  const result: any = await runSearchVisibilityCommand('seo', ['status', missionId, '--root', root, '--json']);
  assert.equal(result.ok, false);
  assert.equal(result.gate_verdict, 'fail');
  process.exitCode = previousExit;
});

test('seo status surfaces gate_verdict missing when no gate file exists on disk', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const { root, missionId } = await makeSeoMission({ seoGate: null });
  const result: any = await runSearchVisibilityCommand('seo', ['status', missionId, '--root', root, '--json']);
  assert.equal(result.ok, false);
  assert.equal(result.gate_verdict, 'missing');
  process.exitCode = previousExit;
});
