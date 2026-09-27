import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { normalizeOpenRouterOnlyState, writeOpenRouterOnlyState } from '../child-model-allowlist.js'
import { applyListRoleModels, childModelLanes, listEntryEffort, readChildModelPlanContext } from '../child-model-plan.js'

const state = normalizeOpenRouterOnlyState({
  schema: 'sks.openrouter-only.v1',
  enabled: true,
  subagent_models: [
    { model: 'google/gemini-3.8-flash', criteria: 'fast', reasoning_effort: 'low' },
    { model: 'z-ai/glm-5.3', criteria: 'deep', reasoning_effort: null, default: true }
  ]
})
const list = {
  state,
  allowlist: { mode: 'openrouter_only' as const, models: state.subagent_models.map((entry) => entry.model), entries: state.subagent_models, default_model: 'z-ai/glm-5.3' },
  mainModel: 'anthropic/claude-sonnet-4.5'
}

test('lanes put slice-assigned roles first, stop at the Jev routing cap, and leave the goal to the request', () => {
  const agents = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`role_${index}`, { description: `role ${index}` }]))
  const lanes = childModelLanes({
    agents,
    slices: [{ id: 's', title: 'Edit', description: 'Edit one file', kind: 'worker', agent: 'role_9', paths: ['a.ts'], readOnly: true }]
  })
  assert.equal(lanes.length, 8)
  assert.equal(lanes[0]!.id, 'role_9')
  assert.equal(lanes[0]!.task, 'Edit: Edit one file (read-only)')
  assert.equal(lanes[1]!.task, 'Role role_0: role 0')
  assert.equal(lanes[0]!.requestedModel, null)
})

test('every role lands on a list model with its source recorded, and effort never leaves low..xhigh', () => {
  const applied = applyListRoleModels(
    { explorer: { model_reasoning_effort: 'max' }, worker: { model_reasoning_effort: 'medium' }, extra: {} },
    { lanes: ['explorer', 'worker'], choices: { worker: { entry: state.subagent_models[0]!, source: 'jev', reason: 'applied' } } },
    list,
    true
  )
  assert.equal(applied.agents.worker.routed_model, 'google/gemini-3.8-flash')
  assert.equal(applied.agents.worker.routed_model_reasoning_effort, 'low')
  assert.equal(applied.agents.worker.routed_model_policy, 'openrouter_only_jev')
  assert.equal(applied.agents.explorer.routed_model, 'z-ai/glm-5.3')
  // `max` is GPT-only: the default entry has no effort, so none is sent.
  assert.equal(applied.agents.explorer.routed_model_reasoning_effort, null)
  assert.equal(applied.agents.explorer.routed_model_policy, 'openrouter_only_default')
  assert.deepEqual(applied.evidence.roles, {
    explorer: { model: 'z-ai/glm-5.3', source: 'default', reason: 'keep_baseline', default_entry: true },
    worker: { model: 'google/gemini-3.8-flash', source: 'jev', reason: 'applied', default_entry: false },
    // Jev decided this plan, so a role past the lane cap names the cap.
    extra: { model: 'z-ai/glm-5.3', source: 'default', reason: 'role_cap', default_entry: true }
  })
  assert.deepEqual(applied.evidence.routed_roles, ['explorer', 'worker'])
  assert.deepEqual(applied.evidence.jev_decided_roles, ['worker'])
  assert.equal(applied.evidence.main_model, 'anthropic/claude-sonnet-4.5')
  assert.deepEqual(applied.evidence.read_only_role, { name: 'read_only_list_child', installed: true })
  assert.deepEqual(applied.evidence.warnings, [])
  assert.deepEqual(applied.jevModels, { worker: 'google/gemini-3.8-flash' })
  assert.equal(listEntryEffort(state.subagent_models[1]!, 'xhigh'), 'xhigh')
})

test('with Jev off no role claims a Jev decision, and a missing read-only role is recorded', () => {
  const off = { entry: state.subagent_models[1]!, source: 'default' as const, reason: 'off' }
  const applied = applyListRoleModels(
    { explorer: {}, worker: {}, extra: {} },
    { lanes: ['explorer', 'worker'], choices: { explorer: off, worker: off } },
    list,
    false
  )
  assert.deepEqual(applied.evidence.jev_decided_roles, [])
  assert.equal((applied.evidence.roles as Record<string, { reason: string }>).extra?.reason, 'off')
  assert.deepEqual(applied.jevModels, {})
  assert.deepEqual(applied.evidence.warnings, ['openrouter_only_read_only_role_missing'])
})

test('one plan reads the mode once: the allowlist, list, and main model come from the same store read', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-child-model-plan-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const location = { env: { HOME: home } as NodeJS.ProcessEnv }
  const off = readChildModelPlanContext(location)
  assert.equal(off.allowlist.mode, 'tiers')
  assert.equal(off.list, null)
  await writeOpenRouterOnlyState({ enabled: true, subagent_models: state.subagent_models }, location)
  await fs.writeFile(path.join(home, '.codex', 'config.toml'), 'model = "z-ai/glm-5.3"\n')
  const on = readChildModelPlanContext(location)
  assert.equal(on.allowlist.mode, 'openrouter_only')
  assert.equal(on.list?.allowlist, on.allowlist)
  assert.deepEqual(on.allowlist.models, ['google/gemini-3.8-flash', 'z-ai/glm-5.3'])
  assert.equal(on.allowlist.default_model, 'z-ai/glm-5.3')
  assert.equal(on.list?.mainModel, 'z-ai/glm-5.3')
})
