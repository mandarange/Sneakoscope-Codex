import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { coldStartCliEntrypoint } from '../../../commands/perf.js';
import { benchCliEntrypoint } from '../bench-command.js';

test('package CLI executable paths decode spaces instead of passing percent-encoded filesystem paths', () => {
  const packageRoot = path.resolve(path.parse(process.cwd()).root, 'tmp', 'Sneakoscope Package');
  const perfModuleUrl = pathToFileURL(path.join(packageRoot, 'dist', 'commands', 'perf.js'));
  const benchModuleUrl = pathToFileURL(path.join(packageRoot, 'dist', 'core', 'commands', 'bench-command.js'));

  for (const moduleUrl of [perfModuleUrl, benchModuleUrl]) {
    assert.match(moduleUrl.href, /Sneakoscope%20Package/);
  }

  const executablePaths = [
    coldStartCliEntrypoint(perfModuleUrl),
    benchCliEntrypoint(benchModuleUrl),
  ];

  assert.deepEqual(executablePaths, [
    path.join(packageRoot, 'dist', 'bin', 'sks.js'),
    path.join(packageRoot, 'dist', 'bin', 'sks.js'),
  ]);
  for (const executablePath of executablePaths) {
    assert.match(executablePath, /Sneakoscope Package/);
    assert.doesNotMatch(executablePath, /%20/);
  }
});
