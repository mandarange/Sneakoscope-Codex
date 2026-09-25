import '../../dist/core/__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../dist/core/subagents/model-tiers.js';

// Isolated HOME: no Codex models cache, so tiers resolve to the built-in latest family.
const CURRENT = [...new Set([T.fast, T.balanced, T.context, T.deep])];
import { buildAgentRoster } from '../../dist/core/agents/agent-roster.js';
import { buildAgentEffortPolicy, decideAgentEffort, decideAgentWorkerModel, decideOfficialSubagentModel } from '../../dist/core/agents/agent-effort-policy.js';

test('native agent effort policy routes safety and release judgment to the deep tier at max', () => {
  for (const role of ['safety', 'release']) {
    const decision = decideAgentEffort({ persona: { role }, prompt: 'review security and release readiness' });
    assert.equal(decision.model, T.deep);
    assert.equal(decision.reasoning_effort, 'max');
    assert.equal(decision.model_reasoning_effort, 'max');
    assert.equal(decision.model_tier, `${T.deep}-max`);
    assert.equal(decision.dynamic, true);
  }
});

test('native and official agents share task-weighted tier profiles', () => {
  const cases = [
    ['worker', 'exact one-line single-file mechanical rename', T.fast, 'low'],
    ['browser_use_operator', 'collect Chrome browser evidence', T.context, 'medium'],
    ['implementation_specialist', 'implement parser logic', T.balanced, 'low'],
    ['ui_implementer', 'implement the modal interaction', T.balanced, 'low'],
    ['native_app_specialist', 'implement the macOS AppKit menu bar', T.balanced, 'low'],
    ['security_reviewer', 'review the security boundary', T.deep, 'max']
  ];
  for (const [role, prompt, model, effort] of cases) {
    for (const decide of [decideAgentEffort, decideOfficialSubagentModel]) {
      const result = decide({ persona: { role }, prompt });
      assert.equal(result.model, model, role);
      assert.equal(result.reasoning_effort, effort, role);
      assert.equal(result.model_reasoning_effort, effort, role);
    }
  }
});

test('native agent roster records the tier effort policy', () => {
  const roster = buildAgentRoster({ agents: 5, concurrency: 2, prompt: 'multi-session release DB safety orchestration' });
  assert.equal(roster.effort_policy.schema, 'sks.agent-effort-policy.v1');
  assert.equal(roster.effort_policy.dynamic, true);
  assert.equal(roster.roster.length, 5);
  assert.equal(roster.concurrency, 2);
  assert.deepEqual(roster.effort_policy.model_constraint, CURRENT);
  assert.deepEqual(roster.effort_policy.allowed_efforts, ['low', 'medium', 'high', 'max']);
  assert.ok(roster.roster.every((agent) => CURRENT.includes(agent.model) && agent.model_tier && agent.model_profile));
  assert.ok(roster.roster.every((agent) => ['low', 'medium', 'high', 'max'].includes(agent.model_reasoning_effort)));
  assert.ok(roster.roster.every((agent) => agent.dynamic_effort_policy.escalation_triggers.length > 0));
  assert.deepEqual(buildAgentEffortPolicy().model_constraint, CURRENT);
});

test('parent and provider model inputs never replace the child tier model', () => {
  for (const mainModel of ['future-codex-model', 'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra', 'z-ai/glm-5.2', 'anthropic/claude-sonnet-4.5']) {
    const decision = decideAgentWorkerModel({ mainModel, effort: 'high', prompt: 'implement parser logic', role: 'implementation_specialist' });
    assert.equal(decision.model, T.balanced, mainModel);
    assert.equal(decision.model_reasoning_effort, 'low', mainModel);
    assert.equal(decision.model_tier, `${T.balanced}-low`, mainModel);
  }
});

test('environment model selections cannot escape the child tier policy and remain unchanged', () => {
  const keys = ['SKS_GLM_MODE', 'SKS_CODEX_MODEL', 'CODEX_MODEL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SKS_GLM_MODE: '1', SKS_CODEX_MODEL: 'z-ai/glm-5.2', CODEX_MODEL: 'anthropic/claude-sonnet-4.5' });
  try {
    for (const [prompt, model, effort] of [
      ['exact one-line single-file mechanical rename', T.fast, 'low'],
      ['Read the documentation and scan the repository', T.context, 'medium'],
      ['Implement the parser logic', T.balanced, 'low'],
      ['Review database migration safety', T.deep, 'max']
    ]) {
      const decision = decideAgentWorkerModel({ prompt });
      assert.equal(decision.model, model, prompt);
      assert.equal(decision.model_reasoning_effort, effort, prompt);
    }
    assert.equal(process.env.SKS_CODEX_MODEL, 'z-ai/glm-5.2');
    assert.equal(process.env.CODEX_MODEL, 'anthropic/claude-sonnet-4.5');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
