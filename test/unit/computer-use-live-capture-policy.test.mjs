import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComputerUseLiveEvidence } from '../../dist/core/computer-use-live-evidence.js';

test('Computer Use live capture blocks without official screenshot/action adapters', async () => {
  const evidence = await buildComputerUseLiveEvidence({
    statusReport: { status: 'available', platform: 'darwin', app: { app: { installed: true } } },
    realOptIn: true,
    captureScreenshot: true,
    allowAction: true
  });
  assert.equal(evidence.mode, 'live_capture_blocked');
  assert.equal(evidence.capture.screenshot.attempted, true);
  assert.equal(evidence.capture.screenshot.status, 'blocked');
  assert.equal(evidence.capture.action.status, 'blocked');
  assert.ok(evidence.blockers.includes('codex_app_capability_missing'));
});
