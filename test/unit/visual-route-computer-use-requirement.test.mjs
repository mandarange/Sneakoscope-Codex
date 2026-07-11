import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../dist/core/fsx.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('visual route Computer Use requirement returns status plus evidence skeleton', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-computer-use-require-active-'));
  await fs.mkdir(path.join(cwd, '.sneakoscope', 'state'), { recursive: true });
  await fs.writeFile(path.join(cwd, '.sneakoscope', 'state', 'current.json'), JSON.stringify({
    mission_id: 'M-active', mode: 'NARUTO', route: '$Naruto', phase: 'EXECUTE'
  }));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const result = await runProcess(process.execPath, [path.join(repoRoot, 'dist/bin/sks.js'), 'computer-use', 'require', '--route', '$Image-UX-Review', '--json'], {
    cwd,
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-require.v1');
  assert.equal(json.evidence.schema, 'sks.computer-use-evidence.v1');
  assert.equal(json.status, 'web_verification_uses_chrome_extension');
  assert.equal(json.blocker, 'web_verification_requires_codex_chrome_extension');
  assert.equal(json.evidence.status, 'not_required_for_web_verification');
  assert.equal(json.chrome_extension.schema, 'sks.codex-chrome-extension-status.v1');
});
