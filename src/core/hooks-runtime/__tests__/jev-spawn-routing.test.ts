import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ISOLATED_TEST_HOME } from '../../__tests__/helpers/isolated-test-home.js';
import { setDecisionTestOverrides } from '../../decisions/integration.js';
import { resetDecisionTransportState } from '../../decisions/openrouter.js';
import { defaultDecisionConfig } from '../../decisions/config.js';
import { BUILTIN_LATEST_TIER_MODELS, resetLatestModelTierCache } from '../../subagents/model-tiers.js';
import { effectiveChildModelAllowlist, openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';
import { MANAGED_OFFICIAL_SUBAGENT_ROLES } from '../../managed-assets/managed-assets-manifest.js';
import { jevSpawnRouting, openRouterOnlyJevTurnLine, roleTierFallback } from '../jev-spawn-routing.js';
import { subagentSpawnPolicyBlockReason } from '../subagent-spawn-policy.js';

// The rewritten spawn input only; see jevSpawnRouting.
const rewrite = async (state: any, payload: any) => (await jevSpawnRouting(process.cwd(), state, payload)).input;

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
    const rewritten = await rewrite({ mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.deep, reasoning_effort: 'max', fork_turns: 'none', message: 'Implement the ordinary parser.' }
    });
    assert.equal(rewritten?.model, BUILTIN_LATEST_TIER_MODELS.balanced);
    assert.equal(rewritten?.reasoning_effort, 'low');
    assert.equal(await rewrite({ mode: 'NARUTO' }, {
      tool_name: 'exec_command',
      tool_input: { cmd: 'echo hi' }
    }), null);
    assert.equal(await rewrite({ mode: 'OFFICIAL' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.deep, message: 'Implement the parser.' }
    }), null);
  });
});

test('an unconfident Jev seals a spawn without a current model to its role tier, never an old pinned family', async () => {
  await withJev(() => jevAnswer('balanced', 0.4, 0.4), async () => {
    // An old 5.6 model is not current: the worker role gets its own fast tier.
    const worker = await rewrite({ mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { agent_type: 'worker', model: 'gpt-5.6-luna', message: 'Rename one label.' }
    });
    assert.equal(worker?.model, BUILTIN_LATEST_TIER_MODELS.fast);
    assert.equal(worker?.reasoning_effort, 'low');
    assert.equal(worker?.fork_turns, 'none');
    // An unknown role falls back to the deep tier.
    const unknown = await rewrite({ mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { message: 'Implement the unsealed slice.' }
    });
    assert.deepEqual({ model: unknown?.model, effort: unknown?.reasoning_effort }, roleTierFallback(''));
    assert.equal(unknown?.model, BUILTIN_LATEST_TIER_MODELS.deep);
    // A spawn that already names a current tier model is left as written.
    assert.equal(await rewrite({ mode: 'NARUTO' }, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.context, reasoning_effort: 'medium', fork_turns: 'none', message: 'Explore the unsealed slice.' }
    }), null);
  });
});

test('a spawn that names a managed role names the role pin: Jev is not asked and no tier is claimed that Codex would not run', async () => {
  let asked = 0;
  await withJev(() => { asked += 1; return jevAnswer('deep', 0.95, 0.95); }, async () => {
    const state = { mode: 'NARUTO' };
    const message = 'Rename one label.';
    // worker is a fast-tier role: Codex runs its pin over the spawn's model, so the input names the pin, not Jev's deep.
    const worker = await rewrite(state, {
      tool_name: 'spawn_agent',
      tool_input: { agent_type: 'worker', model: BUILTIN_LATEST_TIER_MODELS.deep, reasoning_effort: 'max', fork_turns: 'none', message }
    });
    assert.equal(worker?.model, BUILTIN_LATEST_TIER_MODELS.fast);
    assert.equal(worker?.reasoning_effort, 'low');
    assert.equal(worker?.agent_type, 'worker');
    // Already naming its pin: left byte-identical.
    assert.equal(await rewrite(state, {
      tool_name: 'spawn_agent',
      tool_input: { agent_type: 'worker', model: BUILTIN_LATEST_TIER_MODELS.fast, reasoning_effort: 'low', fork_turns: 'none', message }
    }), null);
    // A missing fork_turns is still filled so the spawn policy accepts the call.
    assert.equal((await rewrite(state, {
      tool_name: 'spawn_agent',
      tool_input: { agent_type: 'worker', model: BUILTIN_LATEST_TIER_MODELS.fast, reasoning_effort: 'low', message }
    }))?.fork_turns, 'none');
    // Every managed role (an alias included) ends up naming exactly its own pin.
    for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
      const input = { agent_type: role.codex_name, model: BUILTIN_LATEST_TIER_MODELS.context, reasoning_effort: 'medium', fork_turns: 'none', message };
      const out = await rewrite(state, { tool_name: 'spawn_agent', tool_input: input });
      assert.deepEqual(
        { model: out?.model ?? input.model, effort: out?.reasoning_effort ?? input.reasoning_effort },
        { model: role.model, effort: role.model_reasoning_effort },
        role.codex_name
      );
      assert.equal(subagentSpawnPolicyBlockReason({ tool_name: 'spawn_agent', tool_input: out ?? input }), null, role.codex_name);
    }
    assert.equal(asked, 0);
    // A spawn that names no managed role is still Jev's to seal.
    const generic = await rewrite(state, {
      tool_name: 'spawn_agent',
      tool_input: { model: BUILTIN_LATEST_TIER_MODELS.fast, reasoning_effort: 'low', fork_turns: 'none', message: 'Review the parser design.' }
    });
    assert.equal(generic?.model, BUILTIN_LATEST_TIER_MODELS.deep);
    assert.equal(asked, 1);
  });
});

// ---- OpenRouter Only mode -------------------------------------------------

const LIST = [
  { model: 'google/gemini-3.8-flash', criteria: 'Fast UI edits and renames.', reasoning_effort: 'low' as const, default: false },
  { model: 'z-ai/glm-5.3', criteria: 'Deep refactors and debugging.', reasoning_effort: 'high' as const, default: true },
  { model: 'deepseek/deepseek-v4.1-flash', criteria: '', reasoning_effort: null, default: false }
];
const LISTED = LIST.map((entry) => entry.model);
const T = BUILTIN_LATEST_TIER_MODELS;

async function withOpenRouterOnly(update: Parameters<typeof writeOpenRouterOnlyState>[0], run: () => Promise<void>) {
  await writeOpenRouterOnlyState(update);
  try {
    await run();
  } finally {
    await fsp.rm(openRouterOnlyStatePath(), { force: true });
  }
}

type JevReply = { label: string; response: (() => Response) | null };

function listAnswer(choice: string, confidence: number, probability: number): () => Response {
  const labels = ['m1', 'm2', 'm3', 'keep_baseline'];
  const rest = (1 - probability) / (labels.length - 1);
  return () => new Response(JSON.stringify({
    model: 'typesafe/jev-1.13',
    answers: {
      option_child_model_spawn: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(labels.map((label) => [label, label === choice ? probability : rest]))
      }
    },
    usage: { input_tokens: 10, output_tokens: 2 }
  }), { status: 200 });
}

const JEV_REPLIES: JevReply[] = [
  { label: 'off', response: null },
  { label: 'confident m1', response: listAnswer('m1', 0.93, 0.92) },
  { label: 'confident m2', response: listAnswer('m2', 0.93, 0.92) },
  { label: 'confident m3', response: listAnswer('m3', 0.93, 0.92) },
  { label: 'unconfident m1', response: listAnswer('m1', 0.3, 0.3) },
  { label: 'keep_baseline', response: listAnswer('keep_baseline', 0.95, 0.95) },
  { label: 'option outside the list', response: listAnswer('m9', 0.95, 0.95) },
  { label: 'http 500', response: () => new Response('{}', { status: 500 }) },
  { label: 'malformed', response: () => new Response('not json', { status: 200 }) }
];

async function withListJev(reply: JevReply, run: () => Promise<void>) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test-spawnroutingaaaaaaaa';
  resetDecisionTransportState();
  setDecisionTestOverrides({
    config: reply.response ? enabledConfig() : defaultDecisionConfig(),
    fetchImpl: async () => (reply.response ? reply.response() : new Response('{}', { status: 500 }))
  });
  try {
    await run();
  } finally {
    setDecisionTestOverrides(null);
    resetDecisionTransportState();
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

function spawnPayload(input: Record<string, unknown>) {
  return { tool_name: 'spawn_agent', tool_input: input };
}

test('OpenRouter Only: an unlisted model never passes the spawn gate, whatever Jev answers and whoever spawns', async () => {
  const requested: unknown[] = [undefined, '', T.deep, T.fast, 'gpt-5.6-luna', 'anthropic/claude-sonnet-4.5', 'GOOGLE/GEMINI-3.8-FLASH', 'z-ai/glm-5.3', 'deepseek/deepseek-v4.1-flash'];
  const states: Array<Record<string, string>> = [{}, { mode: 'OFFICIAL' }, { mode: 'NARUTO' }];
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    let cases = 0;
    const sources = new Set<string>();
    for (const reply of JEV_REPLIES) {
      await withListJev(reply, async () => {
        for (const model of requested) {
          for (const state of states) {
            resetDecisionTransportState();
            // A Naruto parent gets fork_turns="none" filled; any other parent names a bounded fork.
            const fork = state.mode === 'NARUTO' ? {} : { fork_turns: 'none' };
            const original = { model, reasoning_effort: 'max', message: `Implement slice for ${String(model)}.`, ...fork };
            const routing = await jevSpawnRouting(process.cwd(), state, spawnPayload(original));
            const effective: Record<string, unknown> = routing.input ?? original;
            const label = `${reply.label} / ${String(model)} / ${JSON.stringify(state)}`;
            assert.ok(LISTED.includes(String(effective.model)), label);
            assert.equal(subagentSpawnPolicyBlockReason(spawnPayload(effective)), null, label);
            assert.equal(routing.route?.model, effective.model, label);
            assert.equal(effective.fork_turns, 'none', label);
            assert.notEqual(effective.reasoning_effort, 'max', label);
            if (routing.route?.source === 'jev') assert.match(reply.label, /^confident/, label);
            sources.add(String(routing.route?.source));
            cases += 1;
          }
        }
      });
    }
    assert.equal(cases, JEV_REPLIES.length * requested.length * states.length);
    // Every path ran: Jev decisions and both in-list fallbacks.
    assert.deepEqual([...sources].sort(), ['default', 'jev', 'requested']);
  });
});

test('OpenRouter Only: Jev picks by the list criteria; fallbacks keep a listed request, else the default entry', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    await withListJev(JEV_REPLIES[1]!, async () => {
      const routed = await jevSpawnRouting(process.cwd(), {}, spawnPayload({ model: 'z-ai/glm-5.3', fork_turns: 'none', message: 'Rename the save button label.' }));
      assert.deepEqual(routed.route, { mode: 'openrouter_only', model: 'google/gemini-3.8-flash', reasoning_effort: 'low', entry_key: '["google/gemini-3.8-flash","low"]', source: 'jev', reason: 'applied' });
      assert.deepEqual(routed.input, { model: 'google/gemini-3.8-flash', reasoning_effort: 'low', fork_turns: 'none', message: 'Rename the save button label.' });
    });
    await withListJev(JEV_REPLIES[4]!, async () => {
      const listed = await jevSpawnRouting(process.cwd(), {}, spawnPayload({ model: 'DeepSeek/DeepSeek-V4.1-Flash', fork_turns: 'none', message: 'Refactor the parser.' }));
      assert.equal(listed.route?.source, 'requested');
      assert.equal(listed.input?.model, 'deepseek/deepseek-v4.1-flash');
      const unlisted = await jevSpawnRouting(process.cwd(), {}, spawnPayload({ model: T.balanced, fork_turns: 'none', message: 'Refactor the lexer.' }));
      assert.equal(unlisted.route?.source, 'default');
      assert.equal(unlisted.input?.model, 'z-ai/glm-5.3');
    });
    // An empty task never asks Jev.
    await withListJev(JEV_REPLIES[1]!, async () => {
      const empty = await jevSpawnRouting(process.cwd(), {}, spawnPayload({ model: T.deep, fork_turns: 'none' }));
      assert.deepEqual(empty.route, { mode: 'openrouter_only', model: 'z-ai/glm-5.3', reasoning_effort: 'high', entry_key: '["z-ai/glm-5.3","high"]', source: 'default', reason: 'empty_task' });
      // A v1 spawn that carries its task in text items is routed by Jev, not as an empty task.
      resetDecisionTransportState();
      const items = await jevSpawnRouting(process.cwd(), {}, spawnPayload({
        model: T.deep, fork_turns: 'none', items: [{ type: 'mention', path: 'app://x' }, { type: 'text', text: 'Rename the save button label.' }]
      }));
      assert.deepEqual(items.route, { mode: 'openrouter_only', model: 'google/gemini-3.8-flash', reasoning_effort: 'low', entry_key: '["google/gemini-3.8-flash","low"]', source: 'jev', reason: 'applied' });
    });
  });
});

test('OpenRouter Only: entry effort wins; without one only a list-safe requested effort survives; forks stay bounded', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    await withListJev(JEV_REPLIES[0]!, async () => {
      const route = (input: Record<string, unknown>) => jevSpawnRouting(process.cwd(), {}, spawnPayload({ message: 'Implement the slice.', ...input }));
      const dropped = await route({ model: 'deepseek/deepseek-v4.1-flash', reasoning_effort: 'max', fork_turns: '3' });
      assert.equal(Object.hasOwn(dropped.input || {}, 'reasoning_effort'), false);
      assert.equal(dropped.input?.fork_turns, '3');
      const kept = await route({ model: 'deepseek/deepseek-v4.1-flash', reasoning_effort: 'medium', fork_turns: 'none' });
      assert.equal(kept.input, null, 'an exact listed spawn with a list-safe effort is left as written');
      assert.equal(kept.route?.model, 'deepseek/deepseek-v4.1-flash');
      // An unbounded fork is left as written for the spawn policy to deny.
      const original = { message: 'Implement the slice.', model: 'z-ai/glm-5.3', reasoning_effort: 'low', fork_turns: 'all' };
      assert.deepEqual(await route(original), { input: null, route: null });
      assert.match(String(subagentSpawnPolicyBlockReason(spawnPayload(original))), /full-history\/default forks/);
    });
  });
  await withOpenRouterOnly({ enabled: true, subagent_models: [] }, async () => {
    const empty = await jevSpawnRouting(process.cwd(), {}, spawnPayload({ model: T.deep, message: 'Implement.' }));
    assert.deepEqual(empty, { input: null, route: null });
    assert.match(String(subagentSpawnPolicyBlockReason(spawnPayload({ model: T.deep, fork_turns: 'none' }))), /list is empty/);
  });
});

test('OpenRouter Only swaps a tier-pinned managed role: read-only keeps its sandbox via the list role, others are dropped', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    await withListJev(JEV_REPLIES[0]!, async () => {
      const route = (input: Record<string, unknown>) => jevSpawnRouting(process.cwd(), {}, spawnPayload({ message: 'Review the parser.', fork_turns: 'none', ...input }));
      const reviewer = await route({ agent_type: 'explorer', model: 'z-ai/glm-5.3' });
      assert.equal(reviewer.input?.agent_type, 'read_only_list_child');
      const writer = await route({ agent_type: 'worker', model: 'z-ai/glm-5.3' });
      assert.equal(Object.hasOwn(writer.input || {}, 'agent_type'), false);
      assert.equal(subagentSpawnPolicyBlockReason(spawnPayload(reviewer.input!)), null);
      assert.equal(subagentSpawnPolicyBlockReason(spawnPayload(writer.input!)), null);
      // A role the user wrote is left as written; a managed role that reaches the gate is denied.
      const custom = await route({ agent_type: 'my_custom_role', model: 'z-ai/glm-5.3', reasoning_effort: 'high' });
      assert.equal(custom.input, null);
      assert.match(String(subagentSpawnPolicyBlockReason(spawnPayload({ agent_type: 'debugger', model: 'z-ai/glm-5.3', fork_turns: 'none' }))), /pins a tier model/);
    });
  });
});

test('OpenRouter Only never hides a full-history fork, and fills fork_turns only for a Naruto parent', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    await withListJev(JEV_REPLIES[1]!, async () => {
      const route = (state: Record<string, unknown>, input: Record<string, unknown>) =>
        jevSpawnRouting(process.cwd(), state, spawnPayload({ message: 'Rename the save button label.', ...input }));
      // MultiAgent v1 fork_context=true copies the parent history: never routed, always denied.
      for (const state of [{}, { mode: 'NARUTO' }]) {
        for (const fork_context of [true, 'true']) {
          for (const model of [undefined, 'z-ai/glm-5.3']) {
            const input = { model, fork_context };
            assert.deepEqual(await route(state, input), { input: null, route: null });
            const reason = subagentSpawnPolicyBlockReason(spawnPayload({ ...input, message: 'x' }));
            assert.ok(reason, `${JSON.stringify(state)} ${String(fork_context)} ${String(model)}`);
            if (model) assert.match(reason, /fork_context=true is a full-history fork/);
          }
        }
      }
      // Without fork_turns a non-Naruto parent is told to bound the fork itself.
      for (const state of [{}, { mode: 'OFFICIAL' }]) {
        assert.deepEqual(await route(state, { model: 'z-ai/glm-5.3' }), { input: null, route: null });
        assert.match(String(subagentSpawnPolicyBlockReason(spawnPayload({ model: 'z-ai/glm-5.3' }))), /fork_turns="none"/);
        assert.match(String(subagentSpawnPolicyBlockReason(spawnPayload({}))), /subagent list: google\/gemini-3\.8-flash[\s\S]*fork_turns="none"/);
      }
      resetDecisionTransportState();
      const naruto = await route({ mode: 'NARUTO' }, { model: 'z-ai/glm-5.3', fork_context: false });
      assert.equal(naruto.input?.fork_turns, 'none');
      assert.equal(naruto.input?.model, 'google/gemini-3.8-flash');
      assert.equal(subagentSpawnPolicyBlockReason(spawnPayload(naruto.input!)), null);
    });
  });
});

test('OpenRouter Only ignores a stored GPT role-model preference instead of letting it short-circuit routing', async () => {
  const preferences = path.join(ISOLATED_TEST_HOME, '.sneakoscope', 'preferences', 'role-models.json');
  await fsp.mkdir(path.dirname(preferences), { recursive: true });
  await fsp.writeFile(preferences, JSON.stringify({
    schema: 'sks.role-model-preferences.v2', version: 2, updated_at: '2026-09-27T00:00:00.000Z',
    roles: { worker: { provider: 'openai', model: T.deep, reasoning_effort: 'high', updated_at: '2026-09-27T00:00:00.000Z' } }
  }));
  try {
    const payload = spawnPayload({ agent_type: 'worker', model: T.deep, message: 'Rename one label.' });
    await withListJev(JEV_REPLIES[1]!, async () => {
      // Mode off: the preference wins, so the Naruto spawn is left alone.
      assert.equal(await rewrite({ mode: 'NARUTO' }, payload), null);
      await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
        resetDecisionTransportState();
        const routed = await jevSpawnRouting(process.cwd(), { mode: 'NARUTO' }, payload);
        assert.equal(routed.input?.model, 'google/gemini-3.8-flash');
        assert.equal(routed.route?.source, 'jev');
      });
    });
  } finally {
    await fsp.rm(preferences, { force: true });
  }
});

test('with OpenRouter Only off, a stored list leaves every spawn rewrite byte-identical', async () => {
  const payloads = [
    { state: { mode: 'NARUTO' }, input: { model: T.deep, reasoning_effort: 'max', fork_turns: 'none', message: 'Implement the ordinary parser.' } },
    { state: { mode: 'NARUTO' }, input: { agent_type: 'worker', model: 'gpt-5.6-luna', message: 'Rename one label.' } },
    { state: { mode: 'NARUTO' }, input: { model: 'google/gemini-3.8-flash', message: 'Implement the unsealed slice.' } },
    { state: { mode: 'OFFICIAL' }, input: { model: 'anthropic/claude-sonnet-4.5', message: 'Implement the parser.' } },
    { state: {}, input: { model: T.deep, message: 'Implement the parser.' } }
  ];
  for (const answer of [() => jevAnswer('balanced', 0.91, 0.9), () => jevAnswer('balanced', 0.4, 0.4)]) {
    const snapshot = async () => {
      resetDecisionTransportState();
      const rows = [];
      for (const row of payloads) {
        const routing = await jevSpawnRouting(process.cwd(), row.state, spawnPayload(row.input));
        rows.push({ routing });
      }
      return rows;
    };
    await withJev(answer, async () => {
      const baseline = await snapshot();
      assert.ok(baseline.every((row) => row.routing.route === null));
      assert.ok(baseline.some((row) => row.routing.input !== null));
      await withOpenRouterOnly({ enabled: false, subagent_models: LIST }, async () => {
        assert.deepEqual(await snapshot(), baseline);
      });
    });
  }
});

test('the OpenRouter Only Jev turn line names the list, never a tier model', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    const allowlist = effectiveChildModelAllowlist();
    assert.equal(allowlist.mode, 'openrouter_only');
    if (allowlist.mode !== 'openrouter_only') return;
    const line = openRouterOnlyJevTurnLine(allowlist, 'high', true);
    assert.match(line, /Jev rated this task as high-effort work/);
    assert.match(line, /google\/gemini-3\.8-flash \[low\], z-ai\/glm-5\.3 \[high\] \(default\), deepseek\/deepseek-v4\.1-flash \[default effort\]/);
    for (const tier of Object.values(T)) assert.equal(line.includes(tier), false);
    assert.match(openRouterOnlyJevTurnLine({ ...allowlist, entries: [], models: [], default_model: null }, null, false), /list is empty[\s\S]*Subagent Models/);
  });
});
