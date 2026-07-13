import test from 'node:test'
import assert from 'node:assert/strict'
import { RESEARCH_SOURCE_LAYER_IDS, RESEARCH_SOURCE_LAYERS } from '../research-source-layer-catalog.js'
import { REQUIRED_SOURCE_SHARD_IDS } from '../research-work-graph.js'

test('research plan and work graph share one eight-layer source catalog', () => {
  assert.equal(RESEARCH_SOURCE_LAYERS.length, 8)
  assert.deepEqual(RESEARCH_SOURCE_LAYER_IDS, RESEARCH_SOURCE_LAYERS.map((layer) => layer.id))
  assert.ok(RESEARCH_SOURCE_LAYER_IDS.includes('local_project_evidence'))
  assert.deepEqual(
    REQUIRED_SOURCE_SHARD_IDS,
    RESEARCH_SOURCE_LAYER_IDS.map((id) => `source_shard_${id}`)
  )
})
