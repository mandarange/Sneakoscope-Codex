import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { classifyTaskProfile } from '../../runtime/task-profile.js'
import { officialSubagentFanoutPolicy, recommendOfficialSubagentRoles, selectOfficialSubagentRole } from '../agent-catalog.js'
import { prepareOfficialSubagentMission } from '../official-subagent-preparation.js'

test('automatic official subagent fanout stays one unless parallel or independent risk is explicit', () => {
  const bounded = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('implement the parser fix'),
    goal: 'implement the parser fix',
    suggestedRoles: ['implementation_specialist']
  })
  assert.equal(bounded.requested_subagents, 1)
  assert.equal(bounded.selection_reason, 'single_bounded_or_single_domain_task')

  const singleRisk = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('apply the database migration'),
    goal: 'apply the database migration',
    suggestedRoles: ['database_reviewer']
  })
  assert.equal(singleRisk.requested_subagents, 1)

  const parallel = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('fix independent files in parallel'),
    goal: 'fix independent files in parallel',
    suggestedRoles: ['implementation_specialist', 'test_engineer']
  })
  assert.equal(parallel.requested_subagents, 2)
  assert.equal(parallel.selection_reason, 'explicit_parallel_or_independent_slices')
  assert.equal(parallel.automatic_reviewer_ceiling, 2)

  const independentRisk = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('audit database migration security and permissions'),
    goal: 'audit database migration security and permissions',
    suggestedRoles: ['database_reviewer', 'security_reviewer']
  })
  assert.equal(independentRisk.requested_subagents, 2)
  assert.deepEqual(independentRisk.risk_domains.sort(), ['database', 'security'])

  const critical = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('critical production database security release audit'),
    goal: 'critical production database security release audit',
    suggestedRoles: ['database_reviewer', 'security_reviewer', 'release_reviewer']
  })
  assert.equal(critical.requested_subagents, 3)
  assert.equal(critical.automatic_ceiling, 3)
  assert.equal(critical.automatic_reviewer_ceiling, 3)
  assert.equal(critical.critical_multi_domain, true)
})

test('Sol specialists outrank a bounded Luna worker for UI, test, and root-cause language', () => {
  assert.equal(selectOfficialSubagentRole({
    description: 'UI exact bounded change',
    requiresWrite: true
  }), 'ui_implementer')
  assert.equal(selectOfficialSubagentRole({
    description: 'debug exact bounded failure and find the root cause',
    readOnly: true
  }), 'debugger')
  assert.equal(selectOfficialSubagentRole({
    description: 'add one exact bounded regression test fixture',
    requiresWrite: true
  }), 'test_engineer')
})

test('read-only slices select only explicitly read-only custom agents', () => {
  const roles = recommendOfficialSubagentRoles({
    description: 'Apply exact bounded rename',
    readOnly: true,
    requiresWrite: false,
    limit: 3
  })
  assert.deepEqual(roles, ['expert'])
})

test('explicit operator agent count remains authoritative', () => {
  const policy = officialSubagentFanoutPolicy({
    requestedSubagents: 7,
    requestedExplicit: true,
    taskProfile: 'bounded-work',
    goal: 'implement one bounded change'
  })
  assert.equal(policy.requested_subagents, 7)
  assert.equal(policy.mode, 'explicit_operator_count')
  assert.equal(policy.selection_reason, 'explicit_operator_count_preserved')
})

test('mission preparation writes the selected automatic count into plan, budget, prompt, and evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-fanout-plan-'))
  const dir = path.join(root, '.sneakoscope', 'missions', 'M-fanout')
  await fs.mkdir(dir, { recursive: true })

  const automatic = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'M-fanout',
    goal: 'fix independent files in parallel',
    route: '$Naruto',
    mode: 'naruto'
  })
  assert.equal(automatic.plan.requested_subagents, 2)
  assert.equal(automatic.budget.requestedSubagents, 2)
  assert.equal(automatic.evidence.requested_subagents, 2)
  assert.equal(automatic.fanoutPolicy.requested_subagents, 2)
  assert.match(automatic.delegationPrompt, /requested subagents: 2/)

  const explicitDir = path.join(root, '.sneakoscope', 'missions', 'M-explicit')
  await fs.mkdir(explicitDir, { recursive: true })
  const explicit = await prepareOfficialSubagentMission({
    root,
    dir: explicitDir,
    missionId: 'M-explicit',
    goal: 'implement one bounded change',
    route: '$Naruto',
    requestedSubagents: 7,
    requestedSubagentsExplicit: true,
    mode: 'naruto'
  })
  assert.equal(explicit.plan.requested_subagents, 7)
  assert.equal(explicit.evidence.requested_subagents, 7)
  assert.equal(explicit.fanoutPolicy.requested_subagents, 7)
})
