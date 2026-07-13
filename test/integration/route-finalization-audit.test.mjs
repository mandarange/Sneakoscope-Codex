import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

const ROUTE_COMMANDS = [
  { args: ['ppt', 'fixture', '--mock', '--json'], expectCode: 1 },
  { args: ['image-ux-review', 'fixture', '--mock', '--json'], expectCode: 1 },
  { args: ['computer-use', 'import-fixture', '--mock', '--json'], expectCode: 1 },
  { args: ['gx', 'validate', 'fixture', '--mock', '--json'], expectCode: 1 }
];

test('route finalization audit uses real route commands, not proof finalize substitute', async () => {
  for (const row of ROUTE_COMMANDS) {
    const root = await createHermeticProjectRoot({ fixtureName: `route-finalization-${row.args[0]}` });
    const result = await runSksInRoot(root, row.args, { expectCode: row.expectCode });
    const missionId = result.mission_id || result.proof?.mission_id || result.completion_proof?.mission_id;
    assert.ok(missionId, row.args.join(' '));
    for (const file of ['completion-proof.json', 'route-completion-contract.json', 'evidence-index.json']) {
      const target = path.join(root, '.sneakoscope/missions', missionId, file);
      assert.ok(await exists(target), `${row.args.join(' ')} missing ${file}`);
    }
  }
});

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
