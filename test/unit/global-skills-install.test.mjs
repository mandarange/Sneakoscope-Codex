import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureGlobalCodexSkillsDuringInstall } from '../../src/cli/install-helpers.mjs';

test('global Codex App skill install includes commit dollar routes', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-global-skills-'));
  const result = await ensureGlobalCodexSkillsDuringInstall({ home, force: true });

  assert.equal(result.status, 'installed', JSON.stringify(result));
  assert.equal(result.missing_skills.length, 0);
  for (const name of ['commit', 'commit-and-push']) {
    const skillPath = path.join(home, '.agents', 'skills', name, 'SKILL.md');
    const text = await fs.readFile(skillPath, 'utf8');
    assert.match(text, new RegExp(`name: ${name}`));
  }
});
