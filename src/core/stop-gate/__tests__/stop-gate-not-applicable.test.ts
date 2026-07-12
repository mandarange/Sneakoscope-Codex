import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMission } from '../../mission.js'
import { writeRouteCompletionProof } from '../../proof/route-adapter.js'
import { evaluateStop } from '../../pipeline.js'

test('not_applicable satisfies only the active gate and still enforces proof reflection and work-order coverage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-not-applicable-independent-gates-'))
  try {
    const mission: any = await createMission(root, { mode: 'db', prompt: 'review database configuration' })
    const dir = mission.dir
    const state = {
      mission_id: mission.id,
      route: 'DB',
      route_command: '$DB',
      mode: 'DB',
      stop_gate: 'db-review.json',
      proof_required: true,
      reflection_required: true,
      agents_required: false,
      subagents_required: false,
      context7_required: false,
      prompt: 'review database configuration'
    }
    await fs.writeFile(path.join(dir, 'db-review.json'), JSON.stringify({
      status: 'not_applicable',
      reason: 'fixture_has_no_live_database_operation'
    }))

    const proofBlocked: any = await evaluateStop(root, state, { last_assistant_message: 'DB review complete.' })
    assert.equal(proofBlocked.decision, 'block')
    assert.match(proofBlocked.reason, /Completion Proof/i)

    await writeRouteCompletionProof(root, {
      missionId: mission.id,
      route: '$DB',
      status: 'verified',
      executionClass: 'real',
      lightweightEvidence: true,
      summary: { manual_review_required: false }
    })
    const reflectionBlocked: any = await evaluateStop(root, state, { last_assistant_message: 'DB review complete.' })
    assert.equal(reflectionBlocked.decision, 'block')
    assert.match(reflectionBlocked.reason, /reflection/i)

    await fs.writeFile(path.join(dir, 'reflection.md'), '# Reflection\n\nNo issue found.\n')
    await fs.writeFile(path.join(dir, 'reflection-gate.json'), JSON.stringify({
      passed: true,
      created_at: new Date().toISOString(),
      reflection_artifact: true,
      no_issue_acknowledged: true,
      wiki_refreshed_or_packed: true,
      wiki_validated: true
    }))
    await fs.writeFile(path.join(dir, 'work-order-ledger.json'), JSON.stringify({
      schema_version: 1,
      mission_id: mission.id,
      route: 'DB',
      source_inventory_complete: true,
      all_customer_requests_preserved: true,
      all_customer_requests_mapped: true,
      all_work_items_verified: false,
      items: [{
        id: 'REQ-1',
        status: 'pending',
        implementation_tasks: [],
        implementation_evidence: [],
        verification_evidence: []
      }]
    }))
    const coverageBlocked: any = await evaluateStop(root, state, { last_assistant_message: 'DB review complete.' })
    assert.equal(coverageBlocked.decision, 'block')
    assert.match(coverageBlocked.reason, /work-order-ledger/i)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
