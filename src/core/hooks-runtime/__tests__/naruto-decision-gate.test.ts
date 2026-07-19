import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CODEX_HOOK_EVENTS } from '../../codex-compat/codex-hook-events.js';
import { evaluateHookPayload } from '../../hooks-runtime.js';
import { normalizeHookResult } from '../hook-io.js';
import { runOfficialSubagentWorkflow } from '../../subagents/official-subagent-runner.js';
import {
  HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME,
  HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME,
  HOST_CAPABILITY_HOOK_RUNTIME_FILENAME,
  createHostCapabilityHookRuntimeBinding,
  inspectHostCapabilityRuntime,
  requestHostCapabilities
} from '../../agent-bridge/host-capability-runtime.js';
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

test('App preparation blocks a missing requested host capability before returning delegation context', async () => {
  const result = await runOfficialSubagentWorkflow({
    root: process.cwd(),
    goal: 'Create and deliver an Excel workbook.',
    prompt: 'sealed delegation prompt',
    requestedSubagents: 1,
    maxThreads: 1,
    appSession: true,
    sessionKey: 'host-capability-preparation-session',
    hostCapabilityDependencies: hostCapabilityDependencies(['spreadsheet_create'])
  });

  assert.equal(result.status, 'host_capability_blocked');
  assert.equal(result.prepared, false);
  assert.equal(result.additionalContext, null);
  assert.ok(result.blockers.includes('host_capability_missing:host.spreadsheet.workbook.v1'));
});

test('host capability hooks enforce the exact allowlist and persist only bounded sanitized current-session evidence', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-host-capability-'));
  const missionId = 'M-20260719-host-capability-hooks';
  const workflowRunId = 'naruto-host-capability-hooks-run';
  const sessionId = 'host-capability-hooks-session';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const state = {
    mission_id: missionId,
    official_subagent_run_id: workflowRunId,
    session_scope: sessionId,
    mode: 'NARUTO',
    route: 'Naruto',
    subagents_required: true
  };
  try {
    await fsp.mkdir(dir, { recursive: true });
    const runtime = await inspectHostCapabilityRuntime({
      root,
      request: requestHostCapabilities('Create and deliver an Excel workbook.'),
      dependencies: hostCapabilityDependencies([
        'spreadsheet_create',
        'spreadsheet_inspect',
        'spreadsheet_update',
        'slack_send',
        'center_outbox_post'
      ])
    });
    assert.equal(runtime.ok, true);
    await fsp.writeFile(
      path.join(dir, HOST_CAPABILITY_HOOK_RUNTIME_FILENAME),
      `${JSON.stringify(createHostCapabilityHookRuntimeBinding({
        missionId,
        workflowRunId,
        sessionScope: sessionId,
        runtime
      }), null, 2)}\n`
    );

    const allowed: any = await evaluateHookPayload('pre-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-allowed',
      tool_name: 'mcp__acas-tools__spreadsheet_create',
      tool_input: { path: 'reports/monthly.xlsx', api_token: 'must-not-persist' },
      tool_use_id: 'tool-use-create'
    }, { root, state });
    assert.equal(allowed.decision, undefined);

    const denied: any = await evaluateHookPayload('pre-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-denied',
      tool_name: 'mcp__acas-tools__slack_send',
      tool_input: { channel: 'secret-channel', token: 'must-not-persist' },
      tool_use_id: 'tool-use-slack'
    }, { root, state });
    assert.equal(denied.decision, 'block');
    assert.match(denied.reason, /outside runtime\.allowed_tool_names/);

    const unrelated: any = await evaluateHookPayload('pre-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-unrelated',
      tool_name: 'Read',
      tool_input: { path: 'README.md' },
      tool_use_id: 'tool-use-read'
    }, { root, state });
    assert.equal(unrelated.decision, undefined);

    const artifact = {
      path: 'reports/monthly.xlsx',
      kind: 'spreadsheet',
      media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sha256: `sha256:${'a'.repeat(64)}`,
      bytes: 48211,
      role: 'deliverable'
    };
    const createPayload = {
      session_id: sessionId,
      turn_id: 'turn-host-create-post',
      tool_name: 'mcp__acas-tools__spreadsheet_create',
      tool_input: { path: artifact.path, credential: 'raw-input-secret-must-not-persist' },
      tool_response: {
        structured_content: {
          artifact,
          rows: Array.from({ length: 500 }, (_, index) => ({ index, value: `raw-row-${index}` })),
          access_token: 'raw-response-secret-must-not-persist'
        }
      },
      tool_use_id: 'tool-use-create'
    };
    await evaluateHookPayload('post-tool', createPayload, { root, state });
    await evaluateHookPayload('post-tool', createPayload, { root, state });
    await evaluateHookPayload('pre-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-inspect-pre',
      tool_name: 'mcp__acas-tools__spreadsheet_inspect',
      tool_input: { path: artifact.path },
      tool_use_id: 'tool-use-inspect'
    }, { root, state });
    await evaluateHookPayload('post-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-inspect-post',
      tool_name: 'mcp__acas-tools__spreadsheet_inspect',
      tool_input: { path: artifact.path },
      tool_response: { structured_content: { ok: true, path: artifact.path } },
      tool_use_id: 'tool-use-inspect'
    }, { root, state });

    const observationsText = await fsp.readFile(path.join(dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), 'utf8');
    const observations = JSON.parse(observationsText);
    const evidence = JSON.parse(await fsp.readFile(path.join(dir, HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME), 'utf8'));
    assert.equal(observations.tool_calls.length, 2);
    assert.deepEqual(observations.tool_calls.map((row: any) => row.tool), ['spreadsheet_create', 'spreadsheet_inspect']);
    assert.ok(observations.pre_tool_uses.some((row: any) => row.tool === 'spreadsheet_create' && row.decision === 'allowed'));
    assert.ok(observations.pre_tool_uses.some((row: any) => row.tool === 'slack_send' && row.decision === 'denied'));
    assert.equal(observationsText.includes('must-not-persist'), false);
    assert.equal(observationsText.includes('raw-row-'), false);
    assert.ok(Buffer.byteLength(observationsText, 'utf8') < 32 * 1024);
    assert.equal(evidence.ok, true);
    assert.deepEqual(evidence.tool_calls.map((row: any) => row.tool), ['spreadsheet_create', 'spreadsheet_inspect']);

    await evaluateHookPayload('post-tool', {
      session_id: sessionId,
      turn_id: 'turn-host-denied-post',
      tool_name: 'mcp__acas-tools__slack_send',
      tool_input: { channel: 'secret-channel', token: 'must-not-persist' },
      tool_response: { structured_content: { ok: true, token: 'must-not-persist' } },
      tool_use_id: 'tool-use-slack'
    }, { root, state });
    const deniedEvidence = JSON.parse(await fsp.readFile(path.join(dir, HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME), 'utf8'));
    assert.equal(deniedEvidence.ok, false);
    assert.ok(deniedEvidence.blockers.includes('host_tool_call_pre_use_denied:slack_send'));
    assert.ok(deniedEvidence.blockers.includes('host_tool_call_not_allowed:slack_send'));
    assert.ok(deniedEvidence.blockers.includes('host_tool_call_explicitly_denied:slack_send'));

    const beforeForeign = await fsp.readFile(path.join(dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), 'utf8');
    const foreign: any = await evaluateHookPayload('pre-tool', {
      session_id: 'foreign-session',
      turn_id: 'turn-host-foreign',
      tool_name: 'mcp__acas-tools__slack_send',
      tool_input: { token: 'foreign-secret' },
      tool_use_id: 'tool-use-foreign'
    }, { root, state });
    assert.equal(foreign.decision, undefined);
    assert.equal(await fsp.readFile(path.join(dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), 'utf8'), beforeForeign);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

function hostCapabilityDependencies(toolNames: string[]) {
  return {
    inventory: async () => ({
      schema: 'sks.mcp-inventory.v2',
      ok: true,
      scope: 'project',
      source: 'fixture_inventory',
      servers: [{
        name: 'acas-tools',
        enabled: true,
        enabled_tools: [...toolNames],
        disabled_tools: []
      }],
      server_count: 1,
      enabled_count: 1,
      failed_count: 0,
      blockers: [],
      warnings: []
    }) as any,
    health: async () => ({
      schema: 'sks.mcp-health.v1',
      ok: true,
      name: 'acas-tools',
      scope: 'project',
      status: 'healthy',
      tool_names: [...toolNames]
    }) as any
  };
}
