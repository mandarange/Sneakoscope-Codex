import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { reconcileSkills } from '../skills.js';

const SKILL_NAME = 'sks-honest-mode';

async function reconcileGlobalSkills(home: string) {
  return reconcileSkills({
    targetDir: path.join(home, '.agents', 'skills'),
    scope: 'global',
    fix: true,
    globalRuntimeRoot: path.join(home, '.sneakoscope-global')
  });
}

async function findNamedFiles(directory: string, fileName: string): Promise<string[]> {
  const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findNamedFiles(candidate, fileName));
    else if (entry.isFile() && entry.name === fileName) found.push(candidate);
  }
  return found;
}

test('differing managed skill metadata is quarantined before trusted generation is installed', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hostile-skill-metadata-'));
  const metadataPath = path.join(home, '.agents', 'skills', SKILL_NAME, 'agents', 'openai.yaml');
  const hostileMetadata = 'interface:\n  display_name: "Hostile override"\n';
  try {
    const initial = await reconcileGlobalSkills(home);
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const trustedMetadata = await fsp.readFile(metadataPath, 'utf8');
    await fsp.writeFile(metadataPath, hostileMetadata, 'utf8');

    const reconciled = await reconcileGlobalSkills(home);

    assert.equal(reconciled.ok, true, JSON.stringify(reconciled));
    assert.ok(reconciled.quarantined_user_collisions.includes(SKILL_NAME));
    assert.equal(await fsp.readFile(metadataPath, 'utf8'), trustedMetadata);
    const quarantinedMetadata = await findNamedFiles(
      path.join(home, '.sneakoscope', 'quarantine', 'skills', SKILL_NAME),
      'openai.yaml'
    );
    assert.equal(quarantinedMetadata.length, 1);
    assert.equal(await fsp.readFile(quarantinedMetadata[0]!, 'utf8'), hostileMetadata);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('trusted managed skill metadata remains owned without quarantine', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-trusted-skill-metadata-'));
  const metadataPath = path.join(home, '.agents', 'skills', SKILL_NAME, 'agents', 'openai.yaml');
  try {
    const initial = await reconcileGlobalSkills(home);
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const trustedMetadata = await fsp.readFile(metadataPath, 'utf8');

    const reconciled = await reconcileGlobalSkills(home);

    assert.equal(reconciled.ok, true, JSON.stringify(reconciled));
    assert.equal(reconciled.quarantined_user_collisions.includes(SKILL_NAME), false);
    assert.equal(await fsp.readFile(metadataPath, 'utf8'), trustedMetadata);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('missing managed skill metadata is regenerated without quarantining the skill', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-missing-skill-metadata-'));
  const metadataPath = path.join(home, '.agents', 'skills', SKILL_NAME, 'agents', 'openai.yaml');
  try {
    const initial = await reconcileGlobalSkills(home);
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const trustedMetadata = await fsp.readFile(metadataPath, 'utf8');
    await fsp.rm(metadataPath);

    const reconciled = await reconcileGlobalSkills(home);

    assert.equal(reconciled.ok, true, JSON.stringify(reconciled));
    assert.equal(reconciled.quarantined_user_collisions.includes(SKILL_NAME), false);
    assert.equal(await fsp.readFile(metadataPath, 'utf8'), trustedMetadata);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('an installed SKS reclaims skills a newer SKS left behind unless that newer SKS is the one on PATH', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-skill-reclaim-'));
  const manifestPath = path.join(home, '.agents', 'skills', '.sks-generated.json');
  const previousPath = process.env.PATH;
  try {
    assert.equal((await reconcileGlobalSkills(home)).ok, true);
    const current = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    const leftBehind = async () => fsp.writeFile(manifestPath, JSON.stringify({ ...current, version: '99.0.0' }));

    // A rollback, a dev checkout, or a half-finished update: nothing newer is active.
    await leftBehind();
    const reclaimed = await reconcileGlobalSkills(home);
    assert.equal(reclaimed.ok, true, JSON.stringify(reclaimed.warnings));
    assert.ok(reclaimed.warnings.includes('managed_skill_generation_reclaimed_from_99.0.0'));
    assert.equal(JSON.parse(await fsp.readFile(manifestPath, 'utf8')).version, current.version);

    // A newer SKS really is the active one: this runtime is the stale copy.
    const newer = path.join(home, 'newer-sks');
    await fsp.mkdir(path.join(newer, 'bin'), { recursive: true });
    await fsp.writeFile(path.join(newer, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '99.0.0' }));
    await fsp.writeFile(path.join(newer, 'bin', 'sks'), '#!/bin/sh\necho 99.0.0\n', { mode: 0o755 });
    process.env.PATH = `${path.join(newer, 'bin')}${path.delimiter}${previousPath || ''}`;
    await leftBehind();
    const refused = await reconcileGlobalSkills(home);
    assert.equal(refused.ok, false);
    assert.ok(refused.warnings.some((warning) => warning.startsWith('managed_skill_generation_downgrade_refused:99.0.0:') && warning.endsWith(':path_99.0.0')));
  } finally {
    process.env.PATH = previousPath;
    await fsp.rm(home, { recursive: true, force: true });
  }
});
