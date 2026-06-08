#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const research = await importDist('core/research.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-research-handoff-'))
const plan = await research.writeResearchPlan(dir, 'handoff consumability blackbox', { missionId: 'M-HANDOFF-CONSUMABILITY' })
await research.writeMockResearchResult(dir, plan)
const handoff = fs.readFileSync(path.join(dir, 'team-handoff-goal.md'), 'utf8')

for (const heading of ['Context', 'Key Claims', 'Evidence Summary', 'Implementation Blueprint', 'Parallel Work Items', 'Acceptance Tests', 'Rollback Plan', 'Source Appendix']) {
  assertGate(handoff.includes(`## ${heading}`), `handoff missing section: ${heading}`, handoff)
}
const workItems = handoff.match(/^\d+\. .+$/gm) || []
assertGate(workItems.length >= 4, 'handoff must include at least 4 parallel work items', { workItems })
for (const item of workItems) {
  assertGate(/Files: (?!explicit blocker: file list missing).+/.test(item) || item.includes('explicit blocker:'), 'work item must include files or explicit blocker', item)
}
assertGate(handoff.includes('$Team') || handoff.includes('$Naruto'), 'handoff must name Team or Naruto route', handoff)
assertGate(!handoff.includes('Sources: explicit blocker: source ids missing'), 'mock handoff must not include unsupported claims without source ids', handoff)

emitGate('research:handoff-consumability', { dir, work_item_count: workItems.length })
