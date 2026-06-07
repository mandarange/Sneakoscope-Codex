#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const shards = await importDist('core/research/research-source-shards.js')
const merge = await importDist('core/research/research-source-ledger-merge.js')
const fsx = await importDist('core/fsx.js')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-source-merge-'))
const plan = await research.writeResearchPlan(dir, 'source ledger merge blackbox', { missionId: 'M-SOURCE-MERGE' })
const shardDir = path.join(dir, 'research', 'cycle-1', 'source-shards')
await fsx.ensureDir(shardDir)
for (const layer of shards.RESEARCH_SOURCE_LAYERS) {
  await fsx.writeJsonAtomic(path.join(shardDir, `${layer.id}.json`), shards.defaultResearchSourceShardOutput(plan, layer, 1))
}
const result = await merge.mergeResearchSourceShards({ dir, cycle: 1, plan })
const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'source-ledger.json'), 'utf8'))

assertGate(result.ok === true, 'source shard merge must pass', result)
assertGate(result.source_count >= 12, 'source merge must preserve enough source rows', result)
assertGate(result.layer_count >= 8, 'source merge must cover source shard layers', result)
assertGate(ledger.citation_coverage?.all_key_claims_cited === true, 'source merge must update citation coverage', ledger.citation_coverage)
assertGate(fs.existsSync(path.join(dir, 'source-quality-report.json')), 'source-quality-report must be updated')

emitGate('research:source-ledger-merge', { dir, source_count: result.source_count, layer_count: result.layer_count })
