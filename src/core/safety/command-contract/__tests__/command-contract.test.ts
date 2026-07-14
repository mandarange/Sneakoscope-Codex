import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../../../../cli/command-registry.js';
import {
  commandContract,
  commandContracts,
  outputCapFor,
  timeoutFor,
  validateCommandContractRegistry,
  validateJsonSchema
} from '../index.js';

test('command contract registry covers the command registry without regex or compiled-source inference', () => {
  const validation = validateCommandContractRegistry();
  assert.equal(validation.ok, true, validation.issues.join(', '));
  assert.deepEqual(validation.observed_names, Object.keys(COMMANDS).sort());
  assert.equal(commandContracts().size, Object.keys(COMMANDS).length);
});

test('risk and remote policy are explicit and fail closed for R3', () => {
  assert.equal(commandContract('status')?.risk, 'R0');
  assert.equal(commandContract('gates')?.risk, 'R1');
  assert.equal(commandContract('update')?.risk, 'R2');
  assert.equal(commandContract('mad-sks')?.risk, 'R3');
  assert.equal(commandContract('mad-sks')?.remote_allowed, false);
  assert.equal(commandContract('mad-sks')?.telegram_allowed, false);
});

test('per-tool schema rejects unknown or mistyped arguments', () => {
  const contract = commandContract('stop-gate');
  assert.ok(contract);
  const ok = validateJsonSchema({ route: 'Naruto', json: true }, contract.input_schema);
  assert.equal(ok.ok, true);
  const unknown = validateJsonSchema({ route: 'Naruto', shell: 'rm -rf /' }, contract.input_schema);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.issues.some((entry) => entry.code === 'additionalProperties'));
  const mistyped = validateJsonSchema({ json: 'yes' }, contract.input_schema);
  assert.equal(mistyped.ok, false);
  assert.ok(mistyped.issues.some((entry) => entry.code === 'type'));
});

test('validated argv builders apply typed arguments and never accept arbitrary argv', () => {
  const contract = commandContract('stop-gate');
  assert.ok(contract);
  const validation = validateJsonSchema({ route: 'Naruto', mission: 'M-1', json: true }, contract.input_schema);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.deepEqual(contract.argv_builder(validation.value), [
    'stop-gate', 'check', '--route', 'Naruto', '--mission', 'M-1', '--json'
  ]);
});

test('latency classes have bounded timeout and output caps', () => {
  assert.deepEqual(
    ['fast', 'normal', 'long'].map((latency) => [timeoutFor(latency as 'fast' | 'normal' | 'long'), outputCapFor(latency as 'fast' | 'normal' | 'long')]),
    [[15_000, 128 * 1024], [60_000, 512 * 1024], [180_000, 1024 * 1024]]
  );
});
