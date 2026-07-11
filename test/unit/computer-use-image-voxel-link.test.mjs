import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildComputerUseLiveEvidence,
  createOfficialCodexComputerUseScreenshotAdapter
} from '../../dist/core/computer-use-live-evidence.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64');

test('Computer Use screenshot sha256 links to mission Image Voxel ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cu-voxel-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-cu'), { recursive: true });
  const evidence = await buildComputerUseLiveEvidence({
    root,
    missionId: 'M-cu',
    route: '$Image-UX-Review',
    statusReport: { status: 'available', platform: 'darwin', app: { app: { installed: true } } },
    realOptIn: true,
    captureScreenshot: true,
    screenshotAdapter: createOfficialCodexComputerUseScreenshotAdapter(async () => ({
      ok: true,
      data: PNG,
      localOnly: true
    }))
  });
  assert.equal(evidence.mode, 'live_capture_success');
  assert.equal(evidence.capture.screenshot.adapter_provenance.verified, true);
  assert.equal(evidence.image_voxel.linked, true);
  assert.deepEqual(evidence.image_voxel.anchor_ids.length, 1);
  assert.equal(evidence.image_voxel.reason, null);
});
