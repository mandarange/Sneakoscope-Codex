import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureOpenRouterModelCatalog,
  openRouterCatalogBindDecision,
  openRouterCatalogModelRow,
  writeOpenRouterManagedCatalog
} from '../openrouter-model-catalog.js';
import { readCodexModelCatalogFile, sksOpenRouterCatalogPath } from '../codex-model-catalog.js';

async function makeHarness() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-openrouter-catalog-'));
  const home = path.join(temp, 'home');
  const codexHome = path.join(home, '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  await fs.mkdir(codexHome, { recursive: true });
  const env = { HOME: home } as NodeJS.ProcessEnv;
  return { temp, home, codexHome, configPath, env };
}

test('openRouterCatalogModelRow emits a full ModelInfo row with multi-agent v2 and reasoning levels', () => {
  const row = openRouterCatalogModelRow('z-ai/glm-5.2');
  assert.equal(row.slug, 'z-ai/glm-5.2');
  assert.equal(row.visibility, 'list');
  assert.equal(row.supported_in_api, true);
  assert.equal(row.multi_agent_version, 'v2');
  assert.equal(row.default_reasoning_summary, 'auto');
  assert.ok(String(row.base_instructions).length > 1000, 'base instructions must carry the Codex fallback prompt, not an empty string');
  const efforts = (row.supported_reasoning_levels as Array<{ effort: string }>).map((entry) => entry.effort);
  assert.deepEqual(efforts, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
});

test('writeOpenRouterManagedCatalog merges previously activated models and stays valid', async (t) => {
  const { temp, home, env } = await makeHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));

  const first = await writeOpenRouterManagedCatalog({ model: 'z-ai/glm-5.2', home, env });
  assert.equal(first.ok, true, JSON.stringify(first.blockers));
  assert.equal(first.path, sksOpenRouterCatalogPath({ home, env }));

  const second = await writeOpenRouterManagedCatalog({ model: 'moonshotai/kimi-k3', home, env });
  assert.equal(second.ok, true, JSON.stringify(second.blockers));
  assert.deepEqual([...second.models].sort(), ['moonshotai/kimi-k3', 'z-ai/glm-5.2']);

  const reread = await readCodexModelCatalogFile({ filePath: second.path, configured: true });
  assert.equal(reread.ok, true, JSON.stringify(reread.blockers));
  assert.ok(reread.models.every((entry) => entry.multi_agent_version === 'v2'));

  const mode = (await fs.stat(second.path)).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('openRouterCatalogBindDecision preserves user catalogs and replaces SKS-managed ones', async (t) => {
  const { temp, home, codexHome, env } = await makeHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));

  assert.deepEqual(openRouterCatalogBindDecision('', { home, env }).reason, 'unconfigured');
  const managed = sksOpenRouterCatalogPath({ home, env });
  assert.equal(openRouterCatalogBindDecision(`model_catalog_json = "${managed}"\n`, { home, env }).bound, true);
  const lbManaged = path.join(codexHome, 'sks-codex-lb-tool-catalog.json');
  const lbDecision = openRouterCatalogBindDecision(`model_catalog_json = "${lbManaged}"\n`, { home, env });
  assert.equal(lbDecision.bindable, true);
  assert.equal(lbDecision.reason, 'sks_managed_replaceable');
  const userDecision = openRouterCatalogBindDecision(`model_catalog_json = "${path.join(codexHome, 'my-own.json')}"\n`, { home, env });
  assert.equal(userDecision.bindable, false);
  assert.equal(userDecision.reason, 'user_catalog_preserved');
});

test('ensureOpenRouterModelCatalog repairs a selected-but-uncataloged OpenRouter config', async (t) => {
  const { temp, home, configPath, env } = await makeHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));

  await fs.writeFile(configPath, [
    'model_provider = "openrouter"',
    'model = "z-ai/glm-5.2"',
    ''
  ].join('\n'));
  const repaired: any = await ensureOpenRouterModelCatalog({ configPath, home, env });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.status, 'bound');
  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /model_catalog_json = /);

  const again: any = await ensureOpenRouterModelCatalog({ configPath, home, env });
  assert.equal(again.ok, true);
  assert.equal(again.status, 'current');

  await fs.writeFile(configPath, 'model_provider = "codex-lb"\n');
  const skipped: any = await ensureOpenRouterModelCatalog({ configPath, home, env });
  assert.equal(skipped.status, 'skipped');
});

test('ensureOpenRouterModelCatalog unbinds a dangling OpenRouter catalog after a provider switch', async (t) => {
  const { temp, home, configPath, env } = await makeHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const managed = sksOpenRouterCatalogPath({ home, env });
  await fs.writeFile(configPath, [
    'model_provider = "codex-lb"',
    `model_catalog_json = "${managed}"`,
    ''
  ].join('\n'));
  const repaired: any = await ensureOpenRouterModelCatalog({ configPath, home, env });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.status, 'unbound_dangling');
  const config = await fs.readFile(configPath, 'utf8');
  assert.doesNotMatch(config, /model_catalog_json/);
});

test('writeOpenRouterManagedCatalog drops poisoned carried rows instead of re-persisting them', async (t) => {
  const { temp, home, codexHome, env } = await makeHarness();
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const managed = sksOpenRouterCatalogPath({ home, env });
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(managed, `${JSON.stringify({
    models: [
      { slug: 'broken/model' },
      openRouterCatalogModelRow('kept/model')
    ]
  })}\n`, { mode: 0o600 });
  const result = await writeOpenRouterManagedCatalog({ model: 'z-ai/glm-5.2', home, env });
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.deepEqual([...result.models].sort(), ['kept/model', 'z-ai/glm-5.2']);
  assert.ok(result.warnings.includes('openrouter_model_catalog_previous_row_dropped:broken/model'), JSON.stringify(result.warnings));
});

test('openRouterCatalogModelRow declares a context window so auto-compaction keeps working', () => {
  const row = openRouterCatalogModelRow('z-ai/glm-5.2') as Record<string, unknown>;
  assert.equal(row.context_window, 272_000);
  assert.equal(row.max_context_window, 272_000);
});
