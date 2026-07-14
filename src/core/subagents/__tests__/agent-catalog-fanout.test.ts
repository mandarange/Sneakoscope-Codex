import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { classifyTaskProfile } from '../../runtime/task-profile.js'
import {
  MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT,
  officialSubagentFanoutPolicy,
  officialSubagentOnDemandRoleCatalog,
  officialSubagentRoleCatalog,
  officialSubagentRolePlan,
  recommendOfficialSubagentRoles,
  selectOfficialSubagentRole
} from '../agent-catalog.js'
import { prepareOfficialSubagentMission } from '../official-subagent-preparation.js'

test('automatic official subagent fanout defaults non-trivial work to two and reserves three for critical multi-domain risk', () => {
  const bounded = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('implement the parser fix'),
    goal: 'implement the parser fix',
    suggestedRoles: ['implementation_specialist']
  })
  assert.equal(bounded.requested_subagents, 2)
  assert.equal(bounded.default_subagents, 2)
  assert.equal(bounded.selection_reason, 'non_trivial_default_parallel')

  const singleRisk = officialSubagentFanoutPolicy({
    taskProfile: classifyTaskProfile('apply the database migration'),
    goal: 'apply the database migration',
    suggestedRoles: ['database_reviewer']
  })
  assert.equal(singleRisk.requested_subagents, 2)

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

test('narrow specialists outrank a bounded Luna worker for UI, test, and root-cause language', () => {
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

test('specialist selection covers implementation, judgment, long-context, and Codex tool roles', () => {
  const cases = [
    ['Implement the macOS AppKit menu bar NSStatusItem modal', 'native_app_specialist', false],
    ['Upgrade the npm dependency and repair install doctor build scripts', 'toolchain_specialist', false],
    ['Review the MCP SDK wire protocol schema and backward compatibility', 'protocol_reviewer', true],
    ['Audit hook session locks process cleanup idempotency and deadlock recovery', 'runtime_reliability_reviewer', true],
    ['Validate TriWiki context pack provenance trust anchors and proof artifacts', 'triwiki_evidence_reviewer', true],
    ['Analyze several large files and extensive logs as long context', 'long_context_analyst', true],
    ['Use Computer Use to inspect macOS System Settings', 'computer_use_operator', true],
    ['Use Chrome browser on localhost to capture webapp evidence', 'browser_use_operator', true],
    ['Generate a visual asset with gpt-image-2 imagegen', 'image_generation_operator', false]
  ] as const

  for (const [description, expected, readOnly] of cases) {
    assert.equal(selectOfficialSubagentRole({
      description,
      readOnly,
      requiresWrite: !readOnly
    }), expected)
  }
})

test('mixed tool and judgment recommendations put Sol Max judgment first and retain the Terra operator', () => {
  const securityBrowser = recommendOfficialSubagentRoles({
    description: 'Security review using Chrome browser evidence',
    readOnly: true,
    limit: 3
  })
  assert.equal(securityBrowser[0], 'security_reviewer')
  assert.ok(securityBrowser.includes('browser_use_operator'))

  const debugLongContext = recommendOfficialSubagentRoles({
    description: 'Debug a failure across several large files and extensive logs',
    readOnly: true,
    limit: 3
  })
  assert.equal(debugLongContext[0], 'debugger')
  assert.ok(debugLongContext.includes('long_context_analyst'))
})

test('on-demand role metadata is unique, alias-aware, and bounded independently of the installed catalog', () => {
  const full = officialSubagentRoleCatalog()
  const selected = officialSubagentOnDemandRoleCatalog([
    'macos-specialist',
    'native_app_specialist',
    'protocol-reviewer',
    'runtime-reliability-reviewer',
    'triwiki-evidence-reviewer'
  ])

  assert.equal(full.length, 25)
  assert.equal(selected.length, MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT)
  assert.deepEqual(selected.map((role) => role.name), [
    'native_app_specialist',
    'protocol_reviewer',
    'runtime_reliability_reviewer'
  ])
  assert.equal(new Set(selected.map((role) => role.description)).size, selected.length)
  assert.ok(full.every((role) => role.model_policy.length > 0))
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

test('route-owned orchestration count remains authoritative without masquerading as an operator request', () => {
  const policy = officialSubagentFanoutPolicy({
    requestedSubagents: 3,
    requestedExplicit: true,
    requestedSource: 'route_contract',
    taskProfile: 'bounded-work',
    goal: 'run the Research adversarial review contract'
  })
  assert.equal(policy.requested_subagents, 3)
  assert.equal(policy.mode, 'route_owned_contract_count')
  assert.equal(policy.count_source, 'route_contract')
  assert.equal(policy.selection_reason, 'route_owned_contract_count_preserved')
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
  assert.equal(automatic.plan.agent_catalog.mode, 'on_demand')
  assert.equal(automatic.plan.agent_catalog.full_catalog_injected, false)
  assert.equal(automatic.plan.agent_catalog.total_available, 25)
  assert.equal(Object.keys(automatic.plan.agents).length, automatic.plan.suggested_agents.length)
  assert.equal(Object.keys(automatic.plan.agents).length <= MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT, true)
  assert.equal(
    JSON.stringify(automatic.plan.agents).length < JSON.stringify(officialSubagentRolePlan()).length / 2,
    true
  )

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

  const researchDir = path.join(root, '.sneakoscope', 'missions', 'M-research')
  await fs.mkdir(researchDir, { recursive: true })
  const research = await prepareOfficialSubagentMission({
    root,
    dir: researchDir,
    missionId: 'M-research',
    goal: 'Review the research evidence and falsification results',
    route: '$Research',
    mode: 'generic',
    readOnly: true
  })
  assert.equal(research.plan.requested_subagents, 3)
  assert.equal(research.plan.requested_subagents_explicit, false)
  assert.equal(research.plan.requested_subagents_source, 'route_contract')
  assert.equal(research.plan.route_owned_count_contract?.count, 3)
  assert.equal(research.fanoutPolicy.selection_reason, 'route_owned_contract_count_preserved')
  assert.match(research.delegationPrompt, /3 \(route-owned exact orchestration contract\)/)
  assert.doesNotMatch(research.delegationPrompt, /3 \(explicit operator request\)/)

  const autoresearchDir = path.join(root, '.sneakoscope', 'missions', 'M-autoresearch')
  await fs.mkdir(autoresearchDir, { recursive: true })
  const autoresearch = await prepareOfficialSubagentMission({
    root,
    dir: autoresearchDir,
    missionId: 'M-autoresearch',
    goal: 'Run the experiment loop and adversarial convergence review',
    route: '$AutoResearch',
    mode: 'generic',
    readOnly: true
  })
  assert.equal(autoresearch.plan.requested_subagents, 3)
  assert.equal(autoresearch.plan.requested_subagents_source, 'route_contract')
  assert.equal(autoresearch.plan.route_owned_count_contract?.reason, 'autoresearch_exact_three_independent_reviewers')
})
