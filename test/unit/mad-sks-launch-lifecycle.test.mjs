import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { settleMadLaunchLifecycle } from '../../dist/core/commands/mad-sks-command.js';

test('MAD launch lifecycle settles root writers before returning', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-lifecycle-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-lifecycle');
  const marker = path.join(missionDir, 'background-complete.json');
  await fs.mkdir(missionDir, { recursive: true });

  const delayedWrite = new Promise((resolve) => setTimeout(resolve, 40))
    .then(() => fs.writeFile(marker, '{"ok":true}\n'));

  await settleMadLaunchLifecycle([delayedWrite], missionDir);
  assert.equal(await fs.readFile(marker, 'utf8'), '{"ok":true}\n');
  const events = await fs.readFile(path.join(missionDir, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"mad_sks\.launch_lifecycle_settled"/);
  assert.match(events, /"fulfilled_count":1/);

  await fs.rm(root, { recursive: true, force: true });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await assert.rejects(fs.access(root));
});
