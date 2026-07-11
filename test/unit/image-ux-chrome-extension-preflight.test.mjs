import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../../dist/core/fsx.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function activeRouteRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-visual-preflight-active-'));
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), JSON.stringify({
    mission_id: 'M-active', mode: 'NARUTO', route: '$Naruto', phase: 'EXECUTE'
  }));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('Image UX run blocks --from-chrome-extension when Chrome Extension readiness is missing', async (t) => {
  const cwd = await activeRouteRoot(t);
  const result = await runProcess(process.execPath, [path.join(repoRoot, 'dist/bin/sks.js'), 'ux-review', 'run', '--from-chrome-extension', 'latest', '--json'], {
    cwd,
    env: { ...process.env, SKS_TEST_FORCE_CHROME_EXTENSION_MISSING: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.image-ux-review-run.v1');
  assert.equal(json.ok, false);
  assert.equal(json.status, 'blocked');
  assert.equal(json.blocker, 'codex_chrome_extension_setup_required');
  assert.equal(json.chrome_extension.status, 'setup_required');
  assert.ok(json.chrome_extension.blockers.includes('chrome_extension_plugin_missing'));
});

test('Image UX run rejects Computer Use as the default web capture source', async (t) => {
  const cwd = await activeRouteRoot(t);
  const result = await runProcess(process.execPath, [path.join(repoRoot, 'dist/bin/sks.js'), 'ux-review', 'run', '--from-computer-use', '--json'], {
    cwd,
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.image-ux-review-run.v1');
  assert.equal(json.ok, false);
  assert.equal(json.status, 'blocked');
  assert.equal(json.blocker, 'web_ux_review_requires_codex_chrome_extension_not_computer_use');
});
