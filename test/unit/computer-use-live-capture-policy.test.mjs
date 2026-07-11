import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComputerUseLiveEvidence } from '../../dist/core/computer-use-live-evidence.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=', 'base64');

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

test('caller-supplied fixture bytes cannot become real Computer Use evidence', async () => {
  let invoked = false;
  const evidence = await buildComputerUseLiveEvidence({
    statusReport: { status: 'available', platform: 'darwin', app: { app: { installed: true } } },
    realOptIn: true,
    captureScreenshot: true,
    screenshotAdapter: {
      provenance: {
        source: 'mock_fixture',
        execution_class: 'mock_fixture'
      },
      async captureScreenshot() {
        invoked = true;
        return { ok: true, data: PNG, localOnly: true };
      }
    }
  });
  assert.equal(invoked, false, 'untrusted adapters must be rejected before their bytes are materialized');
  assert.equal(evidence.mode, 'live_capture_blocked');
  assert.equal(evidence.capture.screenshot.status, 'blocked');
  assert.equal(evidence.capture.screenshot.path, null);
  assert.equal(evidence.capture.screenshot.sha256, null);
  assert.equal(evidence.capture.screenshot.adapter_provenance.source, 'mock_fixture');
  assert.equal(evidence.capture.screenshot.adapter_provenance.execution_class, 'mock_fixture');
  assert.equal(evidence.capture.screenshot.adapter_provenance.verified, false);
  assert.ok(evidence.blockers.includes('computer_use_screenshot_adapter_untrusted'));
});

test('caller cannot forge official Computer Use provenance with object fields', async () => {
  const evidence = await buildComputerUseLiveEvidence({
    statusReport: { status: 'available', platform: 'darwin', app: { app: { installed: true } } },
    realOptIn: true,
    captureScreenshot: true,
    screenshotAdapter: {
      provenance: {
        source: 'codex_app_computer_use_host',
        execution_class: 'real',
        factory: 'createOfficialCodexComputerUseScreenshotAdapter'
      },
      async captureScreenshot() {
        return { ok: true, data: PNG, localOnly: true };
      }
    }
  });
  assert.equal(evidence.mode, 'live_capture_blocked');
  assert.equal(evidence.capture.screenshot.adapter_provenance.source, 'untrusted');
  assert.equal(evidence.capture.screenshot.adapter_provenance.verified, false);
  assert.ok(evidence.blockers.includes('computer_use_screenshot_adapter_untrusted'));
});
