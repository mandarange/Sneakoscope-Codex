import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CODEX_HOOK_EVENTS } from '../../codex-compat/codex-hook-events.js';
import { evaluateHookPayload } from '../../hooks-runtime.js';
import { normalizeHookResult } from '../hook-io.js';
import {
  decideHookNaruto,
  hookNarutoDecisionLogPath
} from '../naruto-decision-gate.js';

const HOOK_NAMES = [
  'pre-tool',
  'permission-request',
  'post-tool',
  'pre-compact',
  'post-compact',
  'session-start',
  'user-prompt-submit',
  'subagent-start',
  'subagent-stop',
  'stop'
] as const;

test('Naruto decision gate bypasses trivial work and defaults bounded execution to official subagents', () => {
  const greeting = decideHookNaruto({ name: 'user-prompt-submit', payload: { prompt: '안녕하세요' }, state: {} });
  assert.equal(greeting.required, false);
  assert.equal(greeting.mode, 'none');
  assert.equal(greeting.action, 'bypass');
  assert.equal(greeting.task_profile, 'passthrough');
  assert.equal(greeting.trivial, true);

  const tiny = decideHookNaruto({ name: 'user-prompt-submit', payload: { prompt: 'README 오타만 고쳐줘' }, state: {} });
  assert.equal(tiny.required, false);
  assert.equal(tiny.route_id, 'DFix');
  assert.equal(tiny.task_profile, 'tiny-change');

  const bounded = decideHookNaruto({ name: 'user-prompt-submit', payload: { prompt: '로그인 파서 버그 수정해줘' }, state: {} });
  assert.equal(bounded.required, true);
  assert.equal(bounded.mode, 'generic_naruto');
  assert.equal(bounded.action, 'prepare_naruto');
  assert.equal(bounded.route_id, 'Naruto');
  assert.equal(bounded.task_profile, 'bounded-work');
  assert.match(bounded.reason, /default_parallel/);

  const routeOwned = decideHookNaruto({ name: 'user-prompt-submit', payload: { prompt: '$QA-LOOP --agents 5 API를 병렬 검수해줘' }, state: {} });
  assert.equal(routeOwned.required, false);
  assert.equal(routeOwned.mode, 'route_owned');
  assert.equal(routeOwned.route_id, 'QALoop');
  assert.equal(routeOwned.reason, 'route_owned_orchestration:QALoop');

  for (const prompt of ['$Research investigate this topic', '$AutoResearch improve this workflow']) {
    const owned = decideHookNaruto({ name: 'user-prompt-submit', payload: { prompt }, state: {} });
    assert.equal(owned.mode, 'route_owned', prompt);
    assert.equal(owned.required, false, prompt);
    assert.equal(owned.action, 'route_owned', prompt);
  }

  const active = decideHookNaruto({
    name: 'pre-tool',
    payload: { tool_name: 'Read' },
    state: { mission_id: 'M-active', route: 'Naruto', mode: 'NARUTO', subagents_required: true }
  });
  assert.equal(active.required, true);
  assert.equal(active.action, 'observe_required');
  assert.equal(active.source, 'active_route');

  const retiredIdentity = decideHookNaruto({
    name: 'pre-tool',
    payload: { tool_name: 'Read' },
    state: { mission_id: 'M-retired-route', route: 'Team', mode: 'TEAM' }
  });
  assert.equal(retiredIdentity.required, false);
  assert.equal(retiredIdentity.action, 'observe_bypass');
  assert.equal(retiredIdentity.route_id, null);

  const activeOwned = decideHookNaruto({
    name: 'post-tool',
    payload: { tool_name: 'Read' },
    state: { mission_id: 'M-research', route: 'Research', route_command: '$Research', mode: 'RESEARCH' }
  });
  assert.equal(activeOwned.mode, 'route_owned');
  assert.equal(activeOwned.required, false);
  assert.equal(activeOwned.action, 'route_owned');
});

test('all ten Codex hook events pass through and record the common Naruto decision gate', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-naruto-gate-'));
  const base = { cwd: root, session_id: 'all-hook-gate-events', turn_id: 'turn-all-hook-gate-events' };
  try {
    for (const name of HOOK_NAMES) {
      const payload: any = { ...base };
      if (name === 'user-prompt-submit') payload.prompt = '안녕하세요';
      if (name === 'pre-tool' || name === 'post-tool' || name === 'permission-request') payload.tool_name = 'Read';
      if (name === 'stop') payload.last_assistant_message = 'Completion Summary: no work requested.\nHonest Mode: verified no work.';
      if (name === 'subagent-start' || name === 'subagent-stop') {
        payload.agent_id = 'gate-agent';
        payload.agent_type = 'worker';
        payload.hook_event_name = name === 'subagent-start' ? 'SubagentStart' : 'SubagentStop';
      }
      const result: any = await evaluateHookPayload(name, payload, { root, state: {} });
      assert.equal(result.sksNarutoDecision?.recorded, true, name);
      assert.ok(['none', 'generic_naruto', 'route_owned'].includes(result.sksNarutoDecision?.mode), name);
      assert.equal(typeof result.sksNarutoDecision?.required, 'boolean', name);
    }

    const rows = (await fsp.readFile(hookNarutoDecisionLogPath(root), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(rows.length, CODEX_HOOK_EVENTS.length);
    assert.deepEqual(new Set(rows.map((row) => row.event)), new Set(CODEX_HOOK_EVENTS));
    assert.ok(rows.every((row) => row.prompt === undefined));
    assert.ok(rows.every((row) => typeof row.session_hash === 'string'));

    const normalized: any = normalizeHookResult('user-prompt-submit', {
      continue: true,
      sksNarutoDecision: rows.find((row) => row.event === 'UserPromptSubmit')
    });
    assert.equal(normalized.sksNarutoDecision, undefined);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
