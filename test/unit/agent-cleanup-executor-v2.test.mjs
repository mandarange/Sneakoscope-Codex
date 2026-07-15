import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('agent cleanup executor v2 records process-tree dry-run evidence', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-v2-unit-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-test');
  const agentRoot = path.join(missionDir, 'agents');
  await fs.mkdir(path.join(agentRoot, 'sessions', 'slot-001'), { recursive: true });
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: { closed: { session_id: 'closed-session', status: 'closed' } } }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ root_hash: 'cleanupv2' }));
  await fs.writeFile(path.join(agentRoot, 'sessions', 'slot-001', 'agent-process-report.json'), JSON.stringify({
    session_id: 'closed-session',
    pid: process.pid,
    exit_code: null,
    project_hash: 'cleanupv2'
  }));
  const proof = await mod.runAgentCleanupExecutor({ missionDir, dryRun: true });
  assert.equal(proof.schema, 'sks.agent-cleanup-proof.v2');
  assert.ok(proof.process_trees.some((row) => row.target === String(process.pid)));
  assert.ok(proof.sigterm_sent.length === 0);
  assert.equal(proof.session_cleanup.all_sessions_terminal, true);
  const sessionCleanup = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-session-cleanup.json'), 'utf8'));
  assert.equal(sessionCleanup.total_sessions, 1);
  assert.equal(sessionCleanup.all_sessions_terminal, true);
});

test('agent cleanup rejects traversal and missing namespace hashes before deletion', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-v2-traversal-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-test');
  const agentRoot = path.join(missionDir, 'agents');
  const victim = path.join(root, 'victim');
  await fs.mkdir(victim, { recursive: true });
  await fs.writeFile(path.join(victim, 'keep.txt'), 'preserve\n');
  await fs.mkdir(agentRoot, { recursive: true });
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: {} }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({
    root_hash: 'hash123',
    orphan_temp_dirs: [`${root}${path.sep}hash123${path.sep}..${path.sep}victim`]
  }));

  const traversal = await mod.runAgentCleanupExecutor({ missionDir, apply: true });
  assert.equal(await fs.readFile(path.join(victim, 'keep.txt'), 'utf8'), 'preserve\n');
  assert.ok(traversal.skipped_foreign_namespace.some((entry) => entry.includes('..')));

  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ orphan_temp_dirs: [victim] }));
  const missingHash = await mod.runAgentCleanupExecutor({ missionDir, apply: true });
  assert.equal(await fs.readFile(path.join(victim, 'keep.txt'), 'utf8'), 'preserve\n');
  assert.ok(missingHash.skipped_foreign_namespace.includes(victim));
  await fs.rm(root, { recursive: true, force: true });
});

test('completed sessions are terminal in the canonical cleanup report', async () => {
  const { writeAgentCleanupReport } = await import('../../dist/core/agents/agent-cleanup.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-completed-'));
  await fs.writeFile(path.join(root, 'agent-sessions.json'), JSON.stringify({
    sessions: { done: { session_id: 'done', status: 'completed', opened_at: new Date().toISOString() } }
  }));
  const report = await writeAgentCleanupReport(root);
  assert.equal(report.terminal_session_count, 1);
  assert.equal(report.all_sessions_terminal, true);
  await fs.rm(root, { recursive: true, force: true });
});

test('stale nonterminal session without a process is planned in dry-run and atomically terminalized on apply', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-stale-session-'));
  const missionId = 'M-stale-session';
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  const agentRoot = path.join(missionDir, 'agents');
  const artifactRel = path.join('sessions', 'slot-001', 'gen-5');
  const artifactDir = path.join(agentRoot, artifactRel);
  const sessionId = 'agent_slot-001-gen_5-M-stale-session-root1234';
  const old = new Date(Date.now() - 60_000).toISOString();
  const session = {
    schema: 'sks.agent-session-record.v1',
    agent_id: 'slot-001',
    slot_id: 'slot-001',
    generation_index: 5,
    session_artifact_dir: artifactRel,
    session_id: sessionId,
    session_key: sessionId,
    status: 'running',
    opened_at: old,
    heartbeat_at: old
  };
  const generation = {
    schema: 'sks.agent-session-generation.v1',
    session_id: sessionId,
    slot_id: 'slot-001',
    generation_index: 5,
    task_id: 'NW-000005',
    persona_id: 'naruto_worker_001',
    terminal_session_id: `${sessionId}-terminal`,
    started_at: old,
    closed_at: null,
    status: 'running',
    result_artifact_path: null,
    terminal_close_report_path: null,
    artifact_dir: artifactRel,
    source_intelligence_refs: { ok: true },
    goal_mode_ref: { ok: true },
    immutable_after_close: true
  };
  const terminal = {
    schema: 'sks.agent-terminal-session.v1',
    agent_id: 'slot-001',
    session_id: sessionId,
    slot_id: 'slot-001',
    generation_index: 5,
    terminal_session_id: `${sessionId}-terminal`,
    terminal_backend: 'codex-sdk',
    terminal_transcript_path: path.join(artifactRel, 'terminal-transcript.log'),
    terminal_stdout_path: path.join(artifactRel, 'terminal-stdout.log'),
    terminal_stderr_path: path.join(artifactRel, 'terminal-stderr.log'),
    terminal_started_at: old,
    terminal_closed_at: null,
    terminal_exit_code: null,
    real: true,
    status: 'running'
  };
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ mission_id: missionId, root_hash: 'root1234' }));
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ schema: 'sks.agent-sessions.v1', mission_id: missionId, sessions: { [sessionId]: session } }));
  await fs.writeFile(path.join(agentRoot, 'sessions', `${sessionId}.json`), JSON.stringify(session));
  await fs.writeFile(path.join(artifactDir, 'agent-session-record.json'), JSON.stringify(session));
  await fs.writeFile(path.join(artifactDir, 'agent-terminal-session.json'), JSON.stringify(terminal));
  await fs.writeFile(path.join(artifactDir, 'agent-session-generation.json'), JSON.stringify(generation));
  await fs.writeFile(path.join(agentRoot, 'agent-session-generations.json'), JSON.stringify({ schema: 'sks.agent-session-generations.v1', generation_count: 1, generations: { [sessionId]: generation } }));

  const stateFiles = [
    path.join(agentRoot, 'agent-sessions.json'),
    path.join(agentRoot, 'sessions', `${sessionId}.json`),
    path.join(artifactDir, 'agent-session-record.json'),
    path.join(artifactDir, 'agent-terminal-session.json'),
    path.join(artifactDir, 'agent-session-generation.json'),
    path.join(agentRoot, 'agent-session-generations.json')
  ];
  const beforeDryRun = await Promise.all(stateFiles.map((file) => fs.readFile(file, 'utf8')));
  const dryRun = await mod.runAgentCleanupExecutor({ missionDir, missionId, dryRun: true, staleMs: 0 });
  assert.deepEqual(dryRun.stale_sessions_terminalization_planned, [sessionId]);
  assert.deepEqual(dryRun.stale_sessions_terminalized, []);
  assert.deepEqual(await Promise.all(stateFiles.map((file) => fs.readFile(file, 'utf8'))), beforeDryRun);

  const applied = await mod.runAgentCleanupExecutor({ missionDir, missionId, apply: true, staleMs: 0 });
  assert.deepEqual(applied.stale_sessions_terminalized, [sessionId]);
  const registry = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-sessions.json'), 'utf8'));
  const shard = JSON.parse(await fs.readFile(path.join(agentRoot, 'sessions', `${sessionId}.json`), 'utf8'));
  const record = JSON.parse(await fs.readFile(path.join(artifactDir, 'agent-session-record.json'), 'utf8'));
  const terminalAfter = JSON.parse(await fs.readFile(path.join(artifactDir, 'agent-terminal-session.json'), 'utf8'));
  const closeReport = JSON.parse(await fs.readFile(path.join(artifactDir, 'agent-terminal-close-report.json'), 'utf8'));
  const generationAfter = JSON.parse(await fs.readFile(path.join(artifactDir, 'agent-session-generation.json'), 'utf8'));
  const generationRegistry = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-session-generations.json'), 'utf8'));
  const cleanup = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-session-cleanup.json'), 'utf8'));
  assert.equal(registry.sessions[sessionId].status, 'timed_out');
  assert.equal(shard.status, 'timed_out');
  assert.equal(record.status, 'timed_out');
  assert.equal(record.terminal_reason, 'stale_nonterminal_session_without_live_process');
  assert.equal(terminalAfter.status, 'closed');
  assert.equal(terminalAfter.close_status, 'timed_out');
  assert.equal(closeReport.ok, true);
  assert.equal(closeReport.status, 'timed_out');
  assert.equal(generationAfter.status, 'blocked');
  assert.equal(generationRegistry.generations[sessionId].status, 'blocked');
  assert.equal(cleanup.all_sessions_terminal, true);
  assert.ok(registry.sessions[sessionId].closed_at);
  assert.ok(await fs.readFile(path.join(artifactDir, 'agent-stale-session-terminalization.json'), 'utf8'));
  await fs.rm(root, { recursive: true, force: true });
});

test('stale cleanup never terminalizes a live PID or a foreign process report', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-stale-safety-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-stale-safety');
  const agentRoot = path.join(missionDir, 'agents');
  const old = new Date(Date.now() - 60_000).toISOString();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const sessions = {
    live: {
      session_id: 'live-session',
      session_key: 'live-session',
      agent_id: 'live',
      session_artifact_dir: 'sessions/live/gen-1',
      status: 'running',
      opened_at: old,
      heartbeat_at: old
    },
    foreign: {
      session_id: 'foreign-session',
      session_key: 'foreign-session',
      agent_id: 'foreign',
      session_artifact_dir: 'sessions/foreign/gen-1',
      status: 'running',
      opened_at: old,
      heartbeat_at: old
    }
  };
  try {
    await fs.mkdir(path.join(agentRoot, 'sessions', 'live', 'gen-1'), { recursive: true });
    await fs.mkdir(path.join(agentRoot, 'sessions', 'foreign', 'gen-1'), { recursive: true });
    await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ root_hash: 'safe1234' }));
    await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ schema: 'sks.agent-sessions.v1', sessions }));
    await fs.writeFile(path.join(agentRoot, 'sessions', 'live', 'gen-1', 'agent-process-report.json'), JSON.stringify({ session_id: 'live-session', pid: child.pid, exit_code: null, project_hash: 'safe1234' }));
    await fs.writeFile(path.join(agentRoot, 'sessions', 'foreign', 'gen-1', 'agent-process-report.json'), JSON.stringify({ session_id: 'foreign-session', pid: 2147483647, exit_code: null, project_hash: 'other1234' }));
    const proof = await mod.runAgentCleanupExecutor({ missionDir, apply: true, staleMs: 0 });
    assert.ok(proof.skipped_active_sessions.includes('live-session'));
    assert.ok(proof.skipped_foreign_namespace.includes('foreign-session'));
    assert.doesNotThrow(() => process.kill(child.pid, 0));
    const registry = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-sessions.json'), 'utf8'));
    assert.equal(registry.sessions.live.status, 'running');
    assert.equal(registry.sessions.foreign.status, 'running');
  } finally {
    child.kill('SIGKILL');
    await fs.rm(root, { recursive: true, force: true });
  }
});
