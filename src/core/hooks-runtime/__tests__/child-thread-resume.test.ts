import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson } from '../../fsx.js';
import { createSubagentWaveLifecycle } from '../../subagents/wave-lifecycle.js';
import { readSubagentEvents } from '../../subagents/subagent-evidence.js';
import { evaluateParentOrchestrationGate } from '../parent-orchestration-gate.js';
import {
  inspectActiveOfficialSubagentWorkflow,
  recordAndRefreshSubagentEvidence,
  recordChildThreadResume
} from '../official-subagent-lifecycle.js';

// Shapes recorded from Codex 0.15x: a child keeps the parent's session_id and is
// marked by agent_id; its first SubagentStart carries the turn its tool hooks use,
// and a follow-up turn (followup_task / send_message) brings a new turn id with no
// second SubagentStart.
const SESSION = '019fa1ac-d303-77f0-9c3c-b3536dba9fd8';
const MISSION = 'M-child-resume';
const RUN = 'naruto-run-resume';
const CHILD = '019fa282-62f0-7503-8eb3-c238831ee226';
const TURN_1 = '019fa282-63e0-7ea3-a1ac-c699e964fb82';
const TURN_2 = '019fa294-1599-7d42-a854-c3afe6d6cc60';
const TURN_3 = '019fa29a-afb9-73d2-b049-2e5cddb88395';

const state = {
  mission_id: MISSION,
  official_subagent_run_id: RUN,
  session_scope: SESSION,
  mode: 'NARUTO',
  route: 'Naruto',
  route_command: '$Naruto',
  subagents_required: true,
  prompt: 'Implement the login parser fix across the auth package.'
};

function childHook(turnId: string, agentId = CHILD, hook = 'PreToolUse') {
  return { session_id: SESSION, turn_id: turnId, agent_id: agentId, agent_type: 'worker', hook_event_name: hook, tool_name: 'Bash', tool_use_id: `call_${turnId.slice(-4)}`, tool_input: { command: 'ls' } };
}

const parentEdit = {
  session_id: SESSION,
  turn_id: 'turn-parent-1',
  hook_event_name: 'PreToolUse',
  tool_name: 'apply_patch',
  tool_use_id: 'call-parent-edit',
  tool_input: { command: '*** Begin Patch\n*** Update File: src/auth/parser.ts\n@@\n-a\n+b\n*** End Patch' }
};

async function withMission(run: (root: string, dir: string) => Promise<void>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-child-resume-'));
  const dir = path.join(root, '.sneakoscope', 'missions', MISSION);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
    schema: 'sks.subagent-plan.v1',
    workflow: 'official_codex_subagent',
    mission_id: MISSION,
    workflow_run_id: RUN,
    requested_subagents: 1,
    max_threads: 2,
    created_at: new Date().toISOString(),
    wave_lifecycle: createSubagentWaveLifecycle({ workflowRunId: RUN, targetSubagents: 1, countPolicy: 'exact' })
  }));
  try {
    await run(root, dir);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function openThreads(dir: string): Promise<number> {
  const plan: any = await readJson(path.join(dir, 'subagent-plan.json'), null);
  return plan.wave_lifecycle.open_threads;
}

test('a follow-up turn on a settled child counts as running until its next Stop', async () => {
  await withMission(async (root, dir) => {
    const start = await recordAndRefreshSubagentEvidence(root, state, { hook_event_name: 'SubagentStart', session_id: SESSION, turn_id: TURN_1, agent_id: CHILD }, 'SubagentStart', SESSION);
    assert.equal(start?.event_name, 'SubagentStart');
    // Hooks of the Start turn are not a resume.
    assert.equal(await recordChildThreadResume(root, state, childHook(TURN_1), SESSION), null);
    await recordAndRefreshSubagentEvidence(root, state, { hook_event_name: 'SubagentStop', session_id: SESSION, turn_id: TURN_1, agent_id: CHILD }, 'SubagentStop', SESSION);
    assert.equal(await openThreads(dir), 0);
    assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: parentEdit, sessionKey: SESSION })).reason, 'children_settled');

    // The parent sends followup_task: the child's next hook carries a new turn id.
    const resume = await recordChildThreadResume(root, state, childHook(TURN_2), SESSION);
    assert.equal(resume?.event_name, 'SubagentResume');
    assert.equal(resume?.run_id, RUN);
    assert.equal(await openThreads(dir), 1);
    const active = await inspectActiveOfficialSubagentWorkflow(root, state, SESSION);
    assert.deepEqual(active, { status: 'active', missionId: MISSION, workflowRunId: RUN, openThreads: 1 });
    const waiting = await evaluateParentOrchestrationGate({ root, state, payload: parentEdit, sessionKey: SESSION });
    assert.equal(waiting.action, 'block');
    assert.equal(waiting.reason, 'children_running');

    // Every other hook of that turn, from any hook kind, adds no second row.
    for (const hook of ['PreToolUse', 'PostToolUse', 'PermissionRequest']) {
      assert.equal(await recordChildThreadResume(root, state, childHook(TURN_2, CHILD, hook), SESSION), null);
    }
    const concurrent = await Promise.all([
      recordChildThreadResume(root, state, childHook(TURN_3), SESSION),
      recordChildThreadResume(root, state, childHook(TURN_3), SESSION)
    ]);
    assert.equal(concurrent.filter(Boolean).length, 1);
    assert.equal((await readSubagentEvents(dir)).filter((row) => row.event_name === 'SubagentResume').length, 2);

    await recordAndRefreshSubagentEvidence(root, state, { hook_event_name: 'SubagentStop', session_id: SESSION, turn_id: TURN_3, agent_id: CHILD }, 'SubagentStop', SESSION);
    assert.equal(await openThreads(dir), 0);
    assert.equal((await inspectActiveOfficialSubagentWorkflow(root, state, SESSION)).status, 'active');
    assert.equal((await evaluateParentOrchestrationGate({ root, state, payload: parentEdit, sessionKey: SESSION })).reason, 'children_settled');

    // Completion evidence is still decided by Start/Stop only.
    const evidence: any = await readJson(path.join(dir, 'subagent-evidence.json'), null);
    assert.deepEqual(evidence.event_sources, ['SubagentStart', 'SubagentStop']);
    assert.equal(evidence.started_threads, 1);
  });
});

test('only a started child of the active run can resume', async () => {
  await withMission(async (root, dir) => {
    await recordAndRefreshSubagentEvidence(root, state, { hook_event_name: 'SubagentStart', session_id: SESSION, turn_id: TURN_1, agent_id: CHILD }, 'SubagentStart', SESSION);
    // Root parent hook: no agent_id.
    const { agent_id: _agent, agent_type: _type, ...rootHook } = childHook(TURN_2);
    assert.equal(await recordChildThreadResume(root, state, rootHook, SESSION), null);
    // A child that never started in this run.
    assert.equal(await recordChildThreadResume(root, state, childHook(TURN_2, '019fa2ff-0000-7000-8000-000000000009'), SESSION), null);
    // No turn id, closed route, or no active workflow run.
    assert.equal(await recordChildThreadResume(root, state, { ...childHook(TURN_2), turn_id: undefined }, SESSION), null);
    assert.equal(await recordChildThreadResume(root, { ...state, route_closed: true }, childHook(TURN_2), SESSION), null);
    assert.equal(await recordChildThreadResume(root, { ...state, official_subagent_run_id: undefined }, childHook(TURN_2), SESSION), null);
    assert.equal((await readSubagentEvents(dir)).length, 1);
  });
});
