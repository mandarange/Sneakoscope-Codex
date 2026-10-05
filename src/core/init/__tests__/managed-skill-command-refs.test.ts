import '../../__tests__/helpers/isolated-test-home.js';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { COMMAND_ALIASES_LITE, COMMAND_MANIFEST_BY_NAME } from '../../../cli/command-manifest-lite.js';
import { installGlobalSkills } from '../skills.js';

// Words that follow "sks" in skill prose without naming a command.
const PROSE_AFTER_SKS = new Set(['workers']);

test('every `sks <command>` a managed skill tells an agent to run is a shipped command', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-skill-command-refs-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  const installed = await installGlobalSkills(home);
  assert.equal(installed.ok, true);

  const known = new Set([...Object.keys(COMMAND_MANIFEST_BY_NAME), ...Object.keys(COMMAND_ALIASES_LITE)]);
  const skillsDir = path.join(home, '.agents', 'skills');
  const unknown: string[] = [];
  let references = 0;
  let skills = 0;
  for (const name of await fsp.readdir(skillsDir)) {
    const file = path.join(skillsDir, name, 'SKILL.md');
    const text = await fsp.readFile(file, 'utf8').catch(() => null);
    if (text === null) continue;
    skills += 1;
    for (const match of text.matchAll(/(?<![A-Za-z0-9_./$-])(?:npx\s+)?sks[ ]+([a-z][a-z0-9-]*)/g)) {
      const word = match[1]!;
      if (PROSE_AFTER_SKS.has(word)) continue;
      references += 1;
      if (!known.has(word)) unknown.push(`${name}: sks ${word}`);
    }
  }
  assert.ok(skills > 20, `expected the managed skill set, saw ${skills}`);
  assert.ok(references > 20, `expected skills to reference commands, saw ${references}`);
  assert.deepEqual(unknown, [], 'managed skills point at commands the shipped CLI does not have');
});
