import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateHookPayloadOnce } from '../../hooks-runtime.js';
import { normalizeHookResult } from '../hook-io.js';
import { subagentSpawnPolicyBlockReason } from '../subagent-spawn-policy.js';
import { sealedSubagentRoutingContext } from '../subagent-context.js';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../subagents/model-tiers.js';

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
