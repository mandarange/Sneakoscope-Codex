import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { recordSubagentEvent, readSubagentEvents } from '../subagent-evidence.js'
import {
  createSubagentWaveLifecycle,
  effectiveSubagentTarget,
  subagentCountContractBlockers,
  refreshSubagentWaveLifecycle
} from '../wave-lifecycle.js'

test('root-owned lifecycle reuses settled capacity for a later direct-child wave in the same run', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-lifecycle-'))
  const runId = 'naruto-wave-run'
  try {
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 4,
      requested_subagents_source: 'operator',
      max_threads: 4,
      max_depth: 1,
      wave_lifecycle: createSubagentWaveLifecycle({
        workflowRunId: runId,
        targetSubagents: 4,
        countPolicy: 'exact'
      })
    }))

    let lastEvent = null
    for (const threadId of ['wave-1-a', 'wave-1-b']) {
      lastEvent = await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStart')
    }
    for (const threadId of ['wave-1-a', 'wave-1-b']) {
      lastEvent = await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStop')
    }
    const afterWaveOne = await refreshSubagentWaveLifecycle(dir, {
      evidence: { completed_threads: 2, failed_threads: 0 },
      event: lastEvent
    })

    assert.equal(afterWaveOne?.max_depth, 1)
    assert.equal(afterWaveOne?.max_depth_semantics, 'child_nesting_only_root_may_launch_later_direct_child_waves')
    assert.equal(afterWaveOne?.current_wave, 1)
    assert.equal(afterWaveOne?.completed_waves, 1)
    assert.equal(afterWaveOne?.open_threads, 0)
    assert.equal(afterWaveOne?.recovered_capacity, 2)
    assert.equal(afterWaveOne?.remaining_to_start, 2)
    assert.equal(afterWaveOne?.post_wave_rescan_required, true)

    for (const threadId of ['wave-2-a', 'wave-2-b']) {
      lastEvent = await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStart')
    }
    for (const threadId of ['wave-2-a', 'wave-2-b']) {
      lastEvent = await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStop')
    }
    const final = await refreshSubagentWaveLifecycle(dir, {
      evidence: { completed_threads: 4, failed_threads: 0 },
      event: lastEvent
    })
    const events = await readSubagentEvents(dir)

    assert.equal(final?.workflow_run_id, runId)
    assert.equal(final?.current_wave, 2)
    assert.equal(final?.completed_waves, 2)
    assert.equal(final?.cumulative_started, 4)
    assert.equal(final?.cumulative_completed, 4)
    assert.equal(final?.open_threads, 0)
    assert.equal(final?.remaining_to_start, 0)
    assert.equal(final?.post_wave_rescan_required, false)
    assert.deepEqual(final?.waves.map((wave) => wave.status), ['settled', 'settled'])
    assert.equal(events.length, 8)
    assert.ok(events.every((event) => event.run_id === runId))
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('only dynamic automatic lifecycle targets may be amended between waves', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-count-policy-'))
  try {
    for (const [source, countPolicy, expectedTarget] of [
      ['automatic', 'dynamic_automatic', 4],
      ['operator', 'exact', 2],
      ['route_contract', 'exact', 2]
    ] as const) {
      const dir = path.join(root, source)
      await fs.mkdir(dir, { recursive: true })
      const plan = {
        schema: 'sks.subagent-plan.v1',
        workflow_run_id: `run-${source}`,
        requested_subagents: 4,
        requested_subagents_source: source,
        max_depth: 1,
        wave_lifecycle: createSubagentWaveLifecycle({
          workflowRunId: `run-${source}`,
          targetSubagents: 2,
          countPolicy
        })
      }
      await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify(plan))

      const lifecycle = await refreshSubagentWaveLifecycle(dir)
      const refreshedPlan = { ...plan, wave_lifecycle: lifecycle }
      const target = effectiveSubagentTarget(refreshedPlan)
      assert.equal(lifecycle?.count_policy, countPolicy)
      assert.equal(lifecycle?.target_subagents, expectedTarget)
      assert.equal(lifecycle?.remaining_to_start, expectedTarget)
      assert.equal(lifecycle?.target_change_rejected, source === 'automatic' ? false : true)
      assert.equal(target.targetSubagents, expectedTarget)
      assert.deepEqual(
        subagentCountContractBlockers(refreshedPlan),
        source === 'automatic' ? [] : ['subagent_target_change_rejected']
      )
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('lifecycle ignores unbound and stale-run events', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-run-binding-'))
  const runId = 'current-run'
  try {
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 1,
      requested_subagents_source: 'automatic',
      max_depth: 1,
      wave_lifecycle: createSubagentWaveLifecycle({
        workflowRunId: runId,
        targetSubagents: 1,
        countPolicy: 'dynamic_automatic'
      })
    }))
    await recordSubagentEvent(dir, { agent_id: 'unbound-thread' }, 'SubagentStart')
    await recordSubagentEvent(dir, { agent_id: 'stale-thread', workflow_run_id: 'stale-run' }, 'SubagentStart')
    await recordSubagentEvent(dir, { agent_id: 'current-thread', workflow_run_id: runId }, 'SubagentStart')
    await recordSubagentEvent(dir, { agent_id: 'current-thread', workflow_run_id: runId }, 'SubagentStop')

    const lifecycle = await refreshSubagentWaveLifecycle(dir)

    assert.equal(lifecycle?.cumulative_started, 1)
    assert.equal(lifecycle?.cumulative_settled, 1)
    assert.deepEqual(lifecycle?.waves.flatMap((wave) => wave.thread_ids), ['current-thread'])
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('automatic lifecycle target is capped by policy ceiling, not cumulative max_threads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-automatic-capacity-'))
  try {
    const dir = path.join(root, 'multi-wave')
    const runId = 'run-multi-wave'
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 2,
      requested_subagents_source: 'automatic',
      max_threads: 3,
      fanout_policy: { automatic_ceiling: 10 },
      wave_lifecycle: createSubagentWaveLifecycle({
        workflowRunId: runId,
        targetSubagents: 10,
        countPolicy: 'dynamic_automatic'
      })
    }))
    for (const wave of [
      ['thread-1', 'thread-2', 'thread-3'],
      ['thread-4', 'thread-5', 'thread-6'],
      ['thread-7', 'thread-8', 'thread-9'],
      ['thread-10']
    ]) {
      for (const threadId of wave) {
        await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStart')
      }
      for (const threadId of wave) {
        await recordSubagentEvent(dir, { agent_id: threadId, workflow_run_id: runId }, 'SubagentStop')
      }
    }

    const lifecycle = await refreshSubagentWaveLifecycle(dir)
    const plan = JSON.parse(await fs.readFile(path.join(dir, 'subagent-plan.json'), 'utf8'))
    assert.equal(lifecycle?.target_subagents, 10)
    assert.equal(lifecycle?.cumulative_started, 10)
    assert.equal(lifecycle?.completed_waves, 4)
    assert.ok(lifecycle?.waves.every((wave) => wave.thread_ids.length <= 3))
    assert.equal(effectiveSubagentTarget(plan, 10).targetSubagents, 10)
    assert.deepEqual(subagentCountContractBlockers(plan, 10), [])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('dynamic refresh preserves a predeclared target before starts arrive', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-predeclared-target-'))
  const runId = 'run-predeclared-target'
  try {
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 2,
      requested_subagents_source: 'automatic',
      max_threads: 3,
      fanout_policy: { automatic_ceiling: 10 },
      wave_lifecycle: createSubagentWaveLifecycle({
        workflowRunId: runId,
        targetSubagents: 4,
        countPolicy: 'dynamic_automatic'
      })
    }))

    const lifecycle = await refreshSubagentWaveLifecycle(dir)
    assert.equal(lifecycle?.requested_target_subagents, 2)
    assert.equal(lifecycle?.target_subagents, 4)
    assert.equal(lifecycle?.cumulative_started, 0)
    assert.equal(lifecycle?.remaining_to_start, 4)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('automatic lifecycle rejects declared or observed work above its policy ceiling', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-policy-ceiling-'))
  const runId = 'run-policy-ceiling'
  try {
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 2,
      requested_subagents_source: 'automatic',
      max_threads: 12,
      fanout_policy: { automatic_ceiling: 3 },
      wave_lifecycle: createSubagentWaveLifecycle({
        workflowRunId: runId,
        targetSubagents: 4,
        countPolicy: 'dynamic_automatic'
      })
    }))

    const lifecycle = await refreshSubagentWaveLifecycle(dir)
    const plan = JSON.parse(await fs.readFile(path.join(dir, 'subagent-plan.json'), 'utf8'))
    assert.equal(lifecycle?.target_subagents, 3)
    assert.equal(effectiveSubagentTarget(plan, 4).targetSubagents, 3)
    assert.deepEqual(
      subagentCountContractBlockers({
        ...plan,
        wave_lifecycle: { ...plan.wave_lifecycle, target_subagents: 4 }
      }, 4),
      ['subagent_automatic_fanout_cap_exceeded:4/3']
    )
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('exact lifecycle target tampering cannot change the sealed target', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wave-exact-tamper-'))
  const runId = 'run-exact-tamper'
  try {
    const lifecycle = createSubagentWaveLifecycle({
      workflowRunId: runId,
      targetSubagents: 2,
      countPolicy: 'exact'
    })
    lifecycle.target_subagents = 4
    await fs.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1',
      workflow_run_id: runId,
      requested_subagents: 2,
      requested_subagents_source: 'operator',
      max_threads: 12,
      wave_lifecycle: lifecycle
    }))

    const refreshed = await refreshSubagentWaveLifecycle(dir)
    const plan = JSON.parse(await fs.readFile(path.join(dir, 'subagent-plan.json'), 'utf8'))
    assert.equal(refreshed?.requested_target_subagents, 2)
    assert.equal(refreshed?.target_subagents, 2)
    assert.equal(refreshed?.target_change_rejected, true)
    assert.equal(effectiveSubagentTarget(plan).targetSubagents, 2)
    assert.deepEqual(subagentCountContractBlockers(plan), ['subagent_target_change_rejected'])
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
