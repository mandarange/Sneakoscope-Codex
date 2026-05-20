import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComputerUseLiveEvidence } from '../../dist/core/computer-use-live-evidence.js';
import { computerUseLiveSmoke } from '../../dist/core/computer-use-status.js';

test('Computer Use evidence modes distinguish probe and non-macOS blocker', async () => {
  const probe = await computerUseLiveSmoke({ real: false, statusReport: { status: 'available' } });
  assert.equal(probe.evidence_mode, 'probe_only');
  assert.equal(probe.mock, false);

  const nonMac = await buildComputerUseLiveEvidence({
    statusReport: { status: 'not_macos', platform: 'linux' },
    realOptIn: true,
    captureScreenshot: true
  });
  assert.equal(nonMac.mode, 'probe_only');
  assert.equal(nonMac.status, 'not_macos');
  assert.ok(nonMac.blockers.includes('not_macos'));
});
