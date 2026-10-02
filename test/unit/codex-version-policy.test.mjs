import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCodexFloor,
  codexVersionPolicy,
  compareSemverLike,
  meetsCodexFloor,
  parseCodexVersionText
} from '../../dist/core/codex-compat/codex-version-policy.js';
import { CODEX_MIN_VERSION, CURRENT_CODEX_RUNTIME_CONTRACT } from '../../dist/core/codex-compat/codex-runtime-contract.js';

test('Codex version policy enforces one support floor without rejecting newer runtimes', () => {
  assert.equal(parseCodexVersionText('codex-cli 0.145.0'), '0.145.0');
  assert.equal(compareSemverLike('0.145.0', '0.144.5'), 1);
  assert.equal(CURRENT_CODEX_RUNTIME_CONTRACT.minVersion, CODEX_MIN_VERSION);
  const atFloor = codexVersionPolicy({ available: true, version: CODEX_MIN_VERSION, source: 'fixture' });
  assert.equal(atFloor.status, 'ok');
  assert.equal(atFloor.minimum_supported_version, CODEX_MIN_VERSION);
  assert.equal(codexVersionPolicy({ available: true, version: '999.0.0', source: 'future-fixture' }).status, 'ok');
  const older = codexVersionPolicy({ available: true, version: '0.144.0', source: 'fixture' });
  assert.equal(older.ok, false);
  assert.equal(older.status, 'blocked_below_minimum_supported');
  assert.equal(older.update_available_hint, true);
  assert.ok(older.warnings.some((warning) => /Update Codex CLI|supported minimum/i.test(warning)));
  const belowMinimum = codexVersionPolicy({ available: true, version: '0.120.0', source: 'fixture' });
  assert.equal(belowMinimum.ok, false);
  assert.equal(belowMinimum.status, 'blocked_below_minimum_supported');
});

test('Codex version policy treats missing binary as integration optional', () => {
  const report = codexVersionPolicy({ available: false, version: null, source: null });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'integration_optional');
  assert.equal(report.update_available_hint, true);
});

test('floor helpers agree: meetsCodexFloor and assertCodexFloor use the same threshold', () => {
  assert.equal(meetsCodexFloor(CODEX_MIN_VERSION), true);
  assert.equal(meetsCodexFloor('rust-v999.0.0'), true);
  assert.equal(meetsCodexFloor('0.1.0'), false);
  assert.equal(meetsCodexFloor(null), false);
  assert.equal(assertCodexFloor(CODEX_MIN_VERSION).ok, true);
  assert.equal(assertCodexFloor('0.1.0').ok, false);
});
