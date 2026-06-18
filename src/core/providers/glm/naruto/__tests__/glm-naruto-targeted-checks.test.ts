import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runGlmNarutoTargetedChecks } from '../glm-naruto-targeted-checks.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-targeted-checks-'));
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  return root;
}

test('targeted checks parse touched JSON files', async () => {
  const cwd = await tempRepo();
  await fsp.writeFile(path.join(cwd, 'bad.json'), '{ nope\n', 'utf8');
  const result = await runGlmNarutoTargetedChecks({ cwd, touchedPaths: ['bad.json'] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('json_parse:bad.json'));
});

test('targeted checks run node --check for touched JS files', async () => {
  const cwd = await tempRepo();
  await fsp.writeFile(path.join(cwd, 'bad.js'), 'const value = ;\n', 'utf8');
  const result = await runGlmNarutoTargetedChecks({ cwd, touchedPaths: ['bad.js'] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('node_check:bad.js'));
});
