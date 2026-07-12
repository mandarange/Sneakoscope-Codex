import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareRoute } from '../pipeline-internals/runtime-core.js';
import { routePrompt, routeRequiresSubagents } from '../routes.js';

test('lightweight Wiki stays missionless even when its prompt contains parallel wording', async () => {
  const prompt = '$Wiki audit all wiki files in parallel';
  const route = routePrompt(prompt);
  assert.equal(route?.id, 'Wiki');
  assert.equal(routeRequiresSubagents(route, prompt), false);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wiki-parallel-lightweight-'));
  try {
    const prepared: any = await prepareRoute(root, prompt, {});
    assert.equal(prepared.route?.id, 'Wiki');
    assert.equal(prepared.mission_id, undefined);
    assert.match(String(prepared.additionalContext || ''), /wiki/i);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'state', 'current.json')));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('Computer Use fast lane stays missionless even when its prompt contains parallel wording', async () => {
  const prompt = '$Computer-Use run two independent native app checks in parallel';
  const route = routePrompt(prompt);
  assert.equal(route?.id, 'ComputerUse');
  assert.equal(routeRequiresSubagents(route, prompt), false);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-computer-use-parallel-lightweight-'));
  try {
    const prepared: any = await prepareRoute(root, prompt, {});
    assert.equal(prepared.route?.id, 'ComputerUse');
    assert.equal(prepared.mission_id, undefined);
    assert.match(String(prepared.additionalContext || ''), /Computer Use fast lane/i);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'state', 'current.json')));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('an explicit agents flag materializes the generic official overlay for a specialized route', async () => {
  const prompt = '$DB --agents=2 inspect the migration safely';
  const route = routePrompt(prompt);
  assert.equal(route?.id, 'DB');
  assert.equal(routeRequiresSubagents(route, prompt), true);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-db-explicit-agents-overlay-'));
  try {
    const prepared: any = await prepareRoute(root, prompt, {}, { sessionKey: 'db-explicit-agents' });
    assert.ok(prepared.mission_id);
    const plan = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'subagent-plan.json'), 'utf8'));
    assert.equal(plan.workflow, 'official_codex_subagent');
    assert.equal(plan.requested_subagents, 2);
    await fsp.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'subagent-events.jsonl'));
    await fsp.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'subagent-evidence.json'));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
