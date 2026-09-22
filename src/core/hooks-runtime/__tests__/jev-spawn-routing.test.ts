import test from 'node:test';
import assert from 'node:assert/strict';
import { setDecisionTestOverrides } from '../../decisions/integration.js';
import { defaultDecisionConfig } from '../../decisions/config.js';
import { jevSpawnModelRewrite } from '../jev-spawn-routing.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

function enabledConfig() {
  const config = defaultDecisionConfig();
  return {
    ...config,
    mode: 'jev' as const,
    consentCloud: true
  };
}

test('Naruto spawn rewrites the child model from Jev and leaves non-spawn tools alone', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-spawnroutingaaaaaaaa';
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'typesafe/jev-1.13',
      answers: {
        route_spawn: {
          type: 'choice',
          choice: 'gpt-5.6-sol',
          confidence: 0.91,
          probabilities: {
            'gpt-5.6-luna': 0.02,
            'gpt-5.6-sol': 0.9,
            'gpt-5.6-terra': 0.03,
            'gpt-6-astra': 0.03,
            keep_baseline: 0.02
          }
        },
        difficulty_spawn: { type: 'score', score: 1, confidence: 0.9 },
        risk_spawn: { type: 'noul', noul: 0.05 }
      },
      usage: { input_tokens: 12, output_tokens: 3 }
    }), { status: 200 })
  });
  try {
    const rewritten = await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: {
        model: 'gpt-6-astra',
        reasoning_effort: 'max',
        fork_turns: 'none',
        message: 'Implement the ordinary parser.'
      }
    });
    assert.equal(rewritten?.model, 'gpt-5.6-sol');
    assert.equal(rewritten?.reasoning_effort, 'low');
    assert.equal(await jevSpawnModelRewrite(process.cwd(), { mode: 'NARUTO' }, {
      tool_name: 'exec_command',
      tool_input: { cmd: 'echo hi' }
    }), null);
    assert.equal(await jevSpawnModelRewrite(process.cwd(), { mode: 'OFFICIAL' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: 'gpt-6-astra', message: 'Implement the parser.' }
    }), null);
  } finally {
    setDecisionTestOverrides(null);
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
