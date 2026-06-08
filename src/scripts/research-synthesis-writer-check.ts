#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const writer = await importDist('core/research/research-synthesis-writer.js')
const quality = await importDist('core/research/research-report-quality.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-synthesis-writer-'))
const plan = await research.writeResearchPlan(dir, 'synthesis writer check', { missionId: 'M-SYNTHESIS-WRITER' })
await research.writeMockResearchResult(dir, plan)
const output = await writer.runResearchCodexSynthesisWriter({ root: process.cwd(), dir, plan, cycle: 1, mock: true })
const sourceLedger = JSON.parse(fs.readFileSync(path.join(dir, 'source-ledger.json'), 'utf8'))
const claimMatrix = JSON.parse(fs.readFileSync(path.join(dir, 'claim-evidence-matrix.json'), 'utf8'))
const contract = JSON.parse(fs.readFileSync(path.join(dir, 'research-quality-contract.json'), 'utf8'))
const validation = writer.validateResearchSynthesisOutput(output, contract, claimMatrix, sourceLedger)
const reportQuality = quality.analyzeResearchReportQuality(output.report_markdown)

assertGate(output.schema === 'sks.research-synthesis-output.v1', 'synthesis output schema mismatch', output)
assertGate(validation.ok === true, 'mock synthesis writer output must validate', validation)
assertGate(fs.existsSync(path.join(dir, 'research-synthesis-output.json')), 'research-synthesis-output.json missing')
assertGate(fs.existsSync(path.join(dir, 'research-report.md')), 'research-report.md missing')
assertGate(fs.existsSync(path.join(dir, research.researchPaperArtifactForPlan(plan))), 'research paper artifact missing')
assertGate(reportQuality.ok === true, 'synthesis report quality must pass', reportQuality)

emitGate('research:synthesis-writer', { dir, quality: reportQuality, validation })
