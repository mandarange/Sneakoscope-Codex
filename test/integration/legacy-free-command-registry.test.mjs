import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { COMMANDS } from '../../src/cli/command-registry.mjs';

test('command registry uses independent lazy command modules only', async () => {
  assert.ok(Object.keys(COMMANDS).length >= 57);
  for (const [name, entry] of Object.entries(COMMANDS)) {
    assert.equal(typeof entry.lazy, 'function', name);
    const mod = await entry.lazy();
    assert.equal(typeof mod.run, 'function', name);
  }
  const registryText = await fs.readFile(new URL('../../src/cli/command-registry.mjs', import.meta.url), 'utf8');
  assert.equal(registryText.includes(['legacy', 'main'].join('-')), false);
  assert.equal(registryText.includes(['maintenance', 'commands'].join('-')), false);
});
