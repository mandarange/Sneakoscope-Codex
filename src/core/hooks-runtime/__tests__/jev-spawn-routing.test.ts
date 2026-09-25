import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setDecisionTestOverrides } from '../../decisions/integration.js';
import { defaultDecisionConfig } from '../../decisions/config.js';
import { BUILTIN_LATEST_TIER_MODELS, resetLatestModelTierCache } from '../../subagents/model-tiers.js';
import { jevSpawnModelRewrite, roleTierFallback } from '../jev-spawn-routing.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

function enabledConfig() {
  return { ...defaultDecisionConfig(), mode: 'jev' as const, consentCloud: true };
}

function jevAnswer(choice: string, confidence: number, probability: number) {
  const rest = (1 - probability) / 4;
  return new Response(JSON.stringify({
    model: 'typesafe/jev-1.13',
    answers: {
      route_spawn: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(['fast', 'balanced', 'context', 'deep', 'keep_baseline']
          .map((key) => [key, key === choice ? probability : rest]))
      },
      difficulty_spawn: { type: 'score', score: 1, confidence: 0.9 },
      risk_spawn: { type: 'noul', noul: 0.05 }
    },
    usage: { input_tokens: 12, output_tokens: 3 }
  }), { status: 200 });
}

async function withJev(response: () => Response, run: () => Promise<void>) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-spawnroutingaaaaaaaa';
  resetLatestModelTierCache();
  setDecisionTestOverrides({ config: enabledConfig(), fetchImpl: async () => response() });
  try {
    await run();
  } finally {
    setDecisionTestOverrides(null);
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

test('Naruto spawn seals the newest model of the tier Jev picked and leaves non-spawn tools alone', async () => {
  await withJev(() => jevAnswer('balanced', 0.91, 0.9), async () => {
    const rewritten = await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.deep, reasoning_effort: 'max', fork_turns: 'none', message: 'Implement the ordinary parser.' }
    });
    assert.equal(rewritten?.model, BUILTIN_LATEST_TIER_MODELS.balanced);
    assert.equal(rewritten?.reasoning_effort, 'low');
    assert.equal(await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'exec_command',
      tool_input: { cmd: 'echo hi' }
    }), null);
    assert.equal(await jevSpawnModelRewrite(process.cwd(), { mode: 'OFFICIAL' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.deep, message: 'Implement the parser.' }
    }), null);
  });
});

test('an unconfident Jev seals a spawn without a current model to its role tier, never an old pinned family', async () => {
  await withJev(() => jevAnswer('balanced', 0.4, 0.4), async () => {
    // An old 5.6 model is not current: the worker role gets its own fast tier.
    const worker = await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { agent_type: 'worker', model: 'gpt-5.6-luna', message: 'Rename one label.' }
    });
    assert.equal(worker?.model, BUILTIN_LATEST_TIER_MODELS.fast);
    assert.equal(worker?.reasoning_effort, 'low');
    assert.equal(worker?.fork_turns, 'none');
    // An unknown role falls back to the deep tier.
    const unknown = await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { message: 'Implement the unsealed slice.' }
    });
    assert.deepEqual({ model: unknown?.model, effort: unknown?.reasoning_effort }, roleTierFallback(''));
    assert.equal(unknown?.model, BUILTIN_LATEST_TIER_MODELS.deep);
    // A spawn that already names a current tier model is left as written.
    assert.equal(await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.context, reasoning_effort: 'medium', fork_turns: 'none', message: 'Explore the unsealed slice.' }
    }), null);
  });
});
