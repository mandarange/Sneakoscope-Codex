import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSkills } from '../../dist/core/init.js';
import { DOLLAR_SKILL_NAMES } from '../../dist/core/routes.js';

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

test('generated imagegen skills preserve ChatGPT Images 2.0 evidence policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-imagegen-skills-'));
  const result = await installSkills(root);
  const installed = new Set(result.installed_skills);

  assert.ok(installed.has('imagegen'));
  assert.ok(installed.has('imagegen-source-scout'));

  const imagegen = await fs.readFile(path.join(root, '.agents', 'skills', 'imagegen', 'SKILL.md'), 'utf8');
  assert.match(imagegen, /ChatGPT Images 2\.0 \/ GPT Image 2\.0 with gpt-image-2/);
  assert.match(imagegen, /Capability detection is not output proof/);
  assert.match(imagegen, /Direct OpenAI API fallback is non-Codex evidence/);
  assert.match(imagegen, /Official OpenAI\/Codex docs are authoritative/);

  const scout = await fs.readFile(path.join(root, '.agents', 'skills', 'imagegen-source-scout', 'SKILL.md'), 'utf8');
  assert.match(scout, /Source order: official OpenAI announcement/);
  assert.match(scout, /X\/social\/community search/);
  assert.match(scout, /prompt-quality heuristics only/);
  assert.match(scout, /Do not generate images itself/);
});

test('generated QA and Computer Use skills use Chrome Extension first for web verification', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-web-verification-skills-'));
  await installSkills(root);

  const qaLoop = await fs.readFile(path.join(root, '.agents', 'skills', 'qa-loop', 'SKILL.md'), 'utf8');
  assert.match(qaLoop, /Codex Chrome Extension-first web UI evidence/);
  assert.match(qaLoop, /rapidly halt/);
  assert.match(qaLoop, /Computer Use is reserved for native Mac\/non-web surfaces/);

  const cu = await fs.readFile(path.join(root, '.agents', 'skills', 'cu', 'SKILL.md'), 'utf8');
  assert.match(cu, /native macOS, desktop-app, OS-settings, and non-web visual tasks/);
  assert.match(cu, /Web\/browser\/webapp verification must use Codex Chrome Extension first/);

  const ux = await fs.readFile(path.join(root, '.agents', 'skills', 'ux-review', 'SKILL.md'), 'utf8');
  assert.match(ux, /web\/browser\/webapp capture must pass the Codex Chrome Extension readiness gate first/);
});

test('generated DB skill uses route-owned safety artifacts and never revives sks db', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-db-route-skill-'));
  await installSkills(root);

  const db = await fs.readFile(path.join(root, '.agents', 'skills', 'db', 'SKILL.md'), 'utf8');
  assert.match(db, /automatically materializes db-safety-scan\.json and db-review\.json/);
  assert.match(db, /legacy sks db command is removed and must remain unknown/);
  assert.doesNotMatch(db, /sks db (?:policy|scan|classify|check)/);
  assert.match(db, /sks mad-sks plan\|sql\|apply-migration/);
});

test('generated Naruto skill keeps official threads lightweight and TriWiki-bounded', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-naruto-official-skill-'));
  await installSkills(root);

  const naruto = await fs.readFile(path.join(root, '.agents', 'skills', 'naruto', 'SKILL.md'), 'utf8');
  assert.match(naruto, /Automatic fan-out is two for non-trivial work .* at most three for critical multi-domain risk/i);
  assert.match(naruto, /historical Naruto process runtime is removed/i);
  assert.match(naruto, /custom scheduler, or worker pool/i);
  assert.match(naruto, /four ordinary or six complex query-aware TriWiki trust\/hydration anchors/);
  assert.match(naruto, /do not inject the full pack/);
});

test('generated Research skills use three official research reviewers without the legacy five-agent scheduler', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-research-official-skills-'));
  await installSkills(root);

  for (const name of ['research', 'research-discovery']) {
    const content = await fs.readFile(path.join(root, '.agents', 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(content, /three independent official .*research_reviewer/i);
    assert.match(content, /GPT-5\.6 Sol Max/i);
    assert.doesNotMatch(content, /Feynman Agent|Turing Agent|five-agent|effort=xhigh|repeat agent\/debate/i);
  }
});
