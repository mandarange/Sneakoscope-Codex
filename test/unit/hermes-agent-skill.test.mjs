import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {
  HERMES_SKILL_NAME,
  buildHermesSkillFiles,
  defaultHermesSkillDir,
  installHermesSkill
} from '../../src/core/hermes.mjs';
import { shouldAutoApproveInstall } from '../../src/cli/install-helpers.mjs';

test('Hermes skill files carry slash-command and safety contract', () => {
  const files = buildHermesSkillFiles({ sksCommand: 'sks-test', version: '0.0.0-test' });
  assert.deepEqual(Object.keys(files).sort(), [
    'README.md',
    'SKILL.md',
    'hermes-config.example.yaml',
    'skill-bundle.example.yaml'
  ]);
  assert.match(files['SKILL.md'], /generated_by: sneakoscope/);
  assert.match(files['SKILL.md'], /requires_toolsets: \[terminal\]/);
  assert.match(files['SKILL.md'], new RegExp(`/${HERMES_SKILL_NAME}`));
  assert.match(files['SKILL.md'], /SKS_HERMES=1/);
  assert.match(files['SKILL.md'], /Database, migration, Supabase/);
  assert.match(files['README.md'], /hermes skills list \| grep sneakoscope-codex/);
  assert.doesNotMatch(files['README.md'], /hermes chat --toolsets/);
  assert.match(files['hermes-config.example.yaml'], /skills:\n  external_dirs:/);
  assert.match(files['hermes-config.example.yaml'], /writable external skill directories/);
});

test('Hermes skill path respects HERMES_HOME and HOME', () => {
  assert.equal(
    defaultHermesSkillDir({ HOME: '/tmp/sks-home' }),
    path.join('/tmp/sks-home', '.hermes', 'skills', HERMES_SKILL_NAME)
  );
  assert.equal(
    defaultHermesSkillDir({ HOME: '/tmp/sks-home', HERMES_HOME: '/tmp/sks-hermes' }),
    path.join('/tmp/sks-hermes', 'skills', HERMES_SKILL_NAME)
  );
});

test('Hermes install writes generated skill and blocks unmarked overwrite', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sks-hermes-test-'));
  try {
    const targetDir = path.join(temp, 'skills', HERMES_SKILL_NAME);
    const created = await installHermesSkill({ targetDir, sksCommand: 'sks-test' });
    assert.equal(created.ok, true);
    assert.equal(created.status, 'created');
    assert.deepEqual(created.files.sort(), [
      'README.md',
      'SKILL.md',
      'hermes-config.example.yaml',
      'skill-bundle.example.yaml'
    ]);
    const skill = await readFile(path.join(targetDir, 'SKILL.md'), 'utf8');
    assert.match(skill, /sks-test root --json/);

    const blockedDir = path.join(temp, 'blocked-skill');
    await mkdir(blockedDir, { recursive: true });
    await writeFile(path.join(blockedDir, 'SKILL.md'), 'name: local-user-skill\n');
    const blocked = await installHermesSkill({ targetDir: blockedDir });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 'blocked_existing_skill');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('Hermes runtime auto-approves install prompts without affecting explicit flags', () => {
  assert.equal(shouldAutoApproveInstall([], { SKS_HERMES: '1' }), true);
  assert.equal(shouldAutoApproveInstall([], { HERMES_AGENT: 'true' }), true);
  assert.equal(shouldAutoApproveInstall([], { SKS_OPENCLAW: '1' }), true);
  assert.equal(shouldAutoApproveInstall(['--yes'], {}), true);
  assert.equal(shouldAutoApproveInstall([], {}), false);
});
