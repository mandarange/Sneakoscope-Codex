import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {
  ACTIVE_OFFICIAL_WORKFLOW_IDLE_MS,
  inspectActiveOfficialSubagentWorkflow,
  officialSubagentLifecycleCaptureBlockers,
  recordOfficialSubagentLifecycleCaptureFailure,
  recordAndRefreshSubagentEvidence
} from '../official-subagent-lifecycle.js';

test('lifecycle capture failures persist as run-scoped completion blockers', async () => {
  const artifactDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'sks-subagent-lifecycle-capture-failure-')
  );
  const runId = 'naruto-test-run';
  const state = { official_subagent_run_id: runId };
  const payload = {
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-a1',
    workflow_run_id: runId
  };
  try {
    const blocker = await recordOfficialSubagentLifecycleCaptureFailure(
      artifactDir,
      state,
      payload,
      'SubagentStop'
    );
    assert.match(
      blocker,
      /^official_subagent_lifecycle_capture_failed:SubagentStop:[a-f0-9]{16}$/
    );
    assert.deepEqual(
      await officialSubagentLifecycleCaptureBlockers(artifactDir, runId),
      [blocker]
    );
    assert.deepEqual(
      await officialSubagentLifecycleCaptureBlockers(artifactDir, 'other-run'),
      []
    );
  } finally {
    await fsp.rm(artifactDir, { recursive: true, force: true });
  }
});

test('old workflow capture files do not consume the current run bound', async () => {
  const artifactDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'sks-subagent-lifecycle-capture-run-bound-')
  );
  const oldRunId = 'naruto-old-run';
  const currentRunId = 'naruto-current-run';
  try {
    for (let index = 0; index < 529; index += 1) {
      await recordOfficialSubagentLifecycleCaptureFailure(
        artifactDir,
        { official_subagent_run_id: oldRunId },
        {
          hook_event_name: 'SubagentStop',
          agent_id: `old-agent-${index}`,
          workflow_run_id: oldRunId
        },
        'SubagentStop'
      );
    }
    assert.deepEqual(
      await officialSubagentLifecycleCaptureBlockers(artifactDir, currentRunId),
      []
    );
    const oldRunBlockers = await officialSubagentLifecycleCaptureBlockers(
      artifactDir,
      oldRunId
    );
    assert.ok(
      oldRunBlockers.includes('official_subagent_lifecycle_capture_failure_overflow')
    );
  } finally {
    await fsp.rm(artifactDir, { recursive: true, force: true });
  }
});

async function writeInspectableWorkflow(root: string, input: {
  missionId: string;
  runId: string;
  createdAt: string;
  openThreads?: number;
  eventOccurredAt?: string;
}) {
  const dir = path.join(root, '.sneakoscope', 'missions', input.missionId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
    schema: 'sks.subagent-plan.v1',
    workflow: 'official_codex_subagent',
    mission_id: input.missionId,
    workflow_run_id: input.runId,
    created_at: input.createdAt,
    wave_lifecycle: {
      schema: 'sks.subagent-wave-lifecycle.v1',
      owner: 'root_parent',
      workflow_run_id: input.runId,
      open_threads: input.openThreads || 0,
      updated_at: input.createdAt
    }
  }));
  if (input.eventOccurredAt) {
    await fsp.writeFile(path.join(dir, 'subagent-events.jsonl'), `${JSON.stringify({
      schema: 'sks.subagent-event.v1',
      event_name: 'SubagentStart',
      thread_id: 'idle-child',
      run_id: input.runId,
      occurred_at: input.eventOccurredAt
    })}\n`);
  }
}

test('inspect treats a never-started official workflow as inactive after idle silence', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-stale-never-started-'));
  const missionId = 'M-stale-never-started';
  const runId = 'naruto-stale-never-started';
  const createdAt = new Date(Date.now() - ACTIVE_OFFICIAL_WORKFLOW_IDLE_MS - 60_000).toISOString();
  try {
    await writeInspectableWorkflow(root, { missionId, runId, createdAt });
    const result = await inspectActiveOfficialSubagentWorkflow(root, {
      mission_id: missionId,
      official_subagent_run_id: runId
    }, 'session');
    assert.equal(result.status, 'inactive');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('inspect keeps a recently prepared official workflow active', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-fresh-never-started-'));
  const missionId = 'M-fresh-never-started';
  const runId = 'naruto-fresh-never-started';
  const createdAt = new Date().toISOString();
  try {
    await writeInspectableWorkflow(root, { missionId, runId, createdAt });
    const result = await inspectActiveOfficialSubagentWorkflow(root, {
      mission_id: missionId,
      official_subagent_run_id: runId
    }, 'session');
    assert.deepEqual(result, {
      status: 'active',
      missionId,
      workflowRunId: runId,
      openThreads: 0
    });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('inspect treats leftover open threads as inactive after idle silence', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-stale-open-threads-'));
  const missionId = 'M-stale-open-threads';
  const runId = 'naruto-stale-open-threads';
  const createdAt = new Date(Date.now() - ACTIVE_OFFICIAL_WORKFLOW_IDLE_MS - 60_000).toISOString();
  try {
    await writeInspectableWorkflow(root, {
      missionId,
      runId,
      createdAt,
      openThreads: 1,
      eventOccurredAt: createdAt
    });
    const result = await inspectActiveOfficialSubagentWorkflow(root, {
      mission_id: missionId,
      official_subagent_run_id: runId
    }, 'session');
    assert.equal(result.status, 'inactive');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});


test('official hook retry rebuilds malformed waves and clears only its own capture failure', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-lifecycle-rebuild-'));
  const missionId = 'M-rebuild';
  const runId = 'naruto-rebuild';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  const state = { mission_id: missionId, official_subagent_run_id: runId };
  const payload = { agent_id: 'real-child', workflow_run_id: runId, turn_id: 'real-turn' };
  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'subagent-plan.json'), JSON.stringify({
      schema: 'sks.subagent-plan.v1', workflow: 'official_codex_subagent',
      mission_id: missionId, workflow_run_id: runId, requested_subagents: 2,
      requested_subagents_source: 'operator',
      wave_lifecycle: { schema: 'sks.subagent-wave-lifecycle.v1', workflow_run_id: runId,
        count_policy: 'exact', requested_target_subagents: 2, target_subagents: 2,
        waves: [{ wave: 1, slices: ['screenshots', 'content'], status: 'starting' }] }
    }));
    await recordOfficialSubagentLifecycleCaptureFailure(dir, state, payload, 'SubagentStart');
    const other = await recordOfficialSubagentLifecycleCaptureFailure(
      dir, state, { ...payload, agent_id: 'other-child' }, 'SubagentStart');
    const stale = await recordAndRefreshSubagentEvidence(root, state,
      { ...payload, workflow_run_id: 'stale-run' }, 'SubagentStart');
    assert.equal(stale, null);
    assert.equal((await officialSubagentLifecycleCaptureBlockers(dir, runId)).length, 2);
    assert.ok(await recordAndRefreshSubagentEvidence(root, state, payload, 'SubagentStart'));
    assert.deepEqual(await officialSubagentLifecycleCaptureBlockers(dir, runId), [other]);
    assert.ok(await recordAndRefreshSubagentEvidence(root, state, payload, 'SubagentStop'));
    const plan = JSON.parse(await fsp.readFile(path.join(dir, 'subagent-plan.json'), 'utf8'));
    const evidence = JSON.parse(await fsp.readFile(path.join(dir, 'subagent-evidence.json'), 'utf8'));
    assert.equal(plan.wave_lifecycle.cumulative_started, 1);
    assert.equal(plan.wave_lifecycle.cumulative_completed, 1);
    assert.equal(plan.wave_lifecycle.remaining_to_start, 1);
    assert.equal(evidence.ok, false);
    assert.ok(evidence.blockers.includes(other));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
