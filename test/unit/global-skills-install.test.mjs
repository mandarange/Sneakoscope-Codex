import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureGlobalCodexSkillsDuringInstall } from '../../dist/cli/install-helpers.js';

test('global Codex App skill install includes commit dollar routes', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-global-skills-'));
  const result = await ensureGlobalCodexSkillsDuringInstall({ home, force: true });

  assert.equal(result.status, 'installed', JSON.stringify(result));
  assert.equal(result.missing_skills.length, 0);
  for (const name of ['sks-commit', 'sks-commit-and-push']) {
    const skillPath = path.join(home, '.agents', 'skills', name, 'SKILL.md');
    const text = await fs.readFile(skillPath, 'utf8');
    assert.match(text, new RegExp(`name: ${name}`));
  }

  const imagegen = await fs.readFile(path.join(home, '.agents', 'skills', 'sks-imagegen', 'SKILL.md'), 'utf8');
  assert.match(imagegen, /follows the image mode in SKS Control Center/);
  assert.match(imagegen, /capability checks are not generated-image evidence/);
  assert.doesNotMatch(imagegen, /gpt-image|sunburst/i);

  const scout = await fs.readFile(path.join(home, '.agents', 'skills', 'sks-imagegen-source-scout', 'SKILL.md'), 'utf8');
  assert.match(scout, /Compare image models for the active SKS image mode/);
  assert.match(scout, /public X\/social\/community reports/);
  assert.match(scout, /prompt-quality and workflow-sentiment hints/);
});
