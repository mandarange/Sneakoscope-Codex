import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importComputerUseEvidence } from '../../src/core/wiki-image/computer-use-ledger.mjs';

test('Computer Use mock evidence converts to image voxel anchors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cu-'));
  await fs.mkdir(path.join(root, 'test/fixtures/computer-use'), { recursive: true });
  const source = path.join(process.cwd(), 'test/fixtures/computer-use/fake-computer-use-evidence-ledger.json');
  const dest = path.join(root, 'test/fixtures/computer-use/fake-computer-use-evidence-ledger.json');
  await fs.copyFile(source, dest);
  const result = await importComputerUseEvidence(root, 'test/fixtures/computer-use/fake-computer-use-evidence-ledger.json');
  assert.equal(result.ok, true);
  assert.equal(result.validation.summary.anchors, 1);
});
