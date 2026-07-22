import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupOtherHarnessConflicts,
  scanHarnessConflicts
} from '../harness-conflicts.js';

test('cleanupOtherHarnessConflicts quarantines OMX/DCodex markers and strips config deps', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-other-harness-'));
  const home = path.join(root, 'home');
  try {
    await fs.mkdir(path.join(root, '.omx'), { recursive: true });
    await fs.mkdir(path.join(root, '.dcodex'), { recursive: true });
    await fs.mkdir(path.join(root, '.codex'), { recursive: true });
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'config.toml'), [
      'model = "keep-me"',
      '',
      '[harness]',
      'name = "omx"',
      'note = "dcodex leftover"',
      ''
    ].join('\n'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: {
        leftpad: '1.0.0',
        '@scope/omx-harness': '1.2.3',
        'dcodex-cli': '0.1.0'
      }
    }, null, 2) + '\n');

    const before = await scanHarnessConflicts(root, { home });
    assert.equal(before.hard_block, true);

    const cleanup = await cleanupOtherHarnessConflicts(root, { home });
    assert.equal(cleanup.ok, true, JSON.stringify(cleanup.errors));
    assert.ok(cleanup.cleaned.length >= 3);

    await assert.rejects(fs.access(path.join(root, '.omx')));
    await assert.rejects(fs.access(path.join(root, '.dcodex')));
    const config = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
    assert.match(config, /keep-me/);
    assert.doesNotMatch(config, /omx|dcodex/i);
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies.leftpad, '1.0.0');
    assert.equal(pkg.dependencies['@scope/omx-harness'], undefined);
    assert.equal(pkg.dependencies['dcodex-cli'], undefined);

    const after = await scanHarnessConflicts(root, { home });
    assert.equal(after.hard_block, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
