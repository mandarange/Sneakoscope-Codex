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

test('an upgrade pointer to a superseded generation is retargeted with its text and retirement date kept', () => {
  const retiring = row('gpt-5.5', {
    upgrade: {
      model: 'gpt-5.6-sol',
      migration_markdown: 'GPT-5.5 retires on October 14, 2026. Switch to GPT-5.6 Sol for the best results.',
      retirement_at: '2026-10-14T00:00:00Z'
    }
  });
  const out = pinCatalogToLatestGenerations([retiring, row('gpt-5.6-sol'), row('gpt-6.1-sol')]);
  const upgrade = out[0]!.upgrade as Record<string, string>;
  assert.equal(upgrade.model, 'gpt-6.1-sol');
  assert.equal(upgrade.retirement_at, '2026-10-14T00:00:00Z');
  assert.equal(upgrade.migration_markdown, 'GPT-5.5 retires on October 14, 2026. Switch to GPT-6.1-Sol for the best results.');
  // the input row is not mutated
  assert.equal((retiring.upgrade as Record<string, string>).model, 'gpt-5.6-sol');
});

test('an upgrade pointer that is already the newest, names an unknown model, or has no family stays as served', () => {
  const newest = row('gpt-5.5', { upgrade: { model: 'gpt-6.1-sol', migration_markdown: 'Switch.' } });
  const unknown = row('gpt-5.4', { upgrade: { model: 'gpt-9-sol', migration_markdown: 'Switch.' } });
  const familyless = row('gpt-5.3-codex-spark', { upgrade: { model: 'gpt-5.5', migration_markdown: 'Switch.' } });
  const out = pinCatalogToLatestGenerations([newest, unknown, familyless, row('gpt-6.1-sol'), row('gpt-5.5')]);
  assert.deepEqual((out[0]!.upgrade as Record<string, string>).model, 'gpt-6.1-sol');
  assert.deepEqual((out[1]!.upgrade as Record<string, string>).model, 'gpt-9-sol');
  assert.deepEqual((out[2]!.upgrade as Record<string, string>).model, 'gpt-5.5');
});

test('equal versions do not hide each other and a display name is replaced only as a whole name', () => {
  assert.deepEqual(visibilityOf(pinCatalogToLatestGenerations([row('gpt-6-sol'), row('gpt-6.0-sol')])), { 'gpt-6-sol': 'list', 'gpt-6.0-sol': 'list' });
  const retiring = row('gpt-5.5', { upgrade: { model: 'gpt-5.6-sol', migration_markdown: 'Switch to GPT-5.6 Sol or GPT-5.6-Solar.' } });
  const out = pinCatalogToLatestGenerations([retiring, row('gpt-5.6-sol'), row('gpt-6.1-sol')]);
  assert.equal((out[0]!.upgrade as Record<string, string>).migration_markdown, 'Switch to GPT-6.1-Sol or GPT-5.6-Solar.');
});
