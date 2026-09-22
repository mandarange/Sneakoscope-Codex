import test from 'node:test';
import assert from 'node:assert/strict';
import { consultJevTurnModel, setDecisionTestOverrides } from '../integration.js';
import { defaultDecisionConfig } from '../config.js';
import { SEALED_ROUTING_MODELS } from '../types.js';

process.env.SKS_JEV_DECISION_TEST_OVERRIDES = '1';

function enabledConfig() {
  const config = defaultDecisionConfig();
  return {
    ...config,
    mode: 'jev' as const,
    consentCloud: true,
    capabilities: {
      context: { ready: true, promoted: false, reason: 'test' },
      plan: { ready: true, promoted: false, reason: 'test' },
      recovery: { ready: false, promoted: false, reason: 'unsupported_no_sks_handler' }
    }
  };
}

function choice(selected: string, keys: string[]) {
  const others = keys.filter((key) => key !== selected);
  const share = others.length ? (1 - 0.9) / others.length : 0;
  return {
    type: 'choice',
    choice: selected,
    confidence: 0.91,
    probabilities: Object.fromEntries(keys.map((key) => [key, key === selected ? 0.9 : share]))
  };
}

test('Jev off does not call OpenRouter for a turn', async () => {
  let fetched = 0;
  setDecisionTestOverrides({
    config: defaultDecisionConfig(),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }
  });
  try {
    const result = await consultJevTurnModel({
      root: process.cwd(),
      prompt: 'Rename one label',
      env: { OPENROUTER_API_KEY: 'sk-or-test-turnroutingaaaaaaaa', HOME: process.env.HOME, PATH: process.env.PATH }
    });
    assert.equal(fetched, 0);
    assert.deepEqual(result, { called: false, model: null, reason: 'off' });
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('an enabled Jev turn calls Decisions and keeps a confident sealed model', async () => {
  let fetched = 0;
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async (_url, init) => {
      fetched += 1;
      const body = JSON.parse(String(init?.body || '')) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> }>;
      };
      assert.equal(body.questions.route_turn?.type, 'choice');
      const keys = Object.keys(body.questions.route_turn?.criteria || {});
      for (const model of SEALED_ROUTING_MODELS) assert.equal(typeof body.questions.route_turn?.criteria?.[model.id], 'string');
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          route_turn: choice('gpt-5.6-luna', keys),
          difficulty_turn: { type: 'score', score: 0, confidence: 0.9 },
          risk_turn: { type: 'noul', noul: 0.04 }
        },
        usage: { input_tokens: 20, output_tokens: 4 }
      }), { status: 200 });
    }
  });
  try {
    const result = await consultJevTurnModel({
      root: process.cwd(),
      prompt: 'Rename one exact label',
      env: { OPENROUTER_API_KEY: 'sk-or-test-turnroutingaaaaaaaa', HOME: process.env.HOME, PATH: process.env.PATH }
    });
    assert.equal(fetched, 1);
    assert.equal(result.called, true);
    assert.equal(result.model, 'gpt-5.6-luna');
    assert.equal(result.reason, 'applied');
  } finally {
    setDecisionTestOverrides(null);
  }
});
