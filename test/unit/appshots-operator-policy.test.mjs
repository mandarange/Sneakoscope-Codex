import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAppshotsCapability } from '../../dist/core/codex/appshots-detector.js';
import { buildAppshotsOperatorPolicy } from '../../dist/core/codex/appshots-operator-policy.js';

test('Appshots operator policy records privacy safety', () => {
  const capability = detectAppshotsCapability({ prompt: 'visual Appshots proof', operatorActionRecorded: true });
  const policy = buildAppshotsOperatorPolicy(capability, { operatorActionRecorded: true, sourcePaths: ['appshot.png'] });
  assert.equal(policy.ok, true);
  assert.equal(policy.privacy_safety.avoid_secrets_and_credentials, true);
  assert.equal(policy.privacy_safety.no_background_screen_capture, true);
});
