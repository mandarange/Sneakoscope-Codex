import test from 'node:test';
import assert from 'node:assert/strict';
import type { BridgeCatalogModel } from '../../bridge-contracts.js';
import { pinCatalogToLatestGenerations } from '../latest-generation.js';

function row(publicId: string, extra: Record<string, unknown> = {}): BridgeCatalogModel {
  return {
    slug: publicId,
    public_id: publicId,
    provider_id: publicId.includes('/') ? 'openrouter' : 'codex-lb',
    upstream_model: publicId,
    display_name: publicId.replace(/^gpt-/, 'GPT-').replace(/-(\w)/g, (_m, c: string) => `-${c.toUpperCase()}`),
    supported_in_api: true,
    capabilities: [],
    source_catalog_generation: 'g',
    route_key: `x:${publicId}`,
    visibility: 'list',
    ...extra
  } as unknown as BridgeCatalogModel;
}

const visibilityOf = (models: BridgeCatalogModel[]) => Object.fromEntries(models.map((model) => [model.public_id, model.visibility]));

test('superseded generations of a family are hidden, never removed, and each family keeps its newest listed row', () => {
  const out = pinCatalogToLatestGenerations([
    row('gpt-5.6-sol'),
    row('gpt-6-sol'),
    row('gpt-6.1-sol'),
    row('gpt-5.6-luna'),
    row('gpt-6-luna'),
    row('gpt-5.6-terra'),
    row('gpt-5.5'),
    row('gpt-reserve'),
    row('deepseek/deepseek-v4.1-flash')
  ]);
  assert.equal(out.length, 9);
  assert.deepEqual(visibilityOf(out), {
    'gpt-5.6-sol': 'hide',
    'gpt-6-sol': 'hide',
    'gpt-6.1-sol': 'list',
    'gpt-5.6-luna': 'hide',
    'gpt-6-luna': 'list',
    // the only terra row is the newest terra
    'gpt-5.6-terra': 'list',
    // ids without a family and vendor-prefixed ids are left as served
    'gpt-5.5': 'list',
    'gpt-reserve': 'list',
    'deepseek/deepseek-v4.1-flash': 'list'
  });
});

test('a hidden newest row does not hide the older listed generation', () => {
  const out = pinCatalogToLatestGenerations([row('gpt-6-sol'), row('gpt-6.1-sol', { visibility: 'hide' })]);
  assert.deepEqual(visibilityOf(out), { 'gpt-6-sol': 'list', 'gpt-6.1-sol': 'hide' });
});

test('an upgrade pointer is served as the provider sent it, even when it names a hidden generation', () => {
  // OpenAI's catalog says gpt-5.5 → gpt-6-sol. Retargeting it at the newest
  // sol row put "GPT-6.1 Sol" into Codex's migration notice, a model the
  // provider never named, and moved again with every generation.
  const upgrade = {
    model: 'gpt-6-sol',
    migration_markdown: 'GPT-5.5 retires on October 14, 2026. Switch to GPT-6 Sol for the best results.',
    retirement_at: '2026-10-14T00:00:00Z'
  };
  const retiring = row('gpt-5.5', { upgrade });
  const out = pinCatalogToLatestGenerations([retiring, row('gpt-6-sol'), row('gpt-6.1-sol')]);
  assert.deepEqual(out[0]!.upgrade, upgrade);
  assert.equal(JSON.stringify(out.map((model) => model.upgrade ?? null)).includes('6.1'), false);
  assert.equal(out[0]!.visibility, 'list');
});

test('a row this hides loses its upgrade pointer', () => {
  const out = pinCatalogToLatestGenerations([
    row('gpt-6-sol', { upgrade: { model: 'gpt-6.1-sol', migration_markdown: 'Switch.' } }),
    row('gpt-6.1-sol')
  ]);
  assert.equal(out[0]!.visibility, 'hide');
  assert.equal('upgrade' in out[0]!, false);
});

test('equal versions do not hide each other', () => {
  assert.deepEqual(visibilityOf(pinCatalogToLatestGenerations([row('gpt-6-sol'), row('gpt-6.0-sol')])), { 'gpt-6-sol': 'list', 'gpt-6.0-sol': 'list' });
});
