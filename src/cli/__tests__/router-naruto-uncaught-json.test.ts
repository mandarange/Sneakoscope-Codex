import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../command-registry.js';
import { dispatch } from '../router.js';

test('every Naruto action keeps one clean stdout JSON object on an uncaught command error', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-uncaught-json-'));
  const oldCwd = process.cwd();
  const oldGate = process.env.SKS_UPDATE_MIGRATION_GATE_DISABLED;
  const oldUpdate = process.env.SKS_DISABLE_UPDATE_CHECK;
  const oldExitCode = process.exitCode;
  const oldLog = console.log;
  const oldError = console.error;
  const oldStderrWrite = process.stderr.write;
  const originalLazy = COMMANDS.naruto.lazy;
  try {
    await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
    await fsp.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), '{"mode":"IDLE","phase":"IDLE"}\n');
    process.chdir(root);
    process.env.SKS_UPDATE_MIGRATION_GATE_DISABLED = '1';
    process.env.SKS_DISABLE_UPDATE_CHECK = '1';
    COMMANDS.naruto.lazy = async () => {
      throw new Error('fixture_uncaught_naruto_error');
    };
    console.error = () => undefined;
    process.stderr.write = (() => true) as typeof process.stderr.write;

    const cases: string[][] = [
      ['run', 'bounded task'],
      ['status', 'latest'],
      ['subagents', 'latest'],
      ['proof', 'latest'],
      ['help']
    ];
    for (const args of cases) {
      const stdout: string[] = [];
      console.log = (...values: unknown[]) => stdout.push(values.map(String).join(' '));
      process.exitCode = undefined;
      const result: any = await dispatch(['naruto', ...args, '--json']);
      assert.equal(stdout.length, 1, args[0]);
      assert.deepEqual(JSON.parse(stdout[0] || ''), result, args[0]);
      assert.equal(result.ok, false, args[0]);
      assert.equal(result.command, 'naruto', args[0]);
      assert.equal(result.error, 'fixture_uncaught_naruto_error', args[0]);
      assert.equal(process.exitCode, 1, args[0]);
    }
  } finally {
    COMMANDS.naruto.lazy = originalLazy;
    process.chdir(oldCwd);
    restoreEnv('SKS_UPDATE_MIGRATION_GATE_DISABLED', oldGate);
    restoreEnv('SKS_DISABLE_UPDATE_CHECK', oldUpdate);
    process.exitCode = oldExitCode;
    console.log = oldLog;
    console.error = oldError;
    process.stderr.write = oldStderrWrite;
    await fsp.rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
