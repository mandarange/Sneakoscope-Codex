#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const workGraph = await importDist('core/research/research-work-graph.js')
const cycleRunner = await importDist('core/research/research-cycle-runner.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-stage-cycle-'))
const plan = await research.writeResearchPlan(dir, 'stage cycle runtime blackbox', { missionId: 'M-STAGE-RUNTIME' })
const graph = workGraph.buildResearchWorkGraph(plan)
const result = await cycleRunner.runResearchCycle({ root: process.cwd(), dir, plan, graph, cycle: 1, backend: 'mock', timeoutMs: 120000, maxParallelStages: 4, mock: true })
const shardDir = path.join(dir, 'research', 'cycle-1', 'source-shards')
const shardFiles = fs.readdirSync(shardDir).filter((file) => file.endsWith('.json'))

assertGate(result.status === 'passed', 'mock stage cycle must pass', result)
assertGate(shardFiles.length >= 8, 'source shard outputs must exist', { shardFiles })
assertGate(fs.existsSync(path.join(dir, 'source-ledger.json')), 'source-ledger merge must exist')
assertGate(fs.existsSync(path.join(dir, 'claim-evidence-matrix.json')), 'claim matrix must exist')
assertGate(fs.existsSync(path.join(dir, 'implementation-blueprint.json')), 'blueprint must exist')
assertGate(fs.existsSync(path.join(dir, 'research-final-review.json')), 'final review must exist')
assertGate(result.parallelism?.max_observed_parallel >= 2, 'source shards must execute with observed parallelism', result.parallelism)

emitGate('research:stage-cycle-runtime-blackbox', { dir, parallelism: result.parallelism, shard_count: shardFiles.length })
