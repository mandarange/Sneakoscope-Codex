import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, normalizeCommand } from '../router.js';
import { COMMAND_ALIASES_LITE, COMMAND_MANIFEST_BY_NAME } from '../command-manifest-lite.js';
import { COMMANDS } from '../command-registry.js';

/**
 * A removed command is not a command: no manifest entry, no registry entry, no
 * alias, and the router answers with the ordinary unknown-command contract
 * instead of a tombstone that keeps the name alive.
 */
const RETIRED_COMMANDS = ['loop', 'run', 'rollback'] as const;

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

for (const name of RETIRED_COMMANDS) {
  test(`sks ${name} is an unknown command with no alias and no replacement`, async () => {
    assert.equal(name in COMMAND_MANIFEST_BY_NAME, false);
    assert.equal(name in COMMANDS, false);
    assert.equal(name in COMMAND_ALIASES_LITE, false);
    assert.equal(normalizeCommand([name]).command, null);

    const { result, stdout, stderr, exitCode } = await captured(() => dispatch([name, 'status', '--json']) as Promise<any>);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown_command');
    assert.equal(result.command, name);
    assert.equal(result.replacement, undefined);
    assert.equal(exitCode, 1);
    assert.match(stdout, /"reason": "unknown_command"/);
    assert.match(stderr, new RegExp(`Unknown command: ${name}`));
  });
}
