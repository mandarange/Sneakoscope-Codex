import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomic } from '../../fsx.js'
import { recordSubagentEvent } from '../subagent-evidence.js'
import { createSubagentWaveLifecycle, refreshSubagentWaveLifecycle } from '../wave-lifecycle.js'
import { buildWaveParentGuidance, renderWaveParentGuidance } from '../wave-parent-guidance.js'

test('wave parent guidance requires close+spawn after a settled incomplete wave', () => {
  const guidance = buildWaveParentGuidance({
    remaining_to_start: 2,
    open_threads: 0,
    recovered_capacity: 2,
    post_wave_rescan_required: true,
    current_wave: 1,
    completed_waves: 1
  })
  assert.equal(guidance.required, true)
  assert.ok(guidance.actions.includes('refresh_wave_lifecycle_and_ready_dag'))
  assert.ok(guidance.actions.some((action) => action.startsWith('spawn_next_direct_child_wave_upto:')))
  assert.match(renderWaveParentGuidance(guidance), /spawn_next_direct_child_wave_upto/)
})

test('wave lifecycle persists next_parent_actions for the root parent', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wave-guidance-'))
  t.after(() => fsp.rm(dir, { recursive: true, force: true }))
  const runId = 'run-wave-guidance'
  await writeJsonAtomic(path.join(dir, 'subagent-plan.json'), {
    schema: 'sks.subagent-plan.v1',
    workflow_run_id: runId,
    requested_subagents: 4,
    wave_lifecycle: createSubagentWaveLifecycle({
      workflowRunId: runId,
      targetSubagents: 4,
      countPolicy: 'exact'
    })
  })
  for (const threadId of ['a', 'b']) {
    await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStart')
  }
  for (const threadId of ['a', 'b']) {
    await recordSubagentEvent(dir, {
      agent_id: threadId,
      workflow_run_id: runId,
      last_assistant_message: `${threadId} done`
    }, 'SubagentStop')
  }
  const lifecycle = await refreshSubagentWaveLifecycle(dir)
  assert.equal(lifecycle?.post_wave_rescan_required, true)
  assert.ok(Array.isArray(lifecycle?.next_parent_actions))
  assert.ok(lifecycle?.next_parent_actions?.some((action) => action.startsWith('spawn_next_direct_child_wave_upto:')))
  assert.equal(lifecycle?.parent_guidance?.required, true)
})
