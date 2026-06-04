import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-update-check-'));
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  return root;
}

async function evaluateUpdatePrompt(root, prompt, conversationId = 'update-check-control') {
  const { evaluateHookPayload } = await import('../../dist/core/hooks-runtime.js');
  return evaluateHookPayload('user-prompt-submit', {
    cwd: root,
    conversation_id: conversationId,
    prompt
  }, { root, state: {} });
}

async function readUpdateState(root) {
  return JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'state', 'update-check.json'), 'utf8'));
}

async function missionEntries(root) {
  try {
    return await fs.readdir(path.join(root, '.sneakoscope', 'missions'));
  } catch {
    return [];
  }
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

test('SKS update offer is control-plane only and does not start a route', async () => {
  await withEnv({
    SKS_INSTALLED_SKS_VERSION: '1.15.1',
    SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9'
  }, async () => {
    const root = await makeRoot();
    const result = await evaluateUpdatePrompt(root, 'fix the project');
    const context = String(result.additionalContext || '');
    assert.match(context, /Before any other work, ask the user to choose/);
    assert.doesNotMatch(context, /\$Team route prepared|Pipeline plan:/);
    assert.deepEqual(await missionEntries(root), []);
    const state = await readUpdateState(root);
    assert.equal(state.pending_offer.latest, '9.9.9');
    assert.equal(state.pending_offer.conversation_id, 'update-check-control');
  });
});

test('Update SKS now acceptance is control-plane only and does not start a route', async () => {
  await withEnv({
    SKS_INSTALLED_SKS_VERSION: '1.15.1'
  }, async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'update-check.json'), `${JSON.stringify({
      pending_offer: {
        conversation_id: 'update-check-control',
        latest: '9.9.9',
        offered_at: '2026-05-23T00:00:00.000Z'
      }
    }, null, 2)}\n`);
    const result = await evaluateUpdatePrompt(root, 'Update SKS now');
    const context = String(result.additionalContext || '');
    assert.match(context, /user accepted update to 9\.9\.9/);
    assert.match(context, /run exactly this command and nothing else/);
    assert.match(context, /sks update now --version 9\.9\.9/);
    assert.doesNotMatch(context, /npm i -g/);
    assert.doesNotMatch(context, /\$Team route prepared|Pipeline plan:/);
    assert.deepEqual(await missionEntries(root), []);
    const state = await readUpdateState(root);
    assert.equal(state.pending_offer, null);
    assert.equal(state.accepted.latest, '9.9.9');
    assert.equal(state.accepted.conversation_id, 'update-check-control');
  });
});

test('pending SKS update choice repeats copy-stable prompt instead of starting a route', async () => {
  await withEnv({
    SKS_INSTALLED_SKS_VERSION: '1.15.1'
  }, async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'update-check.json'), `${JSON.stringify({
      pending_offer: {
        conversation_id: 'update-check-control',
        latest: '9.9.9',
        offered_at: '2026-05-23T00:00:00.000Z'
      }
    }, null, 2)}\n`);
    const result = await evaluateUpdatePrompt(root, '잠깐 이거 복사 중이야');
    const context = String(result.additionalContext || '');
    assert.match(context, /copy-stable option/);
    assert.match(context, /Update SKS now/);
    assert.match(context, /Skip update for this conversation/);
    assert.match(context, /do not start a pipeline route/);
    assert.doesNotMatch(context, /\$Team route prepared|Pipeline plan:/);
    assert.deepEqual(await missionEntries(root), []);
    const state = await readUpdateState(root);
    assert.equal(state.pending_offer.latest, '9.9.9');
    assert.equal(state.accepted, undefined);
    assert.equal(state.skipped, undefined);
  });
});

test('accepted SKS update is not re-offered in the same conversation', async () => {
  await withEnv({
    SKS_INSTALLED_SKS_VERSION: '1.15.1',
    SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9'
  }, async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'update-check.json'), `${JSON.stringify({
      accepted: {
        conversation_id: 'update-check-control',
        latest: '9.9.9',
        accepted_at: '2026-05-23T00:00:00.000Z'
      }
    }, null, 2)}\n`);
    const result = await evaluateUpdatePrompt(root, 'continue the previous work');
    const context = String(result.additionalContext || '');
    assert.match(context, /was already accepted for this conversation/);
    assert.match(context, /Do not ask again or start a pipeline route/);
    assert.match(context, /sks update now --version 9\.9\.9/);
    assert.doesNotMatch(context, /npm i -g/);
    assert.doesNotMatch(context, /\$Team route prepared|Pipeline plan:/);
    assert.deepEqual(await missionEntries(root), []);
  });
});

test('accepted SKS update state clears once effective installed version reaches latest', async () => {
  await withEnv({
    SKS_INSTALLED_SKS_VERSION: '9.9.9',
    SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9'
  }, async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'update-check.json'), `${JSON.stringify({
      accepted: {
        conversation_id: 'update-check-control',
        latest: '9.9.9',
        accepted_at: '2026-05-23T00:00:00.000Z'
      }
    }, null, 2)}\n`);
    const result = await evaluateUpdatePrompt(root, 'continue after global update');
    const context = String(result.additionalContext || '');
    assert.doesNotMatch(context, /update .*already accepted|Run exactly this command|Update SKS now|Skip update for this conversation/i);
    const state = await readUpdateState(root);
    assert.equal(state.accepted, null);
    assert.equal(state.installed_current, '9.9.9');
    assert.equal(state.pending_offer, null);
  });
});
