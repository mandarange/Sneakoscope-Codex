import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeOpsReport } from '../reporting.js';

test('writeOpsReport rejects paths outside the scoped reports directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ops-report-scope-'));
  try {
    await assert.rejects(
      writeOpsReport(root, '../escaped.json', {
        schema: 'fixture.ops-report.v1',
        ok: true,
        generated_at: new Date().toISOString(),
        blockers: []
      }),
      /invalid ops report file name/
    );
    assert.equal(await fs.access(path.join(root, '.sneakoscope', 'escaped.json')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
