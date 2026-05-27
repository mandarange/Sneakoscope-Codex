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
  for (const name of ['commit', 'commit-and-push']) {
    const skillPath = path.join(home, '.agents', 'skills', name, 'SKILL.md');
    const text = await fs.readFile(skillPath, 'utf8');
    assert.match(text, new RegExp(`name: ${name}`));
  }

  const imagegen = await fs.readFile(path.join(home, '.agents', 'skills', 'imagegen', 'SKILL.md'), 'utf8');
  assert.match(imagegen, /ChatGPT Images 2\.0 \/ GPT Image 2\.0 with gpt-image-2/);
  assert.match(imagegen, /Capability detection is not output proof/);
  assert.match(imagegen, /non-Codex evidence/);

  const scout = await fs.readFile(path.join(home, '.agents', 'skills', 'imagegen-source-scout', 'SKILL.md'), 'utf8');
  assert.match(scout, /official OpenAI announcement/);
  assert.match(scout, /X\/social\/community search/);
  assert.match(scout, /prompt-quality heuristics only/);
});
