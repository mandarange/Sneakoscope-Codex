import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('retention cleanup preserves learning proof and removes closed-mission scratch', async () => {
  const { enforceRetention } = await import('../../dist/core/retention.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-unit-'));
  await writeJson(path.join(root, '.sneakoscope', 'policy.json'), { retention: { max_tmp_age_hours: 0 } });
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-active' });
  await writeText(path.join(root, '.sneakoscope', 'memory', 'q2_facts', 'post-route-reflection.md'), 'lesson');
  await writeJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), { anchors: [] });

  const done = path.join(root, '.sneakoscope', 'missions', 'M-done');
  await writeJson(path.join(done, 'completion-proof.json'), { ok: true, status: 'verified_partial' });
  await writeJson(path.join(done, 'trust-report.json'), { status: 'verified_partial' });
  await writeJson(path.join(done, 'evidence-index.json'), { evidence: [] });
  await writeText(path.join(done, 'reflection.md'), 'reflection');
  await writeJson(path.join(done, 'reflection-gate.json'), { passed: true });
  await writeJson(path.join(done, 'agents', 'agent-proof-evidence.json'), { ok: true });
  await writeText(path.join(done, 'agents', 'tmp', 'worker.md'), 'scratch');
  await writeText(path.join(done, 'bus', 'event.jsonl'), '{}\n');
  await writeText(path.join(done, 'scout.stdout.log'), 'raw log');
  await writeText(path.join(done, 'sessions', 'terminal-transcript.log'), 'drop transcript');
  await writeText(path.join(done, 'agents', 'sessions', 'session-1', 'terminal-transcript.log'), 'drop agent transcript');
  await writeText(path.join(done, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'large sdk cache');
  await writeText(path.join(done, 'codex-sdk-workers', 'worker-1', 'cache.bin'), 'large sdk worker cache');

  const active = path.join(root, '.sneakoscope', 'missions', 'M-active');
  await writeText(path.join(active, 'agents', 'tmp', 'worker.md'), 'active scratch');
  await writeText(path.join(active, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'active sdk cache');
  await writeText(path.join(root, '.sneakoscope', 'tmp', 'scratch.txt'), 'tmp');
  await old(path.join(root, '.sneakoscope', 'tmp', 'scratch.txt'));

  const result = await enforceRetention(root, { policy: { max_tmp_age_hours: 0 } });
  assert.ok(result.actions.some((row) => row.action === 'remove_tmp'));
  assert.ok(result.actions.some((row) => row.action === 'remove_closed_mission_workdir' && row.rel === 'agents/tmp'));
  assert.ok(result.actions.some((row) => row.action === 'remove_closed_mission_workdir' && row.rel === 'agents/sessions'));
  assert.ok(result.actions.some((row) => row.action === 'remove_closed_mission_raw_log'));

  await assertExists(path.join(root, '.sneakoscope', 'memory', 'q2_facts', 'post-route-reflection.md'));
  await assertExists(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'));
  await assertExists(path.join(done, 'completion-proof.json'));
  await assertExists(path.join(done, 'trust-report.json'));
  await assertExists(path.join(done, 'evidence-index.json'));
  await assertExists(path.join(done, 'reflection.md'));
  await assertExists(path.join(done, 'agents', 'agent-proof-evidence.json'));
  await assertExists(path.join(active, 'agents', 'tmp', 'worker.md'));
  await assertExists(path.join(active, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));

  await assertMissing(path.join(root, '.sneakoscope', 'tmp', 'scratch.txt'));
  await assertMissing(path.join(done, 'agents', 'tmp', 'worker.md'));
  await assertMissing(path.join(done, 'bus', 'event.jsonl'));
  await assertMissing(path.join(done, 'scout.stdout.log'));
  await assertMissing(path.join(done, 'sessions', 'terminal-transcript.log'));
  await assertMissing(path.join(done, 'agents', 'sessions', 'session-1', 'terminal-transcript.log'));
  await assertMissing(path.join(done, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
  await assertMissing(path.join(done, 'codex-sdk-workers', 'worker-1', 'cache.bin'));
});

test('retention preserves durable old mission proof while compacting disposable workdirs', async () => {
  const { enforceRetention } = await import('../../dist/core/retention.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-old-unit-'));
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-active' });
  const oldMission = path.join(root, '.sneakoscope', 'missions', 'M-old');
  const originalCompletion = { schema: 'fixture.completion.v1', status: 'verified', blockers: [], payload: 'proof'.repeat(12000) };
  await writeJson(path.join(oldMission, 'completion-proof.json'), originalCompletion);
  await writeJson(path.join(oldMission, 'trust-report.json'), { status: 'verified' });
  await writeJson(path.join(oldMission, 'evidence-index.json'), { evidence: [] });
  await writeText(path.join(oldMission, 'reflection.md'), 'old reflection');
  await writeText(path.join(oldMission, 'agents', 'tmp', 'worker.md'), 'old scratch');
  await writeText(path.join(oldMission, 'scout.stdout.log'), 'old raw log');
  await writeText(path.join(oldMission, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'old sdk cache');
  await old(oldMission);

  const result = await enforceRetention(root, { policy: { max_tmp_age_hours: 999, max_mission_age_days: 0, max_missions: 999 } });
  assert.ok(result.actions.some((row) => row.action === 'retain_mission_durable_context' && row.mission === 'M-old'));
  assert.ok(result.actions.some((row) => row.action === 'compact_old_mission_context' && row.mission === 'M-old'));
  await assertExists(path.join(oldMission, 'completion-proof.json'));
  await assertMissing(path.join(oldMission, 'completion-proof.json.gz'));
  const retainedCompletion = JSON.parse(await fs.readFile(path.join(oldMission, 'completion-proof.json'), 'utf8'));
  assert.deepEqual(retainedCompletion, originalCompletion);
  await assertExists(path.join(oldMission, 'trust-report.json'));
  await assertExists(path.join(oldMission, 'evidence-index.json'));
  await assertExists(path.join(oldMission, 'reflection.md'));
  await assertExists(path.join(oldMission, 'retention-archive-manifest.json'));
  await assertMissing(path.join(oldMission, 'agents', 'tmp', 'worker.md'));
  await assertMissing(path.join(oldMission, 'scout.stdout.log'));
  await assertMissing(path.join(oldMission, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
});

test('retention budget treats an explicit zero total limit as unlimited consistently', async () => {
  const { runRetentionBudget } = await import('../../dist/core/retention/retention-budget.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-unlimited-budget-'));
  await writeJson(path.join(root, '.sneakoscope', 'policy.json'), { retention: { max_sneakoscope_bytes: 0 } });
  await writeText(path.join(root, '.sneakoscope', 'memory', 'durable.bin'), 'durable proof');
  const report = await runRetentionBudget(root);
  const total = report.budgets.find((row) => row.path === '.sneakoscope');
  assert.equal(total.max_bytes, 0);
  assert.equal(total.ok, true);
  assert.equal(report.ok, true);
  await fs.rm(root, { recursive: true, force: true });
});

test('post-route cleanup does not compact blocked active mission diagnostics', async () => {
  const { enforceRetention } = await import('../../dist/core/retention.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-blocked-unit-'));
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-blocked' });
  const blocked = path.join(root, '.sneakoscope', 'missions', 'M-blocked');
  await writeJson(path.join(blocked, 'completion-proof.json'), { status: 'blocked', blockers: ['fixture_blocker'] });
  await writeText(path.join(blocked, 'agents', 'tmp', 'worker.md'), 'diagnostic scratch');
  await writeText(path.join(blocked, 'bus', 'event.jsonl'), '{}\n');
  await writeText(path.join(blocked, 'scout.stderr.log'), 'diagnostic log');
  await writeText(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'blocked sdk cache');

  const result = await enforceRetention(root, {
    afterRoute: true,
    completedMissionId: 'M-blocked',
    policy: { max_tmp_age_hours: 999, max_mission_age_days: 999, max_missions: 999 }
  });
  assert.ok(!result.actions.some((row) => row.mission === 'M-blocked' && row.action.startsWith('remove_closed_mission')));
  await assertExists(path.join(blocked, 'agents', 'tmp', 'worker.md'));
  await assertExists(path.join(blocked, 'bus', 'event.jsonl'));
  await assertExists(path.join(blocked, 'scout.stderr.log'));
  await assertExists(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
});

test('retention removes terminal inactive runtime homes without deleting blocked diagnostics', async () => {
  const { enforceRetention } = await import('../../dist/core/retention.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-terminal-unit-'));
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-active' });
  const blocked = path.join(root, '.sneakoscope', 'missions', 'M-blocked-terminal');
  await writeJson(path.join(blocked, 'completion-proof.json'), { status: 'blocked', blockers: ['fixture_blocker'] });
  await writeJson(path.join(blocked, 'agents', 'agent-session-cleanup.json'), {
    all_sessions_terminal: true,
    terminal_session_count: 1,
    total_sessions: 1
  });
  await writeText(path.join(blocked, 'agents', 'tmp', 'worker.md'), 'diagnostic scratch');
  await writeText(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'worker-result.json'), '{"status":"blocked"}\n');
  await writeText(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'terminal sdk cache');

  const result = await enforceRetention(root, {
    policy: { max_tmp_age_hours: 999, max_mission_age_days: 999, max_missions: 999 }
  });

  assert.ok(result.actions.some((row) => row.action === 'remove_terminal_session_runtime_home' && row.mission === 'M-blocked-terminal'));
  await assertExists(path.join(blocked, 'completion-proof.json'));
  await assertExists(path.join(blocked, 'agents', 'tmp', 'worker.md'));
  await assertExists(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'worker-result.json'));
  await assertMissing(path.join(blocked, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
});

test('post-route cleanup is bounded to the completed mission', async () => {
  const { enforceRetention } = await import('../../dist/core/retention.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retention-bounded-unit-'));
  await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-active' });

  const completed = path.join(root, '.sneakoscope', 'missions', 'M-completed');
  await writeJson(path.join(completed, 'completion-proof.json'), { status: 'verified', blockers: [] });
  await writeText(path.join(completed, 'agents', 'tmp', 'worker.md'), 'completed scratch');
  await writeText(path.join(completed, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'completed sdk cache');

  const unrelated = path.join(root, '.sneakoscope', 'missions', 'M-unrelated');
  await writeJson(path.join(unrelated, 'completion-proof.json'), { status: 'verified', blockers: [] });
  await writeText(path.join(unrelated, 'agents', 'tmp', 'worker.md'), 'unrelated scratch');
  await writeText(path.join(unrelated, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'unrelated sdk cache');

  const result = await enforceRetention(root, {
    afterRoute: true,
    completedMissionId: 'M-completed',
    policy: { max_tmp_age_hours: 999, max_mission_age_days: 0, max_missions: 0 }
  });

  assert.equal(result.cleanup.bounded, true);
  assert.equal(result.cleanup.full_mission_sweep, false);
  await assertMissing(path.join(completed, 'agents', 'tmp', 'worker.md'));
  await assertMissing(path.join(completed, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
  await assertExists(path.join(unrelated, 'agents', 'tmp', 'worker.md'));
  await assertExists(path.join(unrelated, 'agents', 'sessions', 'session-1', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
});

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function old(file) {
  const past = new Date(Date.now() - 60_000);
  await fs.utimes(file, past, past);
}

async function assertExists(file) {
  await assert.doesNotReject(fs.access(file), `${file} should exist`);
}

async function assertMissing(file) {
  await assert.rejects(fs.access(file), `${file} should be removed`);
}
