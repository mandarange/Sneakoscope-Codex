import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('route command writes mission evidence index with proof and contract records', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'evidence-index-route' });
  const run = await runSksInRoot(root, ['run', 'fixture', '--mock', '--json']);
  const index = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope/missions', run.mission_id, 'evidence-index.json'), 'utf8'));
  assert.equal(index.schema, 'sks.evidence-index.v1');
  assert.ok(index.records.some((record) => record.kind === 'proof'));
  assert.ok(index.records.some((record) => record.kind === 'route_contract'));
  assert.ok(index.records.some((record) => record.kind === 'trust_report'));
});
