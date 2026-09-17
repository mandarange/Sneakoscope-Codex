import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareRoute } from '../../pipeline-internals/runtime-core.js'
import { withLocalDecisionAdvice, setLocalDecisionTestOverrides } from '../integration.js'
import { buildPlanningDecisionInput, normalizeExplicitDecisionInput, redactSummary, shadowSampleSelected } from '../input.js'
import { ADVISORY_CONTEXT_HEADER } from '../policy.js'
import { field, okFixture } from './fixtures.js'
import type { DecisionInput, DecisionResult, LocalDecisionConfig, LocalDecisionProvider } from '../types.js'

process.env.SKS_LOCAL_DECISION_TEST_OVERRIDES = '1'

function config(mode: LocalDecisionConfig['mode'], shadowSampleRate = 1): LocalDecisionConfig {
  return { schemaVersion: 1, mode, shadowSampleRate, updatedAt: null }
}

interface CountingProvider extends LocalDecisionProvider {
  decideCalls: DecisionInput[]
  shadowCalls: DecisionInput[]
  submitShadow(input: DecisionInput): void
}

function countingProvider(answer: (input: DecisionInput) => DecisionResult | Promise<DecisionResult>): CountingProvider {
  const provider: CountingProvider = {
    decideCalls: [],
    shadowCalls: [],
    async decide(input) { provider.decideCalls.push(input); return answer(input) },
    submitShadow(input) { provider.shadowCalls.push(input) }
  }
  return provider
}

async function tempProject(t: test.TestContext, prefix: string): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix))
  t.after(async () => { setLocalDecisionTestOverrides(null); await fsp.rm(root, { recursive: true, force: true }) })
  // never let a test reach the operator's real runtime root
  process.env.SKS_LOCAL_DECISION_ROOT = path.join(root, 'never-created-runtime-root')
  return root
}

async function listMission(root: string, missionId: string): Promise<string[]> {
  return (await fsp.readdir(path.join(root, '.sneakoscope', 'missions', missionId))).sort()
}

test('LD-01 off: a Naruto preparation makes zero provider calls and the prepared object is returned as-is', async (t) => {
  const root = await tempProject(t, 'sks-ld-off-')
  const provider = countingProvider((input) => okFixture(input))
  setLocalDecisionTestOverrides({ provider, config: config('off') })
  const prepared: any = await prepareRoute(root, '$Naruto implement the two independent parsers in parallel', {}, { sessionKey: 'ld-off' })
  assert.ok(prepared.mission_id)
  assert.equal(provider.decideCalls.length, 0)
  assert.equal(provider.shadowCalls.length, 0)
  assert.doesNotMatch(String(prepared.additionalContext), /LOCAL_DECISION_ADVICE/)
  await assert.rejects(fsp.access(process.env.SKS_LOCAL_DECISION_ROOT!))
  const files = await listMission(root, prepared.mission_id)
  assert.ok(!files.some((name) => /decision/i.test(name)), files.join(','))
  const same = { delegationPrompt: 'baseline', plan: {}, budget: { requestedSubagents: 4 }, taskProfile: 'parallel-write', workflowRunId: 'w' }
  const result = await withLocalDecisionAdvice(same, { root, dir: root, missionId: 'm', goal: 'g', route: '$Naruto' }, { config: config('off'), provider })
  assert.equal(result, same)
})

test('LD-02 lightweight routes never build a decision even in advisory mode', async (t) => {
  const root = await tempProject(t, 'sks-ld-light-')
  const provider = countingProvider((input) => okFixture(input))
  setLocalDecisionTestOverrides({ provider, config: config('advisory') })
  for (const prompt of ['$DFix fix the typo in the README label', '$Answer what does the router do?', '$Naruto what is a lifecycle lock?']) {
    const prepared: any = await prepareRoute(root, prompt, {})
    assert.doesNotMatch(String(prepared.additionalContext || ''), /LOCAL_DECISION_ADVICE/, prompt)
  }
  assert.equal(provider.decideCalls.length, 0)
  assert.equal(provider.shadowCalls.length, 0)
})

test('LD-03 shadow: the baseline object is returned unchanged and only a best-effort sample is submitted', async (t) => {
  const root = await tempProject(t, 'sks-ld-shadow-')
  const provider = countingProvider((input) => okFixture(input))
  const observed: any[] = []
  setLocalDecisionTestOverrides({ provider, config: config('shadow', 1), observe: (event) => observed.push(event) })
  const prepared: any = await prepareRoute(root, '$Naruto implement the two independent parsers in parallel', {}, { sessionKey: 'ld-shadow' })
  assert.equal(provider.decideCalls.length, 0)
  assert.equal(provider.shadowCalls.length, 1)
  assert.doesNotMatch(String(prepared.additionalContext), /LOCAL_DECISION_ADVICE/)
  const sample = provider.shadowCalls[0]!
  assert.equal(sample.kind, 'planning')
  assert.equal(sample.scope.missionId, prepared.mission_id)
  assert.equal(sample.facts.taskProfile, 'parallel-write')
  assert.equal(sample.facts.countSource, 'automatic')
  assert.equal(observed[0].mode, 'shadow')
  const plan = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'subagent-plan.json'), 'utf8'))
  assert.equal(sample.scope.workflowRunId, plan.workflow_run_id)
  assert.equal(sample.facts.baselineAgents, plan.requested_subagents)
})

test('LD-04/05 advisory: a fixed template reaches the parent context and explicit counts drop reduction advice', async (t) => {
  const root = await tempProject(t, 'sks-ld-advisory-')
  const provider = countingProvider((input) => okFixture(input))
  setLocalDecisionTestOverrides({ provider, config: config('advisory') })
  const prepared: any = await prepareRoute(root, '$Naruto implement the two independent parsers in parallel', {}, { sessionKey: 'ld-advisory' })
  assert.equal(provider.decideCalls.length, 1)
  const context = String(prepared.additionalContext)
  assert.ok(context.includes(ADVISORY_CONTEXT_HEADER), context.slice(-400))
  assert.match(context, /workloadClass=bounded; fanoutAdvice=reduce_if_optional/)
  assert.match(context, /Do not treat candidate probabilities as proof\./)
  const before = context.indexOf(ADVISORY_CONTEXT_HEADER)
  assert.match(context.slice(0, before), /\$Naruto route prepared\./)
  const plan = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'subagent-plan.json'), 'utf8'))
  assert.equal(plan.requested_subagents_source, 'automatic')
  assert.equal(plan.requested_subagents, provider.decideCalls[0]!.facts.baselineAgents)
  assert.equal(plan.parent.model, 'gpt-6-astra')
  assert.doesNotMatch(JSON.stringify(plan), /LOCAL_DECISION/)
  assert.doesNotMatch(String(plan.delegation_prompt), /LOCAL_DECISION/)

  const explicitRoot = await tempProject(t, 'sks-ld-explicit-')
  const explicitProvider = countingProvider((input) => okFixture(input))
  setLocalDecisionTestOverrides({ provider: explicitProvider, config: config('advisory') })
  const explicit: any = await prepareRoute(explicitRoot, '$Naruto --agents=3 implement the two independent parsers in parallel', {}, { sessionKey: 'ld-explicit' })
  assert.equal(explicitProvider.decideCalls[0]!.facts.countSource, 'operator')
  const explicitContext = String(explicit.additionalContext)
  assert.match(explicitContext, /LOCAL_DECISION_ADVICE/)
  assert.doesNotMatch(explicitContext, /fanoutAdvice=/)
  assert.match(explicitContext, /workloadClass=bounded/)
  const explicitPlan = JSON.parse(await fsp.readFile(path.join(explicitRoot, '.sneakoscope', 'missions', explicit.mission_id, 'subagent-plan.json'), 'utf8'))
  assert.equal(explicitPlan.requested_subagents, 3)
  assert.equal(explicitPlan.requested_subagents_explicit, true)
})

test('LD-12/13/15 stale scope, missing service and a hung provider all keep the baseline inside the budget', async (t) => {
  const root = await tempProject(t, 'sks-ld-fallback-')
  const wrongRun = countingProvider((input) => { const result = okFixture(input); if (result.status === 'ok') result.scope.workflowRunId = 'another-run'; return result })
  setLocalDecisionTestOverrides({ provider: wrongRun, config: config('advisory') })
  const stale: any = await prepareRoute(root, '$Naruto implement the two independent parsers in parallel', {}, { sessionKey: 'ld-stale' })
  assert.equal(wrongRun.decideCalls.length, 1)
  assert.doesNotMatch(String(stale.additionalContext), /LOCAL_DECISION_ADVICE/)

  // No service, no metadata, no socket: the real client returns service_not_ready without spawning anything.
  setLocalDecisionTestOverrides({ config: config('advisory') })
  const missing: any = await prepareRoute(root, '$Naruto implement the three independent loaders in parallel', {}, { sessionKey: 'ld-missing' })
  assert.doesNotMatch(String(missing.additionalContext), /LOCAL_DECISION_ADVICE/)
  await assert.rejects(fsp.access(process.env.SKS_LOCAL_DECISION_ROOT!))
  // The decision overhead itself (not the whole preparation) must stay far inside the advisory budget when nothing listens.
  const direct = { delegationPrompt: 'baseline', plan: { requested_subagents_source: 'automatic' }, budget: { requestedSubagents: 4 }, taskProfile: 'parallel-write', workflowRunId: 'w-missing' }
  const startedDirect = Date.now()
  const unchanged = await withLocalDecisionAdvice(direct, { root, dir: root, missionId: 'm-missing', goal: 'implement loaders in parallel', route: '$Naruto' }, { config: config('advisory') })
  assert.equal(unchanged, direct)
  assert.ok(Date.now() - startedDirect < 1_500, `decision overhead ${Date.now() - startedDirect}ms`)

  const hung = countingProvider(() => new Promise<DecisionResult>(() => undefined))
  setLocalDecisionTestOverrides({ provider: hung, config: config('advisory') })
  const hungStart = Date.now()
  const budgeted = { delegationPrompt: 'baseline', plan: { requested_subagents_source: 'automatic' }, budget: { requestedSubagents: 4 }, taskProfile: 'parallel-write', workflowRunId: 'w' }
  const result = await withLocalDecisionAdvice(budgeted, { root, dir: root, missionId: 'm', goal: 'implement things in parallel', route: '$Naruto' }, { config: config('advisory'), provider: hung, budgetMs: 150 })
  assert.equal(result, budgeted)
  assert.ok(Date.now() - hungStart < 1_000)
  assert.equal(hung.decideCalls.length, 1)
})

test('LD-07/09 planning input derives effort, gate and risk from the promoted plan and refuses lowering on protected inputs', async (t) => {
  const root = await tempProject(t, 'sks-ld-facts-')
  const provider = countingProvider((input) => okFixture(input))
  setLocalDecisionTestOverrides({ provider, config: config('advisory') })
  const prepared: any = await prepareRoute(root, '$Naruto deploy the payment auth migration to production in parallel', {}, { sessionKey: 'ld-risk' })
  const input = provider.decideCalls[0]!
  assert.equal(input.facts.taskProfile, 'high-risk')
  assert.equal(input.facts.gateProfile, 'full')
  assert.equal(input.facts.highRisk, true)
  const context = String(prepared.additionalContext)
  assert.doesNotMatch(context, /fanoutAdvice=reduce_if_optional/)
  assert.doesNotMatch(context, /effortAdvice=consider_lower/)
  const built = buildPlanningDecisionInput({
    root, missionId: 'm', workflowRunId: 'w', goal: 'x', taskProfile: 'parallel-write', budget: { requestedSubagents: 4 },
    plan: { requested_subagents_source: 'automatic', agents: { a: { routed_model_reasoning_effort: 'low' }, b: { routed_model_reasoning_effort: 'low' } } }
  })
  assert.equal(built.facts.baselineEffort, 'low')
  const mixed = buildPlanningDecisionInput({
    root, missionId: 'm', workflowRunId: 'w', goal: 'x', taskProfile: 'parallel-write', budget: { requestedSubagents: 4 },
    plan: { requested_subagents_source: 'automatic', agents: { a: { routed_model_reasoning_effort: 'low' }, b: { routed_model_reasoning_effort: 'high' } }, role_model_preferences: { overrides: { a: {} } } }
  })
  assert.equal(mixed.facts.baselineEffort, null)
  assert.equal(mixed.facts.rolePreferenceExplicit, true)
})

test('summary redaction, deterministic shadow sampling and explicit input normalization', () => {
  const redacted = redactSummary('use sk-abcdefghijklmnopqrstuvwxyz1234 and AKIAABCDEFGHIJKLMNOP\n\n\n\nBearer abcdefghijklmnopqrstuvwxyz  now')
  assert.doesNotMatch(redacted, /sk-abcdefghij/)
  assert.doesNotMatch(redacted, /AKIAABCDEFGHIJKLMNOP/)
  assert.doesNotMatch(redacted, /Bearer abcdefghijklmnopqrstuvwxyz/)
  assert.match(redacted, /\[redacted\]/)
  assert.ok(redactSummary('x'.repeat(5000)).length <= 2000)
  const scope = { projectDigest: 'p', missionId: 'm', workflowRunId: 'w', snapshotDigest: 's' }
  assert.equal(shadowSampleSelected(scope, 1), true)
  assert.equal(shadowSampleSelected(scope, 0), false)
  assert.equal(shadowSampleSelected(scope, 0.1), shadowSampleSelected(scope, 0.1))
  let selected = 0
  for (let index = 0; index < 2000; index += 1) if (shadowSampleSelected({ ...scope, workflowRunId: `w${index}` }, 0.1)) selected += 1
  assert.ok(selected > 120 && selected < 280, `selected ${selected}`)
  const explicit = normalizeExplicitDecisionInput({ summary: 'two tests failed', facts: { failedChecks: 2 } }, 'recovery')
  assert.equal(explicit.kind, 'recovery')
  assert.equal(explicit.scope.projectDigest, 'explicit')
  assert.equal(explicit.facts.failedChecks, 2)
  assert.throws(() => normalizeExplicitDecisionInput({ summary: 'x', kind: 'planning' }, 'recovery'), /decision_input_kind_mismatch/)
  assert.throws(() => normalizeExplicitDecisionInput({ summary: 'x', facts: { skipTests: true } }, 'planning'), /decision_input_unknown_fact/)
  assert.equal(field(['a', 'b'], 'a').value, 'a')
})
