import test from 'node:test';
import assert from 'node:assert/strict';
import { codexVersionPolicy, compareSemverLike, parseCodexVersionText } from '../../dist/core/codex-compat/codex-version-policy.js';

test('Codex version policy accepts rust-v0.133.0 or newer', () => {
  assert.equal(parseCodexVersionText('codex-cli 0.133.0'), '0.133.0');
  assert.equal(compareSemverLike('0.134.0', '0.133.0'), 1);
  assert.equal(codexVersionPolicy({ available: true, version: '0.133.0', source: 'fixture' }).status, 'ok');
  assert.equal(codexVersionPolicy({ available: true, version: '0.132.0', source: 'fixture' }).status, 'compatibility_degraded');
});

test('Codex version policy treats missing binary as integration optional', () => {
  const report = codexVersionPolicy({ available: false, version: null, source: null });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'integration_optional');
});
