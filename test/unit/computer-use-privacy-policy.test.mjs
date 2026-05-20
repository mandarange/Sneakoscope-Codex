import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildComputerUseLiveEvidence } from '../../dist/core/computer-use-live-evidence.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64');

test('Computer Use live screenshots are local-only and not shared by default', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cu-privacy-'));
  const evidence = await buildComputerUseLiveEvidence({
    root,
    statusReport: { status: 'available', platform: 'darwin', app: { app: { installed: true } } },
    realOptIn: true,
    captureScreenshot: true,
    screenshotAdapter: {
      async captureScreenshot() {
        return { ok: true, data: PNG, localOnly: true };
      }
    }
  });
  assert.equal(evidence.mode, 'live_capture_success');
  assert.equal(evidence.privacy.shared_triwiki_publish_allowed, false);
  assert.equal(evidence.capture.screenshot.local_only, true);
  assert.match(evidence.capture.screenshot.sha256, /^[a-f0-9]{64}$/);
});
