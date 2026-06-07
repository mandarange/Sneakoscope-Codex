#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const reviewer = await importDist('core/research/research-final-reviewer.js')
const fsx = await importDist('core/fsx.js')

const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-final-review-bad-'))
await research.writeResearchPlan(badDir, 'bad final reviewer fixture', { missionId: 'M-FINAL-BAD' })
await fsx.writeTextAtomic(path.join(badDir, 'research-report.md'), '# Bad\n\nToo short.\n')
const bad = await reviewer.runResearchFinalReviewer(badDir, { codexRequired: true })
assertGate(bad.approved === false, 'static failure must not approve final review', bad)

const goodDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-final-review-good-'))
const plan = await research.writeResearchPlan(goodDir, 'good final reviewer fixture', { missionId: 'M-FINAL-GOOD' })
await research.writeMockResearchResult(goodDir, plan)
const good = JSON.parse(fs.readFileSync(path.join(goodDir, 'research-final-review.json'), 'utf8'))
assertGate(good.approved === true, 'complete package must approve final review with mock Codex reviewer', good)
assertGate(good.codex_review?.verdict === 'approve', 'merged final review must include Codex/mock approval', good)

emitGate('research:final-reviewer-blackbox', { bad_dir: badDir, good_dir: goodDir })
