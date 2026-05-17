import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../../src/core/init.mjs';
import { DOLLAR_SKILL_NAMES } from '../../src/core/routes.mjs';

test('generated Codex App skills cover every dollar route skill name', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-dollar-skills-'));
  const result = await installSkills(root);
  const installed = new Set(result.installed_skills);

  for (const name of DOLLAR_SKILL_NAMES) {
    assert.ok(installed.has(name), `missing generated skill template for ${name}`);
    const skillPath = path.join(root, '.agents', 'skills', name, 'SKILL.md');
    const stat = await fs.stat(skillPath);
    assert.equal(stat.isFile(), true, `missing SKILL.md for ${name}`);
  }
});
