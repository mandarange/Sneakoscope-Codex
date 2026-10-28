import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NATIVE_SOURCE_FILES } from '../../dist/core/codex-app/menubar/constants.js';

// 10.7.2 removed SKS Center's Remote Coding page and the external companion it
// recommended. The companion's name is spelled in parts so this file never
// matches its own sweep; historical CHANGELOG entries stay as they shipped.
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const COMPANION = ['pa', 'seo'].join('');
const SELF = 'test/unit/removed-' + COMPANION + '-surface.test.mjs';

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return result.stdout.split('\n').filter(Boolean);
}

test('no tracked path names the companion or the Remote Coding page', () => {
  const tracked = git(['ls-files']);
  assert.deepEqual(tracked.filter((file) => file.toLowerCase().includes(COMPANION) && file !== SELF), []);
  assert.deepEqual(tracked.filter((file) => file.endsWith('RemoteCodingViewController.swift')), []);
});

test('no source, native, doc, test, script, schema or config text mentions the companion', () => {
  const matches = git(['grep', '-l', '-i', '-a', COMPANION, '--', 'src', 'native', 'docs', 'test', 'scripts', 'schemas', 'config']);
  assert.deepEqual(matches, []);
});

test('the Control Center sidebar and its source list have no Remote Coding section', () => {
  const sidebar = fs.readFileSync(path.join(root, 'native/sks-menubar/Sources/SidebarItem.swift'), 'utf8');
  const sections = [...sidebar.matchAll(/^\s+case \w+ = "([^"]+)"$/gm)].map((match) => match[1]);
  assert.ok(sections.includes('Overview'), 'the sidebar cases were read');
  assert.equal(sections.includes('Remote Coding'), false);
  assert.equal(NATIVE_SOURCE_FILES.includes('RemoteCodingViewController.swift'), false);
  const overview = fs.readFileSync(path.join(root, 'native/sks-menubar/Sources/OverviewViewController.swift'), 'utf8');
  assert.doesNotMatch(overview, /Remote Coding|openRemoteCoding/);
});

test('the packed package carries neither', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 20 * 1024 * 1024
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const [pack] = JSON.parse(result.stdout);
  assert.ok(pack && Array.isArray(pack.files), 'npm pack must return a JSON file list');
  const offending = pack.files.map((file) => file.path).filter((file) => /RemoteCoding/.test(file) || file.toLowerCase().includes(COMPANION));
  assert.deepEqual(offending, []);
});
