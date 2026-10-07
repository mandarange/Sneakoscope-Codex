import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setDecisionTestOverrides } from '../integration.js';
import { defaultDecisionConfig } from '../config.js';
import { chooseChildModel, chooseChildModels, childModelQuestion } from '../child-model-choice.js';
import { normalizeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

const STATE = normalizeOpenRouterOnlyState({
  schema: 'sks.openrouter-only.v1',
  enabled: true,
  subagent_models: [
    { model: 'google/gemini-3.8-flash', criteria: 'Fast UI edits and renames.', reasoning_effort: 'low' },
    { model: 'z-ai/glm-5.3', criteria: 'Deep refactors and debugging.', reasoning_effort: 'high', default: true },
    { model: 'deepseek/deepseek-v4.1-flash', criteria: '' }
  ]
});

function optionAnswer(questionId: string, choice: string, confidence: number, probability: number) {
  const labels = ['m1', 'm2', 'm3', 'keep_baseline'];
  const rest = (1 - probability) / (labels.length - 1);
  return new Response(JSON.stringify({
    model: 'typesafe/jev-1.13',
    answers: {
      [`option_${questionId}`]: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(labels.map((label) => [label, label === choice ? probability : rest]))
      }
    },
    usage: { input_tokens: 10, output_tokens: 2 }
  }), { status: 200 });
}

async function withJev(response: (() => Response) | null, run: () => Promise<void>) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-childmodelchoiceaaaa';
  const config = response ? { ...defaultDecisionConfig(), mode: 'jev' as const, consentCloud: true } : defaultDecisionConfig();
  setDecisionTestOverrides({ config, fetchImpl: async () => (response ? response() : new Response('{}', { status: 500 })) });
  try {
    await run();
  } finally {
    setDecisionTestOverrides(null);
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

test('the question offers every list entry with its criteria and nothing else', () => {
  const question = childModelQuestion('child_model_spawn', STATE.subagent_models, { id: 'spawn', task: 'Rename a label.' });
  assert.deepEqual(Object.keys(question.options), ['m1', 'm2', 'm3']);
  assert.equal(question.options.m2, 'z-ai/glm-5.3 [high] (default): Deep refactors and debugging.');
  assert.match(question.options.m3 || '', /General work/);
  assert.equal((question.state as { default_option: string }).default_option, 'm2');
});

test('a confident Jev answer routes the child to the entry whose criteria fit', async () => {
  await withJev(() => optionAnswer('child_model_spawn', 'm1', 0.93, 0.92), async () => {
    const choice = await chooseChildModel({ root: process.cwd(), task: 'Rename the save button label.', requestedModel: T.balanced, state: STATE });
    assert.equal(choice?.entry.model, 'google/gemini-3.8-flash');
    assert.equal(choice?.source, 'jev');
  });
});

test('without a confident Jev answer the child keeps a listed request, else the default entry', async () => {
  await withJev(() => optionAnswer('child_model_spawn', 'm1', 0.4, 0.4), async () => {
    const unlisted = await chooseChildModel({ root: process.cwd(), task: 'Refactor the parser.', requestedModel: T.balanced, state: STATE });
    assert.equal(unlisted?.entry.model, 'z-ai/glm-5.3');
    assert.equal(unlisted?.source, 'default');
    const listed = await chooseChildModel({ root: process.cwd(), task: 'Refactor the parser.', requestedModel: 'DeepSeek/DeepSeek-V4.1-Flash', state: STATE });
    assert.equal(listed?.entry.model, 'deepseek/deepseek-v4.1-flash');
    assert.equal(listed?.source, 'requested');
  });
  await withJev(null, async () => {
    const off = await chooseChildModels({
      root: process.cwd(),
      workflowId: 'test',
      goal: 'Plan lanes.',
      lanes: [{ id: 'a', task: 'x' }, { id: 'b', task: 'y', requestedModel: 'google/gemini-3.8-flash' }],
      state: STATE
    });
    assert.equal(off.a?.entry.model, 'z-ai/glm-5.3');
    assert.equal(off.a?.reason, 'off');
    assert.equal(off.b?.source, 'requested');
  });
  assert.equal(await chooseChildModel({ root: process.cwd(), task: 'x', state: normalizeOpenRouterOnlyState(null) }), null);
});
