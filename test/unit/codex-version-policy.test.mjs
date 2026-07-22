import test from 'node:test';
import assert from 'node:assert/strict';
import {
  codexVersionPolicy,
  compareSemverLike,
  parseCodexVersionText,
  CODEX_PREFERRED_VERSION,
  CODEX_MINIMUM_SUPPORTED_VERSION
} from '../../dist/core/codex-compat/codex-version-policy.js';

test('Codex version policy prefers latest without hard-locking older hosts', () => {
  assert.equal(parseCodexVersionText('codex-cli 0.145.0'), '0.145.0');
  assert.equal(compareSemverLike('0.145.0', '0.144.5'), 1);
  assert.equal(CODEX_PREFERRED_VERSION, '0.145.0');
  assert.equal(CODEX_MINIMUM_SUPPORTED_VERSION, '0.133.0');
  assert.equal(codexVersionPolicy({ available: true, version: '0.145.0', source: 'fixture' }).status, 'ok');
  const belowPreferred = codexVersionPolicy({ available: true, version: '0.144.0', source: 'fixture' });
  assert.equal(belowPreferred.ok, true);
  assert.equal(belowPreferred.status, 'below_preferred_baseline');
  assert.equal(belowPreferred.update_available_hint, true);
  assert.ok(belowPreferred.warnings.some((warning) => /Update Codex CLI|prefer latest/i.test(warning)));
  const belowMinimum = codexVersionPolicy({ available: true, version: '0.120.0', source: 'fixture' });
  assert.equal(belowMinimum.ok, false);
  assert.equal(belowMinimum.status, 'blocked_below_minimum_supported');
  const explicit = codexVersionPolicy(
    { available: true, version: '0.144.0', source: 'fixture' },
    { requiredBaseline: 'rust-v0.145.0', explicitRequire: true }
  );
  assert.equal(explicit.ok, false);
  assert.equal(explicit.status, 'blocked_below_required_baseline');
});

test('Codex version policy treats missing binary as integration optional', () => {
  const report = codexVersionPolicy({ available: false, version: null, source: null });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'integration_optional');
  assert.equal(report.update_available_hint, true);
});
