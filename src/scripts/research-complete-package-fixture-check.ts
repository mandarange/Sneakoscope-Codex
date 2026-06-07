#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-complete-package-'))
const plan = await research.writeResearchPlan(dir, 'complete package fixture blackbox', { missionId: 'M-COMPLETE-PACKAGE' })
const gate = await research.writeMockResearchResult(dir, plan)
const metrics = gate.metrics || {}

assertGate(gate.passed === true, 'complete mock research package must pass', gate)
assertGate(metrics.report_word_count >= 2200, 'report must satisfy word floor', metrics)
assertGate(metrics.source_entries_total_with_counterevidence >= 12, 'source count must satisfy contract', metrics)
assertGate(metrics.source_layers_covered >= 5, 'source layer coverage must satisfy contract', metrics)
assertGate(metrics.key_claims >= 8, 'key claims must satisfy contract', metrics)
assertGate(metrics.counterevidence_sources >= 2, 'counterevidence count must satisfy contract', metrics)
assertGate(metrics.final_review_approved === true, 'static plus mock Codex final review must approve', metrics)
assertGate(metrics.implementation_blueprint_validation?.ok === true, 'blueprint must validate', metrics)
assertGate(metrics.experiment_plan_validation?.ok === true, 'experiment plan must validate', metrics)
assertGate(metrics.replication_pack_validation?.ok === true, 'replication pack must validate', metrics)

emitGate('research:complete-package-fixture', { dir, metrics })
