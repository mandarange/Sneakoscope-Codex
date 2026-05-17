import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('hooks replay calls shared runtime policy and matches expected decisions', async () => {
  const fixtures = [
    'pre-tool-db-drop.json',
    'pre-tool-safe-read.json',
    'permission-request-dangerous-db.json',
    'stop-route-without-proof.json',
    'stop-route-with-valid-proof.json',
    'user-prompt-submit-team.json',
    'app-git-action-commit.json'
  ];
  for (const fixture of fixtures) {
    const run = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'hooks', 'replay', path.join('test/fixtures/hooks', fixture), '--json'], {
      cwd: process.cwd(),
      timeoutMs: 10000,
      maxOutputBytes: 128 * 1024
    });
    assert.equal(run.code, 0, `${fixture}: ${run.stderr || run.stdout}`);
    const json = JSON.parse(run.stdout);
    assert.equal(json.matches_expected, true, fixture);
    assert.equal(json.secret_policy, 'redacted');
  }
});
