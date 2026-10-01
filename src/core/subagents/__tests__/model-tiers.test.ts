import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  BUILTIN_LATEST_TIER_MODELS,
  catalogIsAuthoritative,
  codexListedEfforts,
  compareModelVersions,
  effortForTier,
  latestTierModelSet,
  modelTierForModel,
  notOlderThanBuiltin,
  parseGptModelId,
  resolveLatestModelTiers,
  tierModelsFingerprint
} from '../model-tiers.js'

async function withCache(models: unknown[] | null, run: (env: NodeJS.ProcessEnv) => void | Promise<void>) {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-model-tiers-'))
  try {
    if (models) await fs.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({ fetched_at: 'x', models }))
    await run({ CODEX_HOME: codexHome, HOME: codexHome })
  } finally {
    await fs.rm(codexHome, { recursive: true, force: true })
  }
}

const levels = (...efforts: string[]) => efforts.map((effort) => ({ effort, description: effort }))

test('each tier resolves to the newest listed family model; hidden and non-GPT rows never count', async () => {
  await withCache([
    { slug: 'gpt-6-astra', visibility: 'list', supported_reasoning_levels: levels('low', 'medium', 'high', 'max') },
    { slug: 'gpt-6-sol', visibility: 'list', supported_reasoning_levels: levels('low', 'medium', 'high', 'max') },
    { slug: 'gpt-6-luna', visibility: 'list', supported_reasoning_levels: levels('low', 'medium', 'max') },
    { slug: 'gpt-5.6-terra', visibility: 'list', supported_reasoning_levels: levels('low', 'medium') },
    { slug: 'gpt-5.6-luna', visibility: 'list' },
    { slug: 'gpt-7-astra', visibility: 'hide' },
    { slug: 'gpt-reserve', visibility: 'list' },
    { slug: 'anthropic/claude-sonnet-4.5', visibility: 'list' }
  ], (env) => {
    const resolved = resolveLatestModelTiers({ env })
    assert.equal(resolved.source, 'models_cache')
    // context prefers terra only at an equal version: gpt-6-sol beats gpt-5.6-terra.
    assert.deepEqual(resolved.models, { fast: 'gpt-6-luna', balanced: 'gpt-6-sol', context: 'gpt-6-sol', deep: 'gpt-6-astra' })
    assert.deepEqual([...latestTierModelSet({ env })].sort(), ['gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol'])
    assert.deepEqual(codexListedEfforts('gpt-5.6-terra', { env }), ['low', 'medium'])
    assert.equal(codexListedEfforts('gpt-9-unknown', { env }), null)
  })
})

test('a newer family moves every tier without a code change, and same-version terra wins context', async () => {
  await withCache([
    { slug: 'gpt-6-astra' },
    { slug: 'gpt-7-luna' },
    { slug: 'gpt-7-sol' },
    { slug: 'gpt-7-terra' },
    { slug: 'gpt-7-astra' }
  ], (env) => {
    assert.deepEqual(resolveLatestModelTiers({ env }).models, { fast: 'gpt-7-luna', balanced: 'gpt-7-sol', context: 'gpt-7-terra', deep: 'gpt-7-astra' })
  })
})

test('a cache without a family falls back to its newest listed model, never a built-in id', async () => {
  await withCache([{ slug: 'gpt-5.6-sol' }, { slug: 'gpt-5.6-luna' }], (env) => {
    const models = resolveLatestModelTiers({ env }).models
    assert.equal(models.fast, 'gpt-5.6-luna')
    assert.equal(models.balanced, 'gpt-5.6-sol')
    assert.equal(models.context, 'gpt-5.6-sol')
    assert.ok(['gpt-5.6-sol', 'gpt-5.6-luna'].includes(models.deep), models.deep)
  })
})

test('no models cache uses the built-in latest family', async () => {
  await withCache(null, (env) => {
    const resolved = resolveLatestModelTiers({ env })
    assert.equal(resolved.source, 'builtin')
    assert.deepEqual(resolved.models, BUILTIN_LATEST_TIER_MODELS)
  })
})

test('a tier effort the model does not list moves to the closest listed effort', async () => {
  await withCache([
    { slug: 'gpt-6-astra', supported_reasoning_levels: levels('low', 'medium', 'high') },
    { slug: 'gpt-6-sol', supported_reasoning_levels: levels('medium', 'high') },
    { slug: 'gpt-6-luna' }
  ], (env) => {
    const resolved = resolveLatestModelTiers({ env })
    assert.equal(effortForTier('deep', resolved), 'high')
    assert.equal(effortForTier('balanced', resolved), 'medium')
    assert.equal(effortForTier('fast', resolved), 'low')
  })
})

test('model families map back to tiers', () => {
  assert.equal(modelTierForModel('gpt-5.6-luna'), 'fast')
  assert.equal(modelTierForModel('gpt-6-sol'), 'balanced')
  assert.equal(modelTierForModel('gpt-5.6-terra'), 'context')
  assert.equal(modelTierForModel('gpt-6-astra'), 'deep')
  assert.equal(modelTierForModel('anthropic/claude-sonnet-4.5'), null)
})

test('a minor bump inside a family wins: gpt-6.1-sol beats gpt-6-sol and gpt-5.6-sol on the balanced and context tiers', async () => {
  await withCache([
    { slug: 'gpt-5.6-sol' },
    { slug: 'gpt-6-sol' },
    { slug: 'gpt-6.1-sol' },
    { slug: 'gpt-6-astra' },
    { slug: 'gpt-6-luna' },
    { slug: 'gpt-5.6-terra' }
  ], (env) => {
    const models = resolveLatestModelTiers({ env }).models
    assert.deepEqual(models, { fast: 'gpt-6-luna', balanced: 'gpt-6.1-sol', context: 'gpt-6.1-sol', deep: 'gpt-6-astra' })
    assert.equal(latestTierModelSet({ env }).has('gpt-6-sol'), false)
    assert.equal(latestTierModelSet({ env }).has('gpt-5.6-sol'), false)
  })
})

test('version parsing and ordering are numeric per segment', () => {
  assert.deepEqual(parseGptModelId('gpt-6.1-sol'), { version: [6, 1], family: 'sol' })
  assert.equal(parseGptModelId('gpt-reserve'), null)
  assert.equal(parseGptModelId('openai/gpt-6-sol'), null)
  assert.ok(compareModelVersions([6, 1], [6]) > 0)
  assert.ok(compareModelVersions([6], [5, 6]) > 0)
  assert.ok(compareModelVersions([6, 10], [6, 9]) > 0)
  assert.equal(compareModelVersions([6], [6, 0]), 0)
})

test('a model not older than the built-in id for its tier cannot be called stale without the cache', () => {
  assert.equal(notOlderThanBuiltin(BUILTIN_LATEST_TIER_MODELS.balanced), true)
  assert.equal(notOlderThanBuiltin('gpt-99-sol'), true)
  assert.equal(notOlderThanBuiltin('gpt-5.6-sol'), false)
  assert.equal(notOlderThanBuiltin('gpt-5.6-luna'), false)
  assert.equal(notOlderThanBuiltin('anthropic/claude-sonnet-4.5'), false)
})

test('the tier fingerprint moves only when a newer model is listed, and is absent without a cache', async () => {
  await withCache([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-astra' }, { slug: 'gpt-6-luna' }], (env) => {
    assert.equal(catalogIsAuthoritative({ env }), true)
    assert.match(String(tierModelsFingerprint({ env })), /^[0-9a-f]{16}$/)
  })
  let before: string | null = null
  await withCache([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-astra' }], (env) => { before = tierModelsFingerprint({ env }) })
  let same: string | null = null
  await withCache([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-astra' }, { slug: 'gpt-5.6-sol' }], (env) => { same = tierModelsFingerprint({ env }) })
  let after: string | null = null
  await withCache([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-astra' }, { slug: 'gpt-6.1-sol' }], (env) => { after = tierModelsFingerprint({ env }) })
  assert.equal(same, before)
  assert.notEqual(after, before)
  await withCache(null, (env) => {
    assert.equal(catalogIsAuthoritative({ env }), false)
    assert.equal(tierModelsFingerprint({ env }), null)
  })
})
