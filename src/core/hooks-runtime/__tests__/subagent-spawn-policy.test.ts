import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateHookPayload, evaluateHookPayloadOnce } from '../../hooks-runtime.js';
import { normalizeHookResult } from '../hook-io.js';
import { subagentSpawnPolicyBlockReason } from '../subagent-spawn-policy.js';
import { sealedSubagentRoutingContext } from '../subagent-context.js';
import { decisionPaths, writeDecisionConfig } from '../../decisions/config.js';
import { officialSubagentSpawnCompatibilityContext } from '../hook-context.js';
import { parentOrchestrationLedgerPath, readParentOrchestrationLedger } from '../parent-orchestration-gate.js';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js';
import { openRouterOnlyStatePath, writeOpenRouterOnlyState } from '../../subagents/child-model-allowlist.js';

// The isolated HOME has no Codex models cache and no Jev config: tiers resolve
// to the built-in latest family and Jev is off.
test('child spawns accept every current tier model and reject old or foreign models', () => {
  const input = { model: T.deep, reasoning_effort: 'high', fork_turns: 'none', message: 'Implement the assigned parser change.' };
  const payload = { tool_name: 'collaboration.spawn_agent', tool_input: input };
  for (const model of Object.values(T)) {
    assert.equal(subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...input, model } }), null, model);
  }
  assert.equal(subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...input, fork_turns: '3' } }), null);
  for (const model of [undefined, 'gpt-5.6-luna', 'gpt-5.6-terra', 'anthropic/claude-sonnet-4.5']) {
    const reason = subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...input, model } })!;
    assert.match(reason, /must name a current model/, String(model));
    for (const current of Object.values(T)) assert.ok(reason.includes(current));
  }
  for (const fork_turns of [undefined, 'all']) {
    assert.match(subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...input, fork_turns } })!, /full-history\/default forks/);
  }
  assert.equal(subagentSpawnPolicyBlockReason({ tool_name: 'exec_command', tool_input: { cmd: 'echo spawn_agent' } }), null);
});

test('actual PreToolUse dispatch denies a spawn without a current model on every repeated invocation', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-tier-spawn-'));
  try {
    const payload = {
      session_id: 'tier-parent', turn_id: 'turn-1', tool_use_id: 'spawn-1',
      tool_name: 'spawn_agent', tool_input: { model: 'anthropic/claude-sonnet-4.5', fork_turns: 'none', message: 'Implement the parser.' }
    };
    for (let i = 0; i < 2; i++) {
      const result = await evaluateHookPayloadOnce('pre-tool', payload, { root });
      const wire: any = normalizeHookResult('pre-tool', result);
      assert.equal(wire.hookSpecificOutput.permissionDecision, 'deny');
      assert.equal(Object.hasOwn(wire, 'continue'), false);
      assert.match(wire.hookSpecificOutput.permissionDecisionReason, /must name a current model/);
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('resumed old plans cannot reintroduce an old pinned model; the role tier model is used', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-tier-resume-'));
  try {
    await fsp.writeFile(path.join(root, 'subagent-plan.json'), JSON.stringify({
      workflow: 'official_codex_subagent', agents: { worker: { routed_model: 'gpt-5.6-luna', routed_model_reasoning_effort: 'max' } }
    }));
    const context = await sealedSubagentRoutingContext(root, { agent_type: 'worker' });
    assert.match(context, new RegExp(`model: ${T.fast.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(context, /model_reasoning_effort: low/);
    assert.doesNotMatch(context, /gpt-5\.6/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('with Jev on, a managed role child context reports the role pin instead of a Jev seal', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-role-pin-'));
  try {
    await fsp.writeFile(path.join(root, 'subagent-plan.json'), JSON.stringify({
      workflow: 'official_codex_subagent', mode: 'naruto', agents: { worker: { routed_model: T.deep, routed_model_reasoning_effort: 'max' } }
    }));
    await writeDecisionConfig({ mode: 'jev', consentCloud: true });
    try {
      const pinned = await sealedSubagentRoutingContext(root, { agent_type: 'worker' });
      assert.ok(pinned.includes(`- model: ${T.fast}`), pinned);
      assert.match(pinned, /- model_reasoning_effort: low/);
      assert.match(pinned, /pinned by the role file/);
      assert.doesNotMatch(pinned, /sealed on the spawn call by Jev/);
      // A child with no managed role is still sealed on the spawn call by Jev.
      assert.match(await sealedSubagentRoutingContext(root, { agent_type: 'project_custom_agent' }), /sealed on the spawn call by Jev routing/);
    } finally {
      await fsp.rm(decisionPaths().configPath, { force: true });
    }
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

// OpenRouter Only mode. The store lives under the isolated HOME's ~/.codex;
// every test that turns the mode on removes the file again.
const LIST = [
  { model: 'google/gemini-3.8-flash', criteria: 'Fast UI edits and renames.', reasoning_effort: 'low' as const, default: false },
  { model: 'z-ai/glm-5.3', criteria: 'Deep refactors and debugging.', reasoning_effort: 'high' as const, default: true }
];

async function withOpenRouterOnly(
  update: Parameters<typeof writeOpenRouterOnlyState>[0],
  run: () => Promise<void>
) {
  await writeOpenRouterOnlyState(update);
  try {
    await run();
  } finally {
    await fsp.rm(openRouterOnlyStatePath(), { force: true });
  }
}

const SPAWN = { tool_name: 'spawn_agent', tool_input: { fork_turns: 'none', message: 'Implement the parser.' } };
const withModel = (model: unknown, extra: Record<string, unknown> = {}) => ({ ...SPAWN, tool_input: { ...SPAWN.tool_input, model, ...extra } });
const MATRIX: unknown[] = [undefined, '', ...Object.values(T), 'gpt-5.6-luna', 'anthropic/claude-sonnet-4.5', 'google/gemini-3.8-flash', 'Z-AI/GLM-5.3', 'z-ai/glm-5.3'];

test('OpenRouter Only mode admits only list models, case-insensitively, and names the list when it denies', async () => {
  await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
    for (const model of ['google/gemini-3.8-flash', 'z-ai/glm-5.3', 'Z-AI/GLM-5.3', 'Google/Gemini-3.8-Flash']) {
      assert.equal(subagentSpawnPolicyBlockReason(withModel(model)), null, model);
    }
    assert.equal(subagentSpawnPolicyBlockReason(withModel('z-ai/glm-5.3', { fork_turns: '2' })), null);
    for (const model of [undefined, '', ...Object.values(T), 'gpt-5.6-luna', 'anthropic/claude-sonnet-4.5', 'google/gemini-3.8', 'z-ai/glm-5.3:free']) {
      const reason = subagentSpawnPolicyBlockReason(withModel(model))!;
      assert.match(reason, /OpenRouter Only mode: children may run only a model on the user's subagent list: google\/gemini-3\.8-flash, z-ai\/glm-5\.3 \(default\)/, String(model));
      for (const tier of Object.values(T)) assert.equal(reason.includes(tier), false, `${String(model)} names ${tier}`);
    }
    // The fork rule still holds for a listed model, including a v1 full-history fork_context.
    for (const fork_turns of [undefined, 'all']) {
      assert.match(subagentSpawnPolicyBlockReason(withModel('z-ai/glm-5.3', { fork_turns }))!, /full-history\/default forks/);
    }
    for (const fork_context of [true, 'true', 'TRUE']) {
      assert.match(subagentSpawnPolicyBlockReason(withModel('z-ai/glm-5.3', { fork_context }))!, /fork_context=true is a full-history fork/);
    }
    assert.equal(subagentSpawnPolicyBlockReason(withModel('z-ai/glm-5.3', { fork_context: false })), null);
  });
  await withOpenRouterOnly({ enabled: true, subagent_models: [] }, async () => {
    for (const model of [undefined, T.deep, 'z-ai/glm-5.3']) {
      assert.match(subagentSpawnPolicyBlockReason(withModel(model))!, /subagent model list is empty[\s\S]*SKS Control Center > Subagent Models/, String(model));
    }
  });
});

test('with OpenRouter Only off, a stored list changes nothing: gate, contract, and sealed context are byte-identical', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-or-off-'));
  try {
    await fsp.writeFile(path.join(root, 'subagent-plan.json'), JSON.stringify({
      workflow: 'official_codex_subagent', mode: 'naruto', agents: { worker: { routed_model: T.balanced, routed_model_reasoning_effort: 'low' } }
    }));
    const snapshot = async () => ({
      reasons: MATRIX.map((model) => subagentSpawnPolicyBlockReason(withModel(model))),
      forks: [undefined, 'all', '3'].map((fork_turns) => subagentSpawnPolicyBlockReason(withModel(T.deep, { fork_turns }))),
      contract: officialSubagentSpawnCompatibilityContext(),
      context: await sealedSubagentRoutingContext(root, { agent_type: 'worker' })
    });
    const baseline = await snapshot();
    assert.equal(baseline.reasons[MATRIX.indexOf('google/gemini-3.8-flash')], baseline.reasons[0]);
    assert.match(String(baseline.reasons[0]), /must name a current model/);
    assert.match(baseline.contract, /the newest model of the role tier/);
    await withOpenRouterOnly({ enabled: false, subagent_models: LIST }, async () => {
      assert.deepEqual(await snapshot(), baseline);
    });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('OpenRouter Only guidance and sealed child context name the list models, never a tier model', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-or-context-'));
  try {
    await fsp.writeFile(path.join(root, 'subagent-plan.json'), JSON.stringify({
      workflow: 'official_codex_subagent', mode: 'naruto', agents: { worker: { routed_model: T.fast, routed_model_reasoning_effort: 'low' } }
    }));
    await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
      const contract = officialSubagentSpawnCompatibilityContext();
      assert.match(contract, /fork_turns="none"/);
      assert.match(contract, /google\/gemini-3\.8-flash: Fast UI edits and renames\.; z-ai\/glm-5\.3 \(default\): Deep refactors and debugging\./);
      const context = await sealedSubagentRoutingContext(root, { agent_type: 'worker' });
      assert.match(context, /OpenRouter Only subagent list \(google\/gemini-3\.8-flash, z-ai\/glm-5\.3 \(default\)\)/);
      for (const text of [contract, context]) {
        for (const tier of Object.values(T)) assert.equal(text.includes(tier), false, tier);
        assert.doesNotMatch(text, /newest model of the role tier/);
      }
    });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('actual PreToolUse dispatch in OpenRouter Only mode rewrites every spawn to a list model or denies it', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-or-spawn-'));
  const dispatch = async (id: string, input: Record<string, unknown>) => normalizeHookResult('pre-tool', await evaluateHookPayloadOnce('pre-tool', {
    session_id: 'or-parent', turn_id: 'turn-1', tool_use_id: id, tool_name: 'spawn_agent', tool_input: input
  }, { root })) as any;
  try {
    await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
      // No Naruto mission and Jev off: an unlisted model becomes the default entry.
      const unlisted = await dispatch('spawn-1', { model: 'anthropic/claude-sonnet-4.5', reasoning_effort: 'max', fork_turns: 'none', message: 'Implement the parser.' });
      assert.equal(unlisted.hookSpecificOutput.permissionDecision, 'allow');
      assert.deepEqual(unlisted.hookSpecificOutput.updatedInput, { model: 'z-ai/glm-5.3', reasoning_effort: 'high', fork_turns: 'none', message: 'Implement the parser.' });
      // A listed request is kept in the list spelling; a tier model never passes.
      const listed = await dispatch('spawn-2', { model: 'Google/Gemini-3.8-Flash', fork_turns: 'none', message: 'Rename the label.' });
      assert.equal(listed.hookSpecificOutput.updatedInput.model, 'google/gemini-3.8-flash');
      assert.equal(listed.hookSpecificOutput.updatedInput.reasoning_effort, 'low');
      const tier = await dispatch('spawn-3', { model: T.deep, fork_turns: 'none', message: 'Review the design.' });
      assert.equal(tier.hookSpecificOutput.updatedInput.model, 'z-ai/glm-5.3');
      // A full-history fork is still denied after the rewrite.
      const fork = await dispatch('spawn-4', { model: 'z-ai/glm-5.3', fork_turns: 'all', message: 'Fork.' });
      assert.equal(fork.hookSpecificOutput.permissionDecision, 'deny');
      // A MultiAgent v1 full-history fork is denied, never rewritten into a bounded one.
      for (const [id, input] of [
        ['spawn-6', { fork_context: true, message: 'Fork the parser work.' }],
        ['spawn-7', { fork_context: true, model: 'z-ai/glm-5.3', message: 'Fork the parser work.' }]
      ] as const) {
        const v1Fork = await dispatch(id, input);
        assert.equal(v1Fork.hookSpecificOutput.permissionDecision, 'deny', id);
        assert.equal(Object.hasOwn(v1Fork.hookSpecificOutput, 'updatedInput'), false, id);
      }
      // A non-Naruto spawn without fork_turns is not silently cut off from its history.
      const unbounded = await dispatch('spawn-8', { model: 'z-ai/glm-5.3', message: 'Continue the parser work.' });
      assert.equal(unbounded.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(unbounded.hookSpecificOutput.permissionDecisionReason, /fork_turns="none"[\s\S]*complete slice contract/);
    });
    await withOpenRouterOnly({ enabled: true, subagent_models: [] }, async () => {
      const empty = await dispatch('spawn-5', { model: T.deep, fork_turns: 'none', message: 'Implement the parser.' });
      assert.equal(empty.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(empty.hookSpecificOutput.permissionDecisionReason, /SKS Control Center > Subagent Models/);
    });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('a rewritten spawn keeps the hook additionalContext next to updatedInput', () => {
  const wire: any = normalizeHookResult('pre-tool', {
    continue: true, additionalContext: 'WAVE GUIDANCE', permissionDecision: 'allow', updatedInput: { model: 'z-ai/glm-5.3' }
  });
  assert.deepEqual(wire.hookSpecificOutput, {
    hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { model: 'z-ai/glm-5.3' }, additionalContext: 'WAVE GUIDANCE'
  });
  const bare: any = normalizeHookResult('pre-tool', { continue: true, permissionDecision: 'allow', updatedInput: { model: 'x' } });
  assert.equal(Object.hasOwn(bare.hookSpecificOutput, 'additionalContext'), false);
});

test('an accepted Naruto spawn in OpenRouter Only mode records the list entry and its source in the parent ledger', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-or-ledger-'));
  const session = '019fd710-d952-7000-8000-0000000000aa';
  const mission = 'M-or-ledger';
  const state = {
    mission_id: mission, official_subagent_run_id: 'run-0001', session_scope: session, mode: 'NARUTO',
    route: 'Naruto', route_command: '$Naruto', subagents_required: true, prompt: 'Fix the parser.'
  };
  try {
    await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', mission), { recursive: true });
    // The isolated HOME has no installed skills; the essential profile keeps
    // that advisory so the spawn itself is what this test observes.
    await fsp.writeFile(path.join(root, '.sneakoscope', 'verification-profile.json'), JSON.stringify({ profile: 'essential' }));
    await withOpenRouterOnly({ enabled: true, subagent_models: LIST }, async () => {
      const result: any = await evaluateHookPayload('pre-tool', {
        session_id: session, turn_id: 'turn-1', tool_use_id: 'spawn-ledger', tool_name: 'spawn_agent',
        tool_input: { model: 'google/gemini-3.8-flash', fork_turns: 'none', message: 'Rename the label.' }
      }, { root, state });
      assert.notEqual(result.permissionDecision, 'deny', String(result.reason));
      const ledger = await readParentOrchestrationLedger(root, mission, 'run-0001');
      assert.equal(ledger.spawns, 1);
      assert.deepEqual(ledger.last_spawn_route, { mode: 'openrouter_only', model: 'google/gemini-3.8-flash', source: 'requested', reason: 'off' });
    });
    // Mode off mid-mission: the next tier spawn does not inherit the old list route.
    const tier: any = await evaluateHookPayload('pre-tool', {
      session_id: session, turn_id: 'turn-2', tool_use_id: 'spawn-tier', tool_name: 'spawn_agent',
      tool_input: { model: T.deep, fork_turns: 'none', message: 'Review the parser.' }
    }, { root, state });
    assert.notEqual(tier.permissionDecision, 'deny', String(tier.reason));
    const after = await readParentOrchestrationLedger(root, mission, 'run-0001');
    assert.equal(after.spawns, 2);
    assert.equal(Object.hasOwn(after, 'last_spawn_route'), false);
    const raw = JSON.parse(await fsp.readFile(parentOrchestrationLedgerPath(root, mission), 'utf8'));
    assert.equal(Object.hasOwn(raw, 'last_spawn_route'), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
