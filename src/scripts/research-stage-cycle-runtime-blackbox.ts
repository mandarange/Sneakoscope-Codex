#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const workGraph = await importDist('core/research/research-work-graph.js')
const cycleRunner = await importDist('core/research/research-cycle-runner.js')
const quality = await importDist('core/research/research-report-quality.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-stage-cycle-'))
const plan = await research.writeResearchPlan(dir, 'stage cycle runtime blackbox', { missionId: 'M-STAGE-RUNTIME' })
const graph = workGraph.buildResearchWorkGraph(plan)
const result = await cycleRunner.runResearchCycle({ root: process.cwd(), dir, plan, graph, cycle: 1, backend: 'mock', timeoutMs: 120000, maxParallelStages: 4, mock: true })
const shardDir = path.join(dir, 'research', 'cycle-1', 'source-shards')
const shardFiles = fs.readdirSync(shardDir).filter((file) => file.endsWith('.json'))
const sourceLedger = JSON.parse(fs.readFileSync(path.join(dir, 'source-ledger.json'), 'utf8'))
const sourceQuality = JSON.parse(fs.readFileSync(path.join(dir, 'source-quality-report.json'), 'utf8'))
const claimMatrix = JSON.parse(fs.readFileSync(path.join(dir, 'claim-evidence-matrix.json'), 'utf8'))
const blueprint = JSON.parse(fs.readFileSync(path.join(dir, 'implementation-blueprint.json'), 'utf8'))
const finalReview = JSON.parse(fs.readFileSync(path.join(dir, 'research-final-review.json'), 'utf8'))
const reportQuality = quality.analyzeResearchReportQuality(fs.readFileSync(path.join(dir, 'research-report.md'), 'utf8'))
const cycleRecord = JSON.parse(fs.readFileSync(path.join(dir, 'research-cycle-runner.json'), 'utf8'))

assertGate(result.status === 'passed', 'mock stage cycle must pass', result)
assertGate(shardFiles.length >= 8, 'source shard outputs must exist', { shardFiles })
assertGate(fs.existsSync(path.join(dir, 'source-ledger.json')), 'source-ledger merge must exist')
assertGate(sourceLedger.sources.length + sourceLedger.counterevidence_sources.length >= 12, 'source-ledger must include at least 12 sources', sourceLedger)
assertGate(sourceQuality.ok === true, 'source-quality-report must pass', sourceQuality)
assertGate(fs.existsSync(path.join(dir, 'claim-evidence-matrix.json')), 'claim matrix must exist')
assertGate(claimMatrix.key_claim_ids.length >= 8, 'claim matrix must include at least 8 key claims', claimMatrix)
assertGate(fs.existsSync(path.join(dir, 'implementation-blueprint.json')), 'blueprint must exist')
assertGate(blueprint.repository_aware === true, 'blueprint must be repository aware', blueprint)
assertGate(fs.existsSync(path.join(dir, 'research-synthesis-output.json')), 'synthesis output must exist')
assertGate(reportQuality.ok === true, 'research report must pass repetition detector and density checks', reportQuality)
assertGate(fs.existsSync(path.join(dir, 'research-final-review.json')), 'final review must exist')
assertGate(finalReview.approved === true, 'final review must approve complete mock cycle', finalReview)
assertGate(result.parallelism?.max_observed_parallel >= 2, 'source shards must execute with observed parallelism', result.parallelism)
assertGate(cycleRecord.legacy_final_md_loop === false, 'stage cycle must not use legacy final.md loop', cycleRecord)

emitGate('research:stage-cycle-runtime-blackbox', { dir, parallelism: result.parallelism, shard_count: shardFiles.length, report_quality: reportQuality })
