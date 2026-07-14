import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_NARUTO_MAX_THREADS,
  DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
  HARD_NARUTO_MAX_THREADS,
  resolveSubagentThreadBudget
} from '../thread-budget.js'
import {
  agentPipelineStage,
  normalizeAgentPolicy,
  routeRequiresAgentIntake
} from '../../agents/agent-plan.js'
import { routePrompt } from '../../routes.js'

test('official thread budget defaults to two children and twelve available threads', () => {
  assert.equal(DEFAULT_NARUTO_REQUESTED_SUBAGENTS, 2)
  assert.equal(DEFAULT_NARUTO_MAX_THREADS, 12)
  assert.equal(HARD_NARUTO_MAX_THREADS, 32)
  assert.deepEqual(resolveSubagentThreadBudget(), {
    requestedSubagents: 2,
    maxThreads: 12,
    firstWave: 2,
    waveCount: 1,
    maxDepth: 1
  })
})

test('Naruto requested subagents are not capped at five', () => {
  const budget = resolveSubagentThreadBudget({ requested: 12, configuredMaxThreads: 12 })
  assert.equal(budget.requestedSubagents, 12)
  assert.equal(budget.firstWave, 12)
})

test('explicit twenty subagents remain twenty with twelve concurrent threads', () => {
  const budget = resolveSubagentThreadBudget({ requested: 20, configuredMaxThreads: 12 })
  assert.equal(budget.requestedSubagents, 20)
  assert.equal(budget.firstWave, 12)
  assert.equal(budget.waveCount, 2)
  assert.equal(budget.maxDepth, 1)
})

test('thread budget enforces the official hard safety ceiling', () => {
  const budget = resolveSubagentThreadBudget({ requested: 100, configuredMaxThreads: 100 })
  assert.equal(budget.requestedSubagents, 32)
  assert.equal(budget.maxThreads, 32)
})

test('agent intake is task-profile aware and no longer required for every serious-looking route', () => {
  assert.equal(routeRequiresAgentIntake('$Team', { task: 'implement feature' }), true)
  assert.equal(routeRequiresAgentIntake('$Research', { task: 'How does this mechanism work?' }), false)
  assert.equal(routeRequiresAgentIntake('$DFix', { task: 'fix a typo' }), false)
  assert.equal(routeRequiresAgentIntake('$Release-Review', { task: 'fix the release metadata' }), false)
  assert.equal(routeRequiresAgentIntake('$Release-Review', { task: 'fix release metadata in parallel across independent files' }), true)
  assert.equal(routeRequiresAgentIntake(routePrompt('work on the parser'), { task: 'work on the parser' }), false)
  assert.equal(routeRequiresAgentIntake(routePrompt('$Work'), { task: '$Work' }), true)
  assert.equal(routeRequiresAgentIntake(routePrompt('parallel implementation'), { task: 'parallel implementation' }), true)
})

test('official agent policy exposes requested count, waves, and canonical evidence outputs', () => {
  const policy = normalizeAgentPolicy('$Naruto', 'implement feature', {
    requestedSubagents: 20,
    maxThreads: 12
  })
  assert.equal(policy.schema, 'sks.subagent-intake-policy.v1')
  assert.equal(policy.requested_subagents, 20)
  assert.equal(policy.max_threads, 12)
  assert.equal(policy.wave_count, 2)
  assert.equal(policy.backend, 'official-codex-subagent')
  assert.ok(policy.outputs.includes('subagent-evidence.json'))

  const stage = agentPipelineStage(policy)
  assert.equal(stage.workflow, 'official_codex_subagent')
  assert.equal(stage.requested_subagents, 20)
  assert.equal(stage.max_parallel_agent_threads, 12)
  assert.equal(stage.max_depth, 1)
})
