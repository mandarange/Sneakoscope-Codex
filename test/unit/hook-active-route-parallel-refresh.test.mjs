import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-active-route-'));
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  return root;
}

async function withEnv(env, fn) {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function missionEntries(root) {
  try {
    return await fs.readdir(path.join(root, '.sneakoscope', 'missions'));
  } catch {
    return [];
  }
}

const ACTIVE_TEAM_STATE = {
  mission_id: 'M-active',
  route: 'Team',
  route_command: '$Team',
  mode: 'TEAM',
  phase: 'TEAM_NATIVE_AGENT_INTAKE',
  agent_sessions: 5,
  role_counts: { analysis: 5, debate: 5, implementation: 5, review: 5 }
};

test('substantive prompt during active Team state prepares a fresh parallel route', async () => {
  await withEnv({ SKS_DISABLE_UPDATE_CHECK: '1' }, async () => {
    const root = await makeRoot();
    const { evaluateHookPayload } = await import('../../dist/core/hooks-runtime.js');
    const result = await evaluateHookPayload('user-prompt-submit', {
      cwd: root,
      conversation_id: 'active-route-fresh-parallel',
      prompt: '새 훅 병렬 처리 구조를 분석하고 코드 수정해줘'
    }, { root, state: ACTIVE_TEAM_STATE });

    const context = String(result.additionalContext || '');
    assert.match(context, /\$Team route prepared/);
    assert.match(context, /Native sessions: required before code-changing execution/);
    assert.doesNotMatch(context, /Active Team mission M-active/);

    const missions = await missionEntries(root);
    assert.equal(missions.length, 1);
    const current = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'state', 'current.json'), 'utf8'));
    assert.equal(current.mode, 'TEAM');
    assert.notEqual(current.mission_id, 'M-active');
  });
});

test('plain continuation prompt keeps the active route context instead of spawning a new route', async () => {
  await withEnv({ SKS_DISABLE_UPDATE_CHECK: '1' }, async () => {
    const root = await makeRoot();
    const { evaluateHookPayload } = await import('../../dist/core/hooks-runtime.js');
    const result = await evaluateHookPayload('user-prompt-submit', {
      cwd: root,
      conversation_id: 'active-route-continuation',
      prompt: 'keep going'
    }, { root, state: ACTIVE_TEAM_STATE });

    const context = String(result.additionalContext || '');
    assert.match(context, /Active Team mission M-active/);
    assert.doesNotMatch(context, /\$Team route prepared/);
    assert.deepEqual(await missionEntries(root), []);
  });
});

test('simple commit and push request is lightweight git work, not a parallel Team route', async () => {
  const { routePrompt, routeRequiresSubagents } = await import('../../dist/core/routes.js');
  const prompt = '커밋하고 푸쉬해줘';
  const route = routePrompt(prompt);
  assert.equal(route.id, 'CommitAndPush');
  assert.equal(routeRequiresSubagents(route, prompt), false);
});

test('natural language commit and push bypasses hook pipeline preparation', async () => {
  await withEnv({ SKS_DISABLE_UPDATE_CHECK: '1' }, async () => {
    const root = await makeRoot();
    const { evaluateHookPayload } = await import('../../dist/core/hooks-runtime.js');
    const result = await evaluateHookPayload('user-prompt-submit', {
      cwd: root,
      conversation_id: 'active-route-git-bypass',
      prompt: '배포하게 커밋하고 푸쉬해줘'
    }, { root, state: ACTIVE_TEAM_STATE });

    assert.match(String(result.systemMessage || ''), /git action bypassed pipeline route gates/);
    assert.equal(result.additionalContext, undefined);
    assert.deepEqual(await missionEntries(root), []);

    const stop = await evaluateHookPayload('stop', {
      cwd: root,
      conversation_id: 'active-route-git-bypass',
      last_assistant_message: 'Commit and push complete.'
    }, { root, state: ACTIVE_TEAM_STATE });
    assert.notEqual(stop.decision, 'block');
    assert.match(String(stop.systemMessage || ''), /accepted without route finalization/);
  });
});
