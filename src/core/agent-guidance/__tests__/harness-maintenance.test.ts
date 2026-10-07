import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { maintainHarnessGuidance } from '../harness-maintenance.js';
import { validOfficialGuidance, type OfficialGuidanceSnapshot } from '../official-guidance-client.js';
import { agentsBlockText, codexAppQuickReference } from '../../init.js';
import { coreEngineeringDirectiveText } from '../../lean-engineering-policy.js';
import { globalAgentsBlockText, GLOBAL_AGENTS_MARKER } from '../../codex-hooks/codex-global-hooks.js';

function snapshot(): OfficialGuidanceSnapshot {
  const sources = [
    ['codex-instructions', 'https://learn.chatgpt.com/docs/agent-configuration/agents-md', 'Custom instructions'],
    ['codex-prompting', 'https://learn.chatgpt.com/docs/prompting', 'Prompting'],
    ['latest-model-guidance', 'https://developers.openai.com/api/docs/guides/latest-model', 'Current model guidance']
  ];
  return {
    schema: 'sks.official-guidance.v1', fetched_at: new Date().toISOString(),
    sources: sources.map(([id, url, title]) => {
      const text = id === 'codex-prompting'
        ? '# Prompting\n\n## Describe the result you need\n\nState the outcome clearly.\n\n## Add useful context\n\nInclude context that changes the answer.\n'
        : `# ${title}\n\nFixture reference: state the result, include useful context, preserve necessary boundaries, and keep instructions concise.\n`;
      return { id: id!, url: url!, title: title!, query: title!, discovered_via_search: true, search_result_urls: [url!], text, sha256: createHash('sha256').update(text).digest('hex') };
    })
  };
}

async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-maintenance-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'project');
  const codexHome = path.join(dir, 'codex-home');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(codexHome);
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'User project rule: preserve this.\n\n<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->\nstale SKS rules\n<!-- END Sneakoscope Codex GX MANAGED BLOCK -->\n\nUser footer.\n');
  await fs.writeFile(path.join(codexHome, 'AGENTS.md'), `User global rule.\n<!-- BEGIN ${GLOBAL_AGENTS_MARKER} -->\nstale global SKS rules\n<!-- END ${GLOBAL_AGENTS_MARKER} -->\n`);
  await fs.writeFile(path.join(root, '.codex', 'SNEAKOSCOPE.md'), codexAppQuickReference('project', 'sks'));
  return { root, codexHome };
}

test('maintenance refreshes only managed prompt blocks and records searched official sources', async (t) => {
  const { root, codexHome } = await fixture(t);
  const references = snapshot();
  const result = await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => references });
  assert.equal(result.ok, true, result.blockers.join(','));
  assert.equal(result.guidance_status, 'refreshed');
  assert.equal(result.source_urls.length, 3);
  assert.equal(result.prompt_hints_updated, true);
  const project = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(project, /^User project rule: preserve this\./);
  assert.match(project, /User footer\./);
  assert.ok(project.includes(agentsBlockText().trim()));
  assert.match(project, /> State the outcome clearly\./);
  const global = await fs.readFile(path.join(codexHome, 'AGENTS.md'), 'utf8');
  assert.match(global, /^User global rule\./);
  assert.ok(global.includes(globalAgentsBlockText().trim()));
  const stored = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'guidance', 'official-sources.json'), 'utf8'));
  assert.equal(validOfficialGuidance(stored), true);
  assert.deepEqual(stored, references);
  const again = await maintainHarnessGuidance({ root, codexHome, trigger: 'doctor', retrieve: async () => references });
  assert.equal(again.ok, true);
  assert.deepEqual(again.changed_files, []);
  const newer = snapshot();
  const prompting = newer.sources.find(row => row.id === 'codex-prompting')!;
  prompting.text = prompting.text.replace('State the outcome clearly.', 'Describe the desired outcome plainly.');
  prompting.sha256 = createHash('sha256').update(prompting.text).digest('hex');
  const updated = await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => newer });
  assert.equal(updated.prompt_hints_updated, true);
  const current = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(current, /> Describe the desired outcome plainly\./);
  assert.doesNotMatch(current, /> State the outcome clearly\./);
});

test('a documentation outage preserves the previous references and reports unavailable instead of refreshed', async (t) => {
  const { root, codexHome } = await fixture(t);
  await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => snapshot() });
  const file = path.join(root, '.sneakoscope', 'guidance', 'official-sources.json');
  const before = await fs.readFile(file, 'utf8');
  const result = await maintainHarnessGuidance({ root, codexHome, trigger: 'doctor', retrieve: async () => { throw new Error('offline'); } });
  assert.equal(result.ok, true);
  assert.equal(result.guidance_status, 'unavailable');
  assert.ok(result.warnings.includes('official_guidance_refresh_unavailable:offline'));
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.equal(result.source_urls.length, 3);
  const movedSections = snapshot();
  const page = movedSections.sources.find(row => row.id === 'codex-prompting')!;
  page.text = page.text.replace('## Add useful context', '## A renamed section');
  page.sha256 = createHash('sha256').update(page.text).digest('hex');
  const incomplete = await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => movedSections });
  assert.equal(incomplete.guidance_status, 'unavailable');
  assert.ok(incomplete.warnings.includes('official_prompt_sections_changed_previous_hints_preserved'));
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('update fanout reuses a fresh shared receipt without another network search', async (t) => {
  const { root, codexHome } = await fixture(t);
  await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => snapshot() });
  const other = path.join(root, 'other-project');
  await fs.mkdir(other);
  let searches = 0;
  const result = await maintainHarnessGuidance({ root: other, codexHome, trigger: 'update', reuseRecent: true, retrieve: async () => { searches++; return snapshot(); } });
  assert.equal(result.ok, true);
  assert.equal(result.guidance_status, 'cached');
  assert.equal(searches, 0);
});

test('untrusted URLs, damaged receipts and symlinked managed paths cannot become official guidance', async (t) => {
  const { root, codexHome } = await fixture(t);
  const invalid = snapshot();
  invalid.sources[0]!.url = 'https://example.com/docs/agent-configuration/agents-md';
  assert.equal(validOfficialGuidance(invalid), false);
  const result = await maintainHarnessGuidance({ root, codexHome, trigger: 'align', retrieve: async () => invalid });
  assert.equal(result.guidance_status, 'unavailable');
  assert.ok(result.warnings.some(value => value.includes('snapshot_invalid')));
  const outside = path.join(root, 'keep.txt');
  await fs.writeFile(outside, 'unchanged');
  await fs.symlink(outside, path.join(root, '.sneakoscope', 'guidance', 'current-codex.md'));
  const refused = await maintainHarnessGuidance({ root, codexHome, trigger: 'doctor', retrieve: async () => snapshot() });
  assert.equal(refused.ok, false);
  assert.equal(await fs.readFile(outside, 'utf8'), 'unchanged');
});

test('the thin always-loaded block keeps the engineering principle and puts route details in skills', () => {
  const block = agentsBlockText();
  assert.ok(block.includes(coreEngineeringDirectiveText()));
  assert.ok(Buffer.byteLength(block) < 3400);
  assert.match(block, /TriWiki/);
  assert.match(block, /explicit scoped authorization/);
  assert.match(block, /user runs `sks doctor --fix`/i);
  assert.doesNotMatch(block, /gpt[- ]?\d|Astra|Terra|Sol\b|Luna/);
  assert.ok(Buffer.byteLength(codexAppQuickReference('global', 'sks')) < 2400);
});
