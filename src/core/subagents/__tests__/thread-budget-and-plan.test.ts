import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_NARUTO_MAX_THREADS,
  DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
  HARD_NARUTO_MAX_THREADS,
  resolveSubagentThreadBudget
} from '../thread-budget.js'
import {
  normalizeOfficialSubagentPolicy,
  officialSubagentPipelineStage,
  routeRequiresOfficialSubagents
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

test('official subagent requirement is task-profile aware and canonical-route bound', () => {
  assert.equal(routeRequiresOfficialSubagents('$Naruto', { task: 'implement feature' }), true)
  assert.equal(routeRequiresOfficialSubagents('$Research', { task: 'How does this mechanism work?' }), false)
  assert.equal(routeRequiresOfficialSubagents('$DFix', { task: 'fix a typo' }), false)
  assert.equal(routeRequiresOfficialSubagents('$Release-Review', { task: 'fix the release metadata' }), true)
  assert.equal(routeRequiresOfficialSubagents('$Release-Review', { task: 'fix release metadata in parallel across independent files' }), true)
  assert.equal(routeRequiresOfficialSubagents(routePrompt('work on the parser'), { task: 'work on the parser' }), true)
  assert.equal(routeRequiresOfficialSubagents(routePrompt('What is a parser?'), { task: 'What is a parser?' }), false)
  assert.equal(routeRequiresOfficialSubagents(routePrompt('$Work'), { task: '$Work' }), true)
  assert.equal(routeRequiresOfficialSubagents(routePrompt('parallel implementation'), { task: 'parallel implementation' }), true)
})

test('official subagent policy exposes requested count, waves, and canonical evidence outputs', () => {
  const policy = normalizeOfficialSubagentPolicy('$Naruto', 'implement feature', {
    requestedSubagents: 20,
    maxThreads: 12
  })
  assert.equal(policy.schema, 'sks.official-subagent-policy.v1')
  assert.equal(policy.requested_subagents, 20)
  assert.equal(policy.max_threads, 12)
  assert.equal(policy.wave_count, 2)
  assert.equal(policy.backend, 'official-codex-subagent')
  assert.ok(policy.outputs.includes('subagent-evidence.json'))

  const stage = officialSubagentPipelineStage(policy)
  assert.equal(stage.workflow, 'official_codex_subagent')
  assert.equal(stage.requested_subagents, 20)
  assert.equal(stage.max_parallel_agent_threads, 12)
  assert.equal(stage.max_depth, 1)
})
