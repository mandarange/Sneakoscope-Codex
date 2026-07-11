import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runZellij, zellijCommandStdout } from '../../dist/core/zellij/zellij-command.js';
import { parseZellijPaneRows } from '../../dist/core/zellij/zellij-pane-proof.js';

test('Zellij machine parsing retains bounded output beyond the evidence tail', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-large-output-'));
  const previousAdapter = process.env.SKS_ZELLIJ_FAKE_ADAPTER;
  const previousRoot = process.env.SKS_ZELLIJ_FAKE_ROOT;
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;

  try {
    await runZellij(['attach', '--create-background', 'large-output'], { cwd: root });
    for (let index = 0; index < 180; index += 1) {
      await runZellij([
        '--session', 'large-output', 'action', 'new-pane',
        '--name', `fixture-pane-${String(index).padStart(3, '0')}`,
        '--', 'sh', '-lc', `printf fixture-${String(index).padStart(3, '0')}-${'x'.repeat(80)}`
      ], { cwd: root });
    }

    const listed = await runZellij(
      ['--session', 'large-output', 'action', 'list-panes', '--json', '--all'],
      { cwd: root, maxOutputBytes: 1024 * 1024 }
    );
    assert.ok(listed.stdout_bytes > 8192);
    assert.equal(parseZellijPaneRows(listed.stdout_tail).length, 0);
    assert.equal(parseZellijPaneRows(zellijCommandStdout(listed)).length, 180);
    assert.equal(Object.prototype.propertyIsEnumerable.call(listed, 'stdout_for_parsing'), false);
    assert.equal(JSON.parse(JSON.stringify(listed)).stdout_for_parsing, undefined);
    assert.equal(listed.output_truncated, false);
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previousAdapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previousRoot);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
