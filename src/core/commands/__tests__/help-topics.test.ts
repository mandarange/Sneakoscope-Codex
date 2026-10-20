import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleCommandManifest } from '../../../cli/command-manifest-lite.js';
import { DOLLAR_COMMANDS } from '../../routes.js';
import { helpCommand } from '../basic-cli.js';

async function helpFor(topic: string): Promise<{ result: any; text: string }> {
  const lines: string[] = [];
  const previousLog = console.log;
  const previousExitCode = process.exitCode;
  try {
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
    const result = await helpCommand([topic]);
    return { result, text: lines.join('\n') };
  } finally {
    console.log = previousLog;
    process.exitCode = previousExitCode;
  }
}

test('every listed command is a help topic that prints its usage', async () => {
  for (const entry of visibleCommandManifest()) {
    const { result, text } = await helpFor(entry.name);
    assert.equal(result.ok, true, `sks help ${entry.name}`);
    assert.match(text, /Usage:|usage|sks /i, `sks help ${entry.name} printed no usage`);
  }
});

test('every $ route is a help topic, and a bare retired name is not', async () => {
  for (const route of DOLLAR_COMMANDS) {
    const { result } = await helpFor(route.command);
    assert.equal(result.ok, true, `sks help ${route.command}`);
  }
  const unknown = await helpFor('db');
  assert.equal(unknown.result.status, 'unknown_topic');
  assert.match(unknown.text, /Unknown help topic: db/);
});
