import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCodexDoctorConsoleStatus } from '../../dist/commands/doctor.js';

test('doctor console status treats skipped Codex Doctor bridge as unavailable', () => {
  assert.equal(formatCodexDoctorConsoleStatus(null), 'unavailable');
  assert.equal(formatCodexDoctorConsoleStatus(undefined), 'unavailable');
  assert.equal(formatCodexDoctorConsoleStatus({ available: false, disposition: 'warn', exit_code: 1 }), 'unavailable');
});

test('doctor console status formats available Codex Doctor bridge results', () => {
  assert.equal(formatCodexDoctorConsoleStatus({ available: true, disposition: 'block', exit_code: 1 }), 'block');
  assert.equal(formatCodexDoctorConsoleStatus({ available: true, disposition: 'warn', exit_code: 1 }), 'warn');
  assert.equal(formatCodexDoctorConsoleStatus({ available: true, exit_code: 0 }), 'pass');
  assert.equal(formatCodexDoctorConsoleStatus({ available: true, exit_code: 1 }), 'warn');
});
