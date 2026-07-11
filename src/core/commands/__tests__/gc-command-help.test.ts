import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gcCommand } from '../gc-command.js';

test('gc --help is help-only and does not run retention', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-gc-help-'));
  const scratch = path.join(root, '.sneakoscope', 'tmp', 'keep.txt');
  const originalCwd = process.cwd();
  const originalLog = console.log;
  const logs: string[] = [];
  try {
    await fs.mkdir(path.dirname(scratch), { recursive: true });
    await fs.writeFile(scratch, 'must remain\n');
    await fs.utimes(scratch, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
    process.chdir(root);
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

    const result = await gcCommand(['--help']);

    assert.equal(result?.schema, 'sks.gc-help.v1');
    assert.ok(logs.some((line) => line.startsWith('Usage: sks gc')));
    assert.equal(await fs.readFile(scratch, 'utf8'), 'must remain\n');
    assert.equal(await fs.access(path.join(root, '.sneakoscope', 'reports')).then(() => true, () => false), false);
    assert.equal(await fs.access(path.join(root, '.sneakoscope', 'missions')).then(() => true, () => false), false);
  } finally {
    console.log = originalLog;
    process.chdir(originalCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});
