#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraph = await importDist('core/research/research-work-graph.js')
const graph = workGraph.buildResearchWorkGraph({ mission_id: 'M-PARALLEL-SHARDS' })
const shards = graph.work_items.filter((item) => item.stage_kind === 'source_shard')
const shardIds = new Set(shards.map((item) => item.id))
const claim = graph.work_items.find((item) => item.id === 'claim_matrix_build')
const merge = graph.work_items.find((item) => item.id === 'source_ledger_merge')

assertGate(shards.length >= 8, 'work graph must create source layer shards', { count: shards.length })
assertGate(shards.some((item) => item.id === 'source_shard_academic_literature'), 'academic source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_official_government_data'), 'official government source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_standards_primary_docs'), 'standards source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_news_current_events'), 'news source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_public_discourse'), 'public discourse source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_developer_practitioner'), 'developer practitioner source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_counterevidence_factcheck'), 'counterevidence source shard missing')
assertGate(shards.some((item) => item.id === 'source_shard_local_project_evidence'), 'local project evidence source shard missing')
assertGate(merge && merge.dependencies.every((id) => shardIds.has(id)), 'source merge must depend on every source shard', merge)
assertGate(claim && [...shardIds].every((id) => claim.dependencies.includes(id)), 'claim matrix must depend on source shards', claim)

emitGate('research:parallel-source-shards', { shard_count: shards.length })
