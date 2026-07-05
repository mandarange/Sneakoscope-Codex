import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codePackFreshnessNote } from '../hooks-runtime/code-pack-freshness-preflight.js';

async function tempRepo(): Promise<{ root: string; head: string }> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-code-pack-fresh-'));
  const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  await fsp.writeFile(path.join(root, 'a.txt'), 'a\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'init']);
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  return { root, head };
}

async function writePack(root: string, sha: string | null): Promise<void> {
  const dir = path.join(root, '.sneakoscope', 'wiki');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'code-pack.json'), JSON.stringify({ schema: 'sks.code-pack.v1', git_head_sha: sha, entries: [] }));
}

test('codePackFreshnessNote stays silent when there is no code pack at all (never nag opt-out repos)', async () => {
  const { root } = await tempRepo();
  assert.equal(await codePackFreshnessNote(root), null);
});

test('codePackFreshnessNote stays silent when the pack matches the current HEAD', async () => {
  const { root, head } = await tempRepo();
  await writePack(root, head);
  assert.equal(await codePackFreshnessNote(root), null);
});

test('codePackFreshnessNote returns a one-line stale nudge when the pack was built against a different HEAD', async () => {
  const { root } = await tempRepo();
  await writePack(root, '0000000000000000000000000000000000000000');
  const note = await codePackFreshnessNote(root);
  assert.ok(typeof note === 'string', 'expected a stale note string');
  assert.match(note!, /wiki refresh --code/);
  // A one-line note must not contain embedded newlines that would fragment the
  // injected hook context.
  assert.doesNotMatch(note!, /\n/);
});

test('codePackFreshnessNote stays silent when the pack has no recorded git sha (non-git build)', async () => {
  const { root } = await tempRepo();
  await writePack(root, null);
  assert.equal(await codePackFreshnessNote(root), null);
});

test('codePackFreshnessNote never throws even when the root is not a git repo', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-code-pack-nogit-'));
  await writePack(root, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  // Not a git repo -> git rev-parse fails -> no current sha to compare -> silent, not a throw.
  assert.equal(await codePackFreshnessNote(root), null);
  fs.rmSync(root, { recursive: true, force: true });
});
