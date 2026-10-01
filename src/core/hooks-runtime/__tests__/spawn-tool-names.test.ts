import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateHookPayloadOnce } from '../../hooks-runtime.js';
import { normalizeHookResult } from '../hook-io.js';
import { isSpawnAgentToolName } from '../spawn-tool-name.js';
import { subagentSpawnPolicyBlockReason } from '../subagent-spawn-policy.js';
import { isSpawnToolPayload } from '../parent-orchestration-gate.js';
import {
  managedOfficialSubagentFileContent,
  managedOfficialSubagentRoleBody,
  managedOfficialSubagentRoleByName,
  managedOfficialSubagentRoleContent
} from '../../managed-assets/managed-assets-manifest.js';

// Every name Codex has used for the spawn tool in a hook payload; the namespaced
// forms join namespace and name without a separator: `collaborationspawn_agent`
// is what Codex 0.159 sends, `multi_agent_v1spawn_agent` what 0.142 recorded.
const SPAWN_NAMES = ['spawn_agent', 'functions.spawn_agent', 'collaboration.spawn_agent', 'collaborationspawn_agent', 'functions.collaboration.spawn_agent', 'multi_agent_v1spawn_agent', 'multi_agent_v1.spawn_agent'];
const NOT_SPAWN = ['exec_command', 'wait_agent', 'collaborationwait_agent', 'multi_agent_v1wait_agent', 'spawn_agents', 'myspawn_agent', 'apply_patch'];
const v2Input = (model: string, extra: Record<string, unknown> = {}) => ({
  task_name: 'slice', message: 'Implement the assigned parser change.', model, reasoning_effort: 'low', fork_turns: 'none', ...extra
});

test('every spawn tool name Codex has used is recognised, and nothing else is', () => {
  for (const name of SPAWN_NAMES) assert.equal(isSpawnAgentToolName(name), true, name);
  for (const name of NOT_SPAWN) assert.equal(isSpawnAgentToolName(name), false, name);
  for (const name of SPAWN_NAMES) assert.equal(isSpawnToolPayload({ tool_name: name }), true, name);
});

test('a spawn naming an older generation is refused under every tool name, including the one Codex 0.159 sends', () => {
  for (const name of SPAWN_NAMES) {
    const reason = subagentSpawnPolicyBlockReason({ tool_name: name, tool_input: v2Input('gpt-5.6-sol') });
    assert.match(String(reason), /must name a current model/, name);
  }
  for (const name of NOT_SPAWN) assert.equal(subagentSpawnPolicyBlockReason({ tool_name: name, tool_input: v2Input('gpt-5.6-sol') }), null, name);
});

test('the real PreToolUse path denies a legacy-model spawn sent as collaborationspawn_agent', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-spawn-names-'));
  try {
    const payload = { session_id: 's', turn_id: 't', tool_use_id: 'u', cwd: root, tool_name: 'collaborationspawn_agent', tool_input: v2Input('gpt-5.6-sol') };
    const wire: any = normalizeHookResult('pre-tool', await evaluateHookPayloadOnce('pre-tool', payload, { root }));
    assert.equal(wire.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(wire.hookSpecificOutput.permissionDecisionReason, /must name a current model/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('a spawn of a role whose file pins an older model heals the file first, so that very spawn runs the current model', async () => {
  const role = managedOfficialSubagentRoleByName('implementation_specialist')!;
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-spawn-heal-'));
  const codexHome = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-spawn-heal-home-'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  try {
    await fsp.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({ fetched_at: 'x', models: [{ slug: 'gpt-6-sol' }, { slug: 'gpt-6.1-sol' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }] }));
    const file = path.join(root, '.codex', 'agents', role.filename);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, managedOfficialSubagentFileContent(role.id, role.schema_version, managedOfficialSubagentRoleBody({ ...role, model: 'gpt-6-sol' })));
    const payload = { session_id: 's', turn_id: 't', tool_use_id: 'u', cwd: root, tool_name: 'collaborationspawn_agent', tool_input: v2Input('gpt-6.1-sol', { agent_type: 'implementation_specialist' }) };
    const wire: any = normalizeHookResult('pre-tool', await evaluateHookPayloadOnce('pre-tool', payload, { root }));
    assert.notEqual(wire.hookSpecificOutput?.permissionDecision, 'deny', JSON.stringify(wire));
    assert.equal(await fsp.readFile(file, 'utf8'), managedOfficialSubagentRoleContent(role));
    assert.match(await fsp.readFile(file, 'utf8'), /model = "gpt-6\.1-sol"/);

    // A user-owned role file of the same name is never rewritten.
    const mine = 'name = "implementation_specialist"\nmodel = "gpt-6-sol"\ndeveloper_instructions = """mine"""\n';
    await fsp.writeFile(file, mine);
    await evaluateHookPayloadOnce('pre-tool', payload, { root });
    assert.equal(await fsp.readFile(file, 'utf8'), mine);
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(codexHome, { recursive: true, force: true });
  }
});
