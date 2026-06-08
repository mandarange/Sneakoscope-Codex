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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-synthesis-blackbox-'))
const plan = await research.writeResearchPlan(dir, 'synthesis writer blackbox', { missionId: 'M-SYNTHESIS-BLACKBOX' })
const graph = workGraph.buildResearchWorkGraph(plan)
const result = await cycleRunner.runResearchCycle({ root: process.cwd(), dir, plan, graph, cycle: 1, backend: 'mock', timeoutMs: 120000, maxParallelStages: 6, mock: true })
const synthesis = JSON.parse(fs.readFileSync(path.join(dir, 'research-synthesis-output.json'), 'utf8'))
const reportText = fs.readFileSync(path.join(dir, 'research-report.md'), 'utf8')
const reportQuality = quality.analyzeResearchReportQuality(reportText)

assertGate(result.status === 'passed', 'mock research cycle must pass synthesis blackbox', result)
assertGate(synthesis.schema === 'sks.research-synthesis-output.v1', 'synthesis output artifact must use v1 schema', synthesis)
assertGate(synthesis.quality_signals.report_word_count >= 2200, 'synthesis output must meet report word floor', synthesis.quality_signals)
assertGate(synthesis.quality_signals.unique_source_ids_cited >= 8, 'synthesis output must cite at least 8 unique source ids', synthesis.quality_signals)
assertGate(reportQuality.ok === true, 'blackbox report must pass report quality', reportQuality)

emitGate('research:synthesis-writer-blackbox', { dir, synthesis: synthesis.quality_signals, parallelism: result.parallelism })
