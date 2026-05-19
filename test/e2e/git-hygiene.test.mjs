import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import { runProcess } from '../../src/core/fsx.mjs';

test('sks git install and doctor keep shared memory trackable', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'git-hygiene', setup: false });
  await runProcess('git', ['init'], { cwd: root });
  await fs.writeFile(path.join(root, '.gitignore'), '.sneakoscope/\n');
  const install = await runSksInRoot(root, ['git', 'install', '--json']);
  assert.equal(install.ok, true);
  const ignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  assert.equal(ignore.split(/\r?\n/).some((line) => line.trim() === '.sneakoscope/'), false);
  const sharedIgnored = await runProcess('git', ['check-ignore', '-q', '.sneakoscope/wiki/records/claims/example.json'], { cwd: root });
  assert.notEqual(sharedIgnored.code, 0);
  const indexIgnored = await runProcess('git', ['check-ignore', '-q', '.sneakoscope/wiki/indexes/project-index.json'], { cwd: root });
  assert.equal(indexIgnored.code, 0);
  const doctor = await runSksInRoot(root, ['git', 'doctor', '--json']);
  assert.equal(doctor.ok, true);
});

