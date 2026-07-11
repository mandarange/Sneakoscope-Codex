import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { managedSksTmpRoot } from '../fsx.js';

const repoRoot = process.cwd();
const runner = path.join(repoRoot, 'dist', 'scripts', 'canonical-test-runner.js');

test('canonical test runner isolates direct os.tmpdir allocations and removes the run root on close', async () => {
  const fixture = await fixtureRoot('sks-canonical-runner-close-');
  try {
    await writeFixtureTests(fixture, `
      const fs = require('node:fs');
      const path = require('node:path');
      const test = require('node:test');
      test('records canonical temp environment', () => {
        const values = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP, SKS_TMP_DIR: process.env.SKS_TMP_DIR };
        fs.writeFileSync(path.join(process.cwd(), 'observed.json'), JSON.stringify(values));
      });
    `);
    const run = spawnSync(process.execPath, [runner], {
      cwd: fixture,
      env: standaloneTestEnv(),
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const observed = JSON.parse(await fsp.readFile(path.join(fixture, 'observed.json'), 'utf8'));
    assert.equal(observed.TMPDIR, observed.TMP);
    assert.equal(observed.TMPDIR, observed.TEMP);
    assert.equal(observed.TMPDIR, observed.SKS_TMP_DIR);
    assert.ok(String(observed.TMPDIR).startsWith(`${managedSksTmpRoot()}${path.sep}sks-canonical-test-`));
    assert.equal(fs.existsSync(observed.TMPDIR), false);
  } finally {
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('canonical test runner removes the run root after a forwarded termination signal', async () => {
  const fixture = await fixtureRoot('sks-canonical-runner-signal-');
  let child: ReturnType<typeof spawn> | null = null;
  try {
    await writeFixtureTests(fixture, `
      const fs = require('node:fs');
      const path = require('node:path');
      const test = require('node:test');
      test('waits for forwarded termination', async () => {
        fs.writeFileSync(path.join(process.cwd(), 'observed.json'), JSON.stringify({ TMPDIR: process.env.TMPDIR }));
        await new Promise(() => {});
      });
    `);
    child = spawn(process.execPath, [runner], { cwd: fixture, env: standaloneTestEnv(), stdio: 'ignore' });
    await waitForFile(path.join(fixture, 'observed.json'));
    const observed = JSON.parse(await fsp.readFile(path.join(fixture, 'observed.json'), 'utf8'));
    child.kill('SIGTERM');
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('canonical runner did not terminate after SIGTERM')), 5_000);
      child!.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    child = null;
    assert.ok(closed.signal === 'SIGTERM' || closed.code === 143, JSON.stringify(closed));
    assert.equal(fs.existsSync(observed.TMPDIR), false);
  } finally {
    child?.kill('SIGKILL');
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('canonical test runner settles surviving test descendants before removing the run root', { skip: process.platform === 'win32' }, async () => {
  const fixture = await fixtureRoot('sks-canonical-runner-descendant-');
  try {
    await writeFixtureTests(fixture, `
      const fs = require('node:fs');
      const path = require('node:path');
      const { spawn } = require('node:child_process');
      const test = require('node:test');
      test('leaves a same-group descendant for the runner to settle', () => {
        const child = spawn(process.execPath, ['-e', \"const fs=require('node:fs');const path=require('node:path');const root=process.env.TMPDIR;setInterval(()=>{fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'late-writer.txt'),String(Date.now()))},10)\"], { stdio: 'ignore' });
        child.unref();
        fs.writeFileSync(path.join(process.cwd(), 'observed.json'), JSON.stringify({ TMPDIR: process.env.TMPDIR, pid: child.pid }));
      });
    `);
    const run = spawnSync(process.execPath, [runner], {
      cwd: fixture,
      env: standaloneTestEnv(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const observed = JSON.parse(await fsp.readFile(path.join(fixture, 'observed.json'), 'utf8'));
    assert.equal(fs.existsSync(observed.TMPDIR), false);
    assert.equal(pidAlive(observed.pid), false, `descendant ${observed.pid} survived canonical cleanup`);
  } finally {
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

async function fixtureRoot(prefix: string): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  await Promise.all([
    fsp.mkdir(path.join(root, 'dist', 'fixture', '__tests__'), { recursive: true }),
    fsp.mkdir(path.join(root, 'test', 'unit'), { recursive: true })
  ]);
  return root;
}

async function writeFixtureTests(root: string, compiledSource: string): Promise<void> {
  await Promise.all([
    fsp.writeFile(path.join(root, 'dist', 'fixture', '__tests__', 'fixture.test.js'), compiledSource),
    fsp.writeFile(path.join(root, 'test', 'unit', 'fixture.test.mjs'), `
      import test from 'node:test';
      import assert from 'node:assert/strict';
      test('unit surface exists', () => assert.ok(true));
    `)
  ]);
}

async function waitForFile(file: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function standaloneTestEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
