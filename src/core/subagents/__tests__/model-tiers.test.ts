import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  BUILTIN_LATEST_TIER_MODELS,
  codexListedEfforts,
  effortForTier,
  latestTierModelSet,
  modelTierForModel,
  resolveLatestModelTiers
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
