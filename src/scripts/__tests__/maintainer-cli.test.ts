import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_MANIFEST_BY_NAME } from '../../cli/command-manifest-lite.js';
import { COMMANDS } from '../../cli/command-registry.js';
import { MAINTAINER_COMMANDS, maintainerCommandNames, runMaintainerCli } from '../maintainer-cli.js';

const EXPECTED = [
  'all-features', 'bench', 'check', 'daemon', 'features', 'gates',
  'harness', 'perf', 'release', 'rust', 'task', 'versioning'
];

async function captured<T>(run: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string; exitCode: typeof process.exitCode }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const previousLog = console.log;
  const previousError = console.error;
  const previousExitCode = process.exitCode;
  try {
    console.log = (...args: unknown[]) => stdout.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => stderr.push(args.map(String).join(' '));
    process.exitCode = undefined;
    const result = await run();
    return { result, stdout: stdout.join('\n'), stderr: stderr.join('\n'), exitCode: process.exitCode };
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exitCode = previousExitCode;
  }
}

test('the maintainer CLI owns exactly the development and release commands', () => {
  assert.deepEqual(maintainerCommandNames(), EXPECTED);
  for (const name of EXPECTED) {
    assert.equal(name in COMMANDS, false, `${name} must not also be a shipped sks command`);
    assert.equal(name in COMMAND_MANIFEST_BY_NAME, false, `${name} must not be in the shipped manifest`);
    assert.ok(MAINTAINER_COMMANDS[name as keyof typeof MAINTAINER_COMMANDS].summary.length > 0, name);
  }
});

test('listing and unknown commands follow the CLI conventions', async () => {
  const listed = await captured(() => runMaintainerCli([]));
  assert.equal(listed.exitCode, undefined);
  for (const name of EXPECTED) assert.match(listed.stdout, new RegExp(`\\b${name}\\b`));

  const unknown = await captured(() => runMaintainerCli(['nosuch', '--json']) as Promise<any>);
  assert.equal(unknown.exitCode, 1);
  assert.equal(unknown.result.reason, 'unknown_maintainer_command');
  assert.match(unknown.stderr, /Unknown maintainer command: nosuch/);

  const shipped = await captured(() => runMaintainerCli(['proof']) as Promise<any>);
  assert.equal(shipped.exitCode, 1, 'a shipped command is not a maintainer command');
});

test('--help prints usage and never runs the command', async () => {
  for (const name of EXPECTED) {
    const { result, stdout, exitCode } = await captured(() => runMaintainerCli([name, '--help']) as Promise<any>);
    assert.equal(exitCode, undefined, name);
    assert.equal(result.status, 'help', name);
    assert.match(stdout, /Usage:/, name);
  }
});
