import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

async function seedLegacyMission(root, id = 'M-old-naruto') {
  const dir = path.join(root, '.sneakoscope', 'missions', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'mission.json'), `${JSON.stringify({ id, mode: 'naruto', created_at: new Date(0).toISOString() })}\n`);
  return dir;
}

test('failed Team redirect never falls back to or mutates an older Naruto mission', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'team-stale-mission' });
  const oldDir = await seedLegacyMission(root);
  const result = await runSksInRoot(root, ['team', '--model', 'gpt-5.6-terra', '--json'], { expectCode: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.mission_id ?? null, null);
  await assert.rejects(fs.access(path.join(oldDir, 'team-alias-to-naruto.json')));
});

test('legacy Team mutation and runtime commands are blocked instead of writing observation state', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'team-readonly' });
  const oldDir = await seedLegacyMission(root, 'M-old-team');
  const result = await runSksInRoot(root, ['team', 'event', 'M-old-team', '--message', 'must-not-write', '--json'], { expectCode: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'removed_non_read_only_surface');
  await assert.rejects(fs.access(path.join(oldDir, 'team-transcript.jsonl')));
});
