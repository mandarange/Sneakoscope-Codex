import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

const ROUTE_COMMANDS = [
  ['team', 'fixture', '--mock', '--json'],
  ['ppt', 'fixture', '--mock', '--json'],
  ['image-ux-review', 'fixture', '--mock', '--json'],
  ['computer-use', 'import-fixture', '--mock', '--json'],
  ['db', 'check', '--sql', 'SELECT 1', '--json'],
  ['gx', 'validate', 'fixture', '--mock', '--json']
];

test('route finalization audit uses real route commands, not proof finalize substitute', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'route-finalization-audit' });
  for (const args of ROUTE_COMMANDS) {
    const result = await runSksInRoot(root, args);
    const missionId = result.mission_id || result.proof?.mission_id || result.completion_proof?.mission_id;
    assert.ok(missionId, args.join(' '));
    for (const file of ['completion-proof.json', 'route-completion-contract.json', 'evidence-index.json']) {
      const target = path.join(root, '.sneakoscope/missions', missionId, file);
      assert.ok(await exists(target), `${args.join(' ')} missing ${file}`);
    }
  }
});

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
