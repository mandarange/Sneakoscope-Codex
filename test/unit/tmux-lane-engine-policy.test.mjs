import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { watchTmuxScoutOutputs } from '../../src/core/scouts/engines/tmux-lane-watcher.mjs';

test('tmux watcher marks missing output files as blocked timeout jobs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-watcher-'));
  const jobs = [{ scout_id: 'scout-1-code-surface', output_file: path.join(dir, 'missing.md') }];
  const result = await watchTmuxScoutOutputs({ jobs, timeoutMs: 5, pollMs: 1 });
  assert.equal(result.jobs[0].status, 'rejected');
  assert.equal(result.jobs[0].code, 124);
  assert.equal(result.jobs[0].reason, 'tmux_scout_output_timeout');
});
