import test from 'node:test';
import assert from 'node:assert/strict';
import { consultJevTurnModel, setDecisionTestOverrides } from '../integration.js';
import { defaultDecisionConfig } from '../config.js';
import '../../__tests__/helpers/isolated-test-home.js';
import { ROUTING_TIERS } from '../types.js';
import { BUILTIN_LATEST_TIER_MODELS, resetLatestModelTierCache } from '../../subagents/model-tiers.js';
import { customImageModeLine, planJevTurn } from '../../hooks-runtime/jev-turn-plan.js';
import { routePrompt, withJevRouteOverride } from '../../routes.js';

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
    assert.deepEqual(result, { called: false, model: null, effort: null, tier: null, reason: 'off' });
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('an enabled Jev turn picks a tier and resolves it to the newest model of that tier', async () => {
  resetLatestModelTierCache();
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
      for (const tier of ROUTING_TIERS) assert.equal(typeof body.questions.route_turn?.criteria?.[tier.id], 'string');
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          route_turn: choice('fast', keys),
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
    assert.equal(result.tier, 'fast');
    assert.equal(result.model, BUILTIN_LATEST_TIER_MODELS.fast);
    assert.equal(result.effort, 'low');
    assert.equal(result.reason, 'applied');
  } finally {
    setDecisionTestOverrides(null);
  }
});

/** Answer every question in the request; `picks` sets the choice of named questions. */
function answerAll(body: { questions: Record<string, { type: string; criteria?: Record<string, string> }> }, picks: Record<string, { choice: string; confidence?: number }>) {
  const answers: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(body.questions)) {
    if (question.type === 'noul') answers[id] = { type: 'noul', noul: 0.04 };
    else if (question.type === 'score') answers[id] = { type: 'score', score: 0, confidence: 0.9 };
    else {
      const keys = Object.keys(question.criteria || {});
      const pick = picks[id] || { choice: id === 'route_turn' ? 'fast' : 'keep_baseline' };
      answers[id] = { ...choice(pick.choice, keys), ...(pick.confidence === undefined ? {} : { confidence: pick.confidence }) };
    }
  }
  return new Response(JSON.stringify({ model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 30, output_tokens: 6 } }), { status: 200 });
}

const turnEnv = () => ({ OPENROUTER_API_KEY: 'sk-or-test-turnroutingaaaaaaaa', HOME: process.env.HOME, PATH: process.env.PATH });

test('a confident Jev turn picks the pipeline, and routePrompt follows it inside the hook scope', async () => {
  const prompt = 'Why does the login page flash white on load? Please make it stop.';
  const seen: string[] = [];
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || ''));
      seen.push(...Object.keys(body.questions));
      return answerAll(body, { option_route: { choice: 'implement' } });
    }
  });
  try {
    const plan = await planJevTurn(process.cwd(), prompt, turnEnv());
    assert.ok(seen.includes('option_route'), seen.join(','));
    assert.equal(plan?.routeId, 'Naruto');
    const routed = await withJevRouteOverride(plan?.routeOverride || null, async () => routePrompt(prompt)?.id);
    assert.equal(routed, 'Naruto');
    assert.equal(routePrompt(prompt)?.id || null, plan?.baselineRouteId ?? null, 'outside the hook scope the keyword router answers');
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('an explicit $command is never re-routed, and an unconfident answer keeps the keyword route', async () => {
  const seen: string[] = [];
  setDecisionTestOverrides({
    config: enabledConfig(),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || ''));
      seen.push(...Object.keys(body.questions));
      return answerAll(body, { option_route: { choice: 'research', confidence: 0.5 } });
    }
  });
  try {
    const explicit = await planJevTurn(process.cwd(), '$DFix fix the typo in README', turnEnv());
    assert.equal(seen.includes('option_route'), false, 'explicit commands never ask Jev for a route');
    assert.equal(explicit?.routeOverride, null);
    assert.equal(await withJevRouteOverride({ text: '$DFix fix the typo in README', routeId: 'Naruto' }, async () => routePrompt('$DFix fix the typo in README')?.id), 'DFix');
    // A different prompt: Jev answers are cached per request, so reusing the first test's prompt would replay its answer.
    const unsure = await planJevTurn(process.cwd(), 'Why does the settings page jump to the top after saving? Please make it stop.', turnEnv());
    assert.equal(unsure?.routeId, null);
    assert.equal(unsure?.routeOverride, null);
  } finally {
    setDecisionTestOverrides(null);
  }
});

test('the custom image mode line appears only on image turns', () => {
  const plan = (imageNeeded: boolean | null, customImageModel: string | null = 'google/gemini-3.1-flash-image') => ({
    decision: { called: false, choices: {}, tier: null, reason: 'off' }, baselineRouteId: null, routeId: null, routeOverride: null, customImageModel, imageNeeded
  });
  assert.match(customImageModeLine(plan(null), '서비스 로고 이미지 만들어줘', null), /sks imagegen generate/);
  assert.match(customImageModeLine(plan(null), 'Make the quarterly deck', 'PPT'), /google\/gemini-3\.1-flash-image/);
  assert.equal(customImageModeLine(plan(false), '서비스 로고 이미지 만들어줘', null), '', 'a confident Jev no wins over keywords');
  assert.match(customImageModeLine(plan(true), 'Refactor the settings page', null), /Do not use the built-in image tool/);
  assert.equal(customImageModeLine(plan(null, null), '서비스 로고 이미지 만들어줘', null), '', 'custom mode off adds nothing');
  assert.equal(customImageModeLine(null, '서비스 로고 이미지 만들어줘', null), '');
});
