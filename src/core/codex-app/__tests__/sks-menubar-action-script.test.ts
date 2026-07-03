import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { actionScriptSource } from '../sks-menubar.js';

test('SKS menu bar action script resolves sks dynamically from the login shell PATH first', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-action-'));
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });
  const home = path.join(temp, 'home');
  const bin = path.join(temp, 'bin');
  await fs.mkdir(bin, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(path.join(bin, 'sks'), '#!/bin/sh\necho "fake-sks:$*"\n', { mode: 0o755 });

  const script = path.join(temp, 'sks-menubar-action.sh');
  await fs.writeFile(script, actionScriptSource({ nodeBin: '/missing/node', sksEntry: '/missing/sks.js' }), { mode: 0o755 });

  const result = await run('/bin/zsh', [script, 'version'], {
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /fake-sks:version/);
});

test('SKS menu bar action script exits 127 when every candidate is unavailable', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-action-missing-'));
  t.after(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });
  const home = path.join(temp, 'home');
  await fs.mkdir(home, { recursive: true });
  const script = path.join(temp, 'sks-menubar-action.sh');
  await fs.writeFile(script, actionScriptSource({ nodeBin: '/missing/node', sksEntry: '/missing/sks.js' }), { mode: 0o755 });

  const result = await run('/bin/zsh', [script, 'version'], {
    HOME: home,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin'
  });
  assert.equal(result.code, 127);
  assert.match(result.stderr, /SKS command not found/);
});

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
