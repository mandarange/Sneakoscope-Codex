import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareOfficialSubagentMission } from '../official-subagent-preparation.js';
import {
  readRoleModelPreferences,
  resetRoleModelPreference,
  roleModelPreferencesPath,
  roleModelPreferencesStatus,
  setRoleModelPreference
} from '../role-model-preferences.js';

test('role model preferences are owner-only, managed-role scoped, and reject provider model ids', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-role-models-'));
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const env = { HOME: path.join(temp, 'home'), SKS_HOME: path.join(temp, 'sks-home') } as NodeJS.ProcessEnv;

  const invalidProvider: any = await setRoleModelPreference({
    role: 'ui_implementer',
    model: 'openrouter/vendor/model',
    reasoning: 'high',
    env
  });
  assert.equal(invalidProvider.ok, false);
  assert.ok(invalidProvider.blockers.includes('role_model_profile_unsupported'));

  const invalidRole: any = await setRoleModelPreference({
    role: 'made_up_role',
    model: 'gpt-5.6-sol',
    reasoning: 'high',
    env
  });
  assert.equal(invalidRole.ok, false);
  assert.ok(invalidRole.blockers.includes('role_model_role_invalid'));

  const set: any = await setRoleModelPreference({
    role: 'ui-implementer',
    model: 'gpt-5.6-sol',
    reasoning: 'max',
    env,
    now: () => '2026-07-22T00:00:00.000Z'
  });
  assert.equal(set.ok, true);
  assert.equal(set.role, 'ui_implementer');
  const filePath = roleModelPreferencesPath(env);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(filePath))).mode & 0o777, 0o700);

  const status = await roleModelPreferencesStatus({ env });
  const ui = status.roles.find((row) => row.role === 'ui_implementer');
  assert.equal(ui?.effective_model, 'gpt-5.6-sol');
  assert.equal(ui?.effective_reasoning_effort, 'max');
  assert.equal(ui?.override?.reasoning_effort, 'max');

  const reset = await resetRoleModelPreference({ role: 'ui_implementer', env });
  assert.equal(reset.ok, true);
  const read = await readRoleModelPreferences({ env });
  assert.equal(read.store.roles.ui_implementer, undefined);
});

test('official subagent preparation applies role overrides to routed plan and explicit spawn contract', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-role-model-plan-'));
  t.after(async () => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'repo');
  const dir = path.join(root, '.sneakoscope', 'missions', 'M-role-model');
  const env = { HOME: path.join(temp, 'home'), SKS_HOME: path.join(temp, 'sks-home') } as NodeJS.ProcessEnv;
  await fs.mkdir(dir, { recursive: true });
  await setRoleModelPreference({
    role: 'ui_implementer',
    model: 'gpt-5.6-sol',
    reasoning: 'max',
    env
  });

  const prepared = await prepareOfficialSubagentMission({
    root,
    dir,
    missionId: 'M-role-model',
    goal: 'Implement the provider control center UI interaction',
    route: '$Naruto',
    mode: 'naruto',
    env,
    slices: [{
      id: 'ui',
      title: 'Provider UI',
      description: 'Implement provider page UI and accessibility behavior',
      kind: 'worker',
      agent: 'ui_implementer',
      paths: ['native/provider-ui']
    }]
  });
  const routed = prepared.plan.agents.ui_implementer;
  assert.equal(routed.routed_model, 'gpt-5.6-sol');
  assert.equal(routed.routed_model_reasoning_effort, 'max');
  assert.equal(routed.routed_model_policy, 'user_role_model_preference');
  assert.equal(routed.routing_dynamic, false);
  assert.equal(prepared.plan.role_model_preferences.overrides.ui_implementer.reasoning_effort, 'max');
  assert.match(prepared.delegationPrompt, /effective model preference: gpt-5\.6-sol\/max \(user override\)/);
  assert.match(prepared.delegationPrompt, /pass model="gpt-5\.6-sol" and reasoning_effort="max" when spawning this role/);
  assert.match(prepared.delegationPrompt, /pass fork_turns="none" and carry this complete bounded slice contract in message/);
});

test('unconfigured roles preserve installed custom-agent defaults without spawn overrides', () => {
  const prompt = (async () => {
    const { buildOfficialSubagentPrompt } = await import('../official-subagent-prompt.js');
    return buildOfficialSubagentPrompt({
      goal: 'Implement provider UI',
      maxThreads: 2,
      slices: [{
        id: 'ui',
        title: 'Provider UI',
        description: 'Implement provider UI',
        kind: 'worker',
        agent: 'ui_implementer',
        paths: ['native/provider-ui']
      }]
    });
  })();
  return prompt.then((value) => {
    assert.match(value, /omit model\/reasoning overrides and preserve the installed custom-agent default/);
    assert.match(value, /pass fork_turns="none" and carry this complete bounded slice contract in message/);
  });
});
