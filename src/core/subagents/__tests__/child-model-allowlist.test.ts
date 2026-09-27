import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  allowlistedChildModel,
  defaultSubagentEntry,
  effectiveChildModelAllowlist,
  isAllowedChildModel,
  normalizeSubagentModelList,
  openRouterOnlyStatePath,
  readOpenRouterOnlyStateSync,
  writeOpenRouterOnlyState
} from '../child-model-allowlist.js';

async function withHome(run: (location: { home: string; env: NodeJS.ProcessEnv }) => Promise<void>) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-child-allowlist-'));
  try {
    await run({ home, env: { HOME: home } as NodeJS.ProcessEnv });
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

test('the list keeps order, rejects bad rows, and always has exactly one default', () => {
  const { entries, issues } = normalizeSubagentModelList([
    { model: 'google/gemini-3.8-flash', criteria: '  fast\nUI edits  ' },
    { model: 'z-ai/glm-5.3', criteria: 'deep refactors', reasoning_effort: 'high', default: true },
    { model: 'Z-AI/GLM-5.3', criteria: 'duplicate by case' },
    { model: 'not a model id' },
    { model: 'deepseek/deepseek-v4.1-flash', reasoning_effort: 'max' }
  ]);
  assert.deepEqual(entries.map((entry) => [entry.model, entry.default, entry.reasoning_effort]), [
    ['google/gemini-3.8-flash', false, null],
    ['z-ai/glm-5.3', true, 'high']
  ]);
  assert.equal(entries[0]?.criteria, 'fast UI edits');
  assert.deepEqual(issues.map((issue) => [issue.index, issue.code]), [
    [2, 'subagent_model_duplicate'],
    [3, 'subagent_model_id_invalid'],
    [4, 'subagent_model_effort_invalid']
  ]);
  assert.equal(normalizeSubagentModelList([{ model: 'a/b' }, { model: 'c/d' }]).entries[0]?.default, true);
  const tooLong = normalizeSubagentModelList(Array.from({ length: 17 }, (_, index) => ({ model: `vendor/model-${index}` })));
  assert.equal(tooLong.entries.length, 16);
  assert.deepEqual(tooLong.issues, [{ index: 16, code: 'subagent_model_list_too_long' }]);
});

test('a missing or foreign file reads as off; only an enabled file switches the allowlist', async () => {
  await withHome(async (location) => {
    assert.equal(readOpenRouterOnlyStateSync(location).enabled, false);
    assert.equal(effectiveChildModelAllowlist(location).mode, 'tiers');

    await fs.mkdir(path.dirname(openRouterOnlyStatePath(location)), { recursive: true });
    await fs.writeFile(openRouterOnlyStatePath(location), JSON.stringify({ schema: 'other', enabled: true }), 'utf8');
    assert.equal(readOpenRouterOnlyStateSync(location).enabled, false);

    const saved = await writeOpenRouterOnlyState({
      enabled: true,
      subagent_models: [
        { model: 'google/gemini-3.8-flash', criteria: 'fast', reasoning_effort: null, default: false },
        { model: 'z-ai/glm-5.3', criteria: 'deep', reasoning_effort: 'high', default: true }
      ]
    }, location);
    assert.equal(defaultSubagentEntry(saved)?.model, 'z-ai/glm-5.3');
    assert.equal((await fs.stat(openRouterOnlyStatePath(location))).mode & 0o777, 0o600);

    const allowlist = effectiveChildModelAllowlist(location);
    assert.equal(allowlist.mode, 'openrouter_only');
    assert.equal(allowlist.default_model, 'z-ai/glm-5.3');
    assert.equal(isAllowedChildModel('Z-AI/GLM-5.3', allowlist), true);
    assert.equal(allowlistedChildModel('Z-AI/GLM-5.3', allowlist), 'z-ai/glm-5.3');
    assert.equal(isAllowedChildModel('gpt-6-sol', allowlist), false);
    assert.equal(isAllowedChildModel('', allowlist), false);

    await writeOpenRouterOnlyState({ enabled: false }, location);
    const off = readOpenRouterOnlyStateSync(location);
    assert.equal(off.enabled, false);
    // Turning the mode off keeps the list for the next time it is turned on.
    assert.equal(off.subagent_models.length, 2);
  });
});

test('ids are stored as the lowercase catalog slug Codex matches, and only routable entries can be chosen', async () => {
  await withHome(async (location) => {
    const saved = await writeOpenRouterOnlyState({
      enabled: true,
      subagent_models: [
        { model: 'Vendor-Z/Delisted', criteria: 'old', reasoning_effort: null, default: true },
        { model: 'Z-AI/GLM-5.3', criteria: 'deep', reasoning_effort: 'high', default: false }
      ]
    }, location);
    assert.deepEqual(saved.subagent_models.map((entry) => entry.model), ['vendor-z/delisted', 'z-ai/glm-5.3']);
    // Without a route policy nothing is filtered.
    assert.deepEqual(effectiveChildModelAllowlist(location).models, ['vendor-z/delisted', 'z-ai/glm-5.3']);

    const policy = path.join(location.home, '.codex', 'sks', 'sks-bridge-route-policy.json');
    await fs.writeFile(policy, JSON.stringify({ model_routes: {
      'z-ai/glm-5.3': { provider_id: 'openrouter', upstream_model: 'z-ai/glm-5.3' },
      'openrouter:z-ai/glm-5.3': { provider_id: 'openrouter', upstream_model: 'z-ai/glm-5.3' },
      'gpt-6-sol': { provider_id: 'openai', upstream_model: 'gpt-6-sol' }
    } }), 'utf8');
    const allowlist = effectiveChildModelAllowlist(location);
    assert.equal(allowlist.mode, 'openrouter_only');
    assert.deepEqual(allowlist.models, ['z-ai/glm-5.3']);
    assert.equal(allowlist.default_model, 'z-ai/glm-5.3', 'an unroutable default hands over to the first routable entry');
    assert.deepEqual(allowlist.mode === 'openrouter_only' ? allowlist.unroutable : null, ['vendor-z/delisted']);
    assert.equal(isAllowedChildModel('vendor-z/delisted', allowlist), false);
  });
});
