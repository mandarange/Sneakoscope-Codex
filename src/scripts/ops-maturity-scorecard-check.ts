#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
import { buildOpsMaturityScorecard, writeOpsMaturityScorecard } from '../core/ops/ops-maturity-scorecard.js'

const report = await buildOpsMaturityScorecard(root)
const reportPath = await writeOpsMaturityScorecard(root)

assertGate(report.ok === true, 'ops maturity scorecard failed', report)
assertGate(report.total_score >= 94, 'ops maturity scorecard total must be at least 94', report)
assertGate(report.rows.every((row) => row.score >= 85), 'ops maturity scorecard rows must each be at least 85', report.rows)
assertGate(report.rows.filter((row) => row.critical).every((row) => row.score >= 90), 'ops maturity scorecard critical rows must each be at least 90', report.rows)

emitGate('ops:maturity-scorecard', { total_score: report.total_score, report: reportPath.replace(`${root}/`, '') })
