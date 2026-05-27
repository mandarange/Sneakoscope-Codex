import test from 'node:test';
import assert from 'node:assert/strict';
import { detectManagedProxyEnv, managedProxyEnvForChild } from '../../dist/core/codex/managed-proxy-env.js';

test('managed proxy env forwards child keys while redacting report values', () => {
  const env = { HTTPS_PROXY: 'http://user:secret@proxy.example:8080', NO_PROXY: 'localhost' };
  const child = managedProxyEnvForChild(env);
  const report = detectManagedProxyEnv(env);
  assert.equal(child.HTTPS_PROXY, env.HTTPS_PROXY);
  assert.equal(report.keys_present.includes('HTTPS_PROXY'), true);
  assert.equal(report.redacted.HTTPS_PROXY.includes('secret'), false);
});
