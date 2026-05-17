import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('postinstall command auto-bootstrap passes a callable bootstrap command', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-postinstall-'));
  const home = path.join(root, 'home');
  const initCwd = path.join(root, 'project');
  const globalRoot = path.join(root, 'global');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(initCwd, { recursive: true });
  await fs.mkdir(globalRoot, { recursive: true });

  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'postinstall'], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 64 * 1024,
    env: {
      HOME: home,
      INIT_CWD: initCwd,
      SKS_GLOBAL_ROOT: globalRoot,
      SKS_POSTINSTALL_BOOTSTRAP: '1',
      SKS_POSTINSTALL_NO_PROMPT: '1',
      SKS_SKIP_POSTINSTALL_SHIM: '1',
      SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
      SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
      SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
      SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '1',
      SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1',
      SKS_SKIP_CODEX_APP_UPGRADE_REPAIR: '1'
    }
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SKS bootstrap: forced by SKS_POSTINSTALL_BOOTSTRAP=1/);
  assert.match(result.stdout, /Setup complete:/);
  assert.doesNotMatch(result.stderr + result.stdout, /bootstrap is not a function/);
});
