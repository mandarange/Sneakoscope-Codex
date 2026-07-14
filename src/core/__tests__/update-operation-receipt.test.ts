import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  UpdateOperationRecorder,
  updateOperationLatestPath,
  type UpdateOperationReceipt
} from '../update/update-operation.js';

test('operation receipt atomically tracks latest stage with 0600 permissions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-operation-'));
  const env = { ...process.env, HOME: root, SKS_GLOBAL_ROOT: path.join(root, 'global') };
  try {
    const recorder = await UpdateOperationRecorder.create({
      env,
      fromVersion: '6.2.0',
      targetVersion: '6.3.0',
      now: new Date('2026-07-14T05:00:00.000Z')
    });
    assert.equal((await fs.stat(recorder.receiptPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(updateOperationLatestPath(env))).mode & 0o777, 0o600);

    recorder.recordStage('preflight', true, 'ok', { home_path: `${root}/project` });
    recorder.recordStage('preflight', true, 'verified', { token: 'supersecret123456789' });
    recorder.recordStage('global_install', true, 'installed', { authorization: 'Bearer hidden-value' });
    await recorder.flush();

    const receipt = await readReceipt(recorder.receiptPath);
    assert.equal(receipt.state, 'running');
    assert.equal(receipt.current_stage, 'global_install');
    assert.equal(receipt.side_effects_started, true);
    assert.equal(receipt.stages.filter((stage) => stage.id === 'preflight').length, 1);
    assert.equal(receipt.stages.find((stage) => stage.id === 'preflight')?.status, 'verified');
    assert.equal(receipt.stages.find((stage) => stage.id === 'preflight')?.detail.token, '[redacted]');
    assert.equal(receipt.stages.find((stage) => stage.id === 'global_install')?.detail.authorization, '[redacted]');
    assert.deepEqual(await readReceipt(updateOperationLatestPath(env)), receipt);

    const finished = await recorder.finish({
      state: 'terminal_uncertain',
      resultStatus: 'terminal_uncertain',
      error: `${root}/npm token=supersecret123456789 timed out`
    });
    assert.equal(finished.state, 'terminal_uncertain');
    assert.equal(finished.previous_version, '6.2.0');
    assert.equal(finished.rollback_command, 'sks update rollback --version 6.2.0 --json');
    assert.match(finished.public_error || '', /^~\/npm/);
    assert.doesNotMatch(finished.public_error || '', /supersecret/);

    const names = await fs.readdir(path.dirname(recorder.receiptPath));
    assert.ok(names.every((name) => name.endsWith('.json')));
    for (const name of names) await readReceipt(path.join(path.dirname(recorder.receiptPath), name));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rollback operations retain owner-visible previous-version metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-rollback-operation-'));
  const env = { ...process.env, HOME: root, SKS_GLOBAL_ROOT: path.join(root, 'global') };
  try {
    const recorder = await UpdateOperationRecorder.create({
      env,
      kind: 'rollback',
      fromVersion: '6.3.0',
      targetVersion: '6.2.0'
    });
    recorder.recordStage('global_install', true, 'installed_previous');
    const receipt = await recorder.finish({ state: 'rolled_back', resultStatus: 'updated' });
    assert.equal(receipt.kind, 'rollback');
    assert.equal(receipt.state, 'rolled_back');
    assert.equal(receipt.previous_version, '6.3.0');
    assert.equal(receipt.target_version, '6.2.0');
    assert.equal(receipt.rollback_command, 'sks update rollback --version 6.3.0 --json');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function readReceipt(file: string): Promise<UpdateOperationReceipt> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as UpdateOperationReceipt;
}
