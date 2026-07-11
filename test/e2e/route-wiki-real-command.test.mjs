import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { assertImageAnchorsInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('Wiki image ingest command auto-finalizes proof and image anchors', async (t) => {
  const root = await createHermeticProjectRoot({ fixtureName: 'wiki-gate-contract' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const json = await runSksInRoot(root, ['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json']);
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, '$Wiki');
  assert.deepEqual(proof.evidence.route_gate.blockers, []);
  assert.ok(!proof.blockers.includes('route_gate_gate_blockers_not_array'));
  await assertImageAnchorsInRoot(root, json.mission_id);
});

test('Wiki refresh writes the shared blocker-array gate contract', async (t) => {
  const root = await createHermeticProjectRoot({ fixtureName: 'wiki-refresh-gate-contract' });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await runSksInRoot(root, ['wiki', 'refresh', '--json']);

  const missionsDir = path.join(root, '.sneakoscope', 'missions');
  const missionIds = (await fs.readdir(missionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const matches = [];
  for (const missionId of missionIds) {
    const gatePath = path.join(missionsDir, missionId, 'wiki-gate.json');
    try {
      const gate = JSON.parse(await fs.readFile(gatePath, 'utf8'));
      matches.push({ missionId, gate });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].gate.blockers, []);

  const proof = JSON.parse(await fs.readFile(path.join(missionsDir, matches[0].missionId, 'completion-proof.json'), 'utf8'));
  assert.deepEqual(proof.evidence.route_gate.blockers, []);
  assert.ok(!proof.blockers.includes('route_gate_gate_blockers_not_array'));
});
