import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('project update migration receipt cleans disposable closed-mission runtime sessions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-retention-unit-'));
  const globalRoot = path.join(root, 'global');
  const previousGlobalRoot = process.env.SKS_GLOBAL_ROOT;
  process.env.SKS_GLOBAL_ROOT = globalRoot;
  try {
    const { writeProjectUpdateMigrationReceipt } = await import('../../dist/core/update/update-migration-state.js');
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-done');
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await writeJson(path.join(mission, 'agents', 'agent-proof-evidence.json'), { ok: true });
    await writeText(path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'large sdk cache');
    const terminal = path.join(root, '.sneakoscope', 'missions', 'M-blocked-terminal');
    await writeJson(path.join(terminal, 'completion-proof.json'), { status: 'blocked', blockers: ['fixture_blocker'] });
    await writeJson(path.join(terminal, 'agents', 'agent-session-cleanup.json'), { all_sessions_terminal: true, terminal_session_count: 1, total_sessions: 1 });
    await writeText(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'worker-result.json'), '{"status":"blocked"}\n');
    await writeText(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'), 'terminal sdk cache');

    const receipt = await writeProjectUpdateMigrationReceipt({
      root,
      source: 'unit-update-retention',
      blockers: [],
      warnings: []
    });

    assert.equal(receipt.retention_cleanup?.status, 'completed');
    assert.ok((receipt.retention_cleanup?.action_count || 0) > 0);
    await assertExists(path.join(mission, 'completion-proof.json'));
    await assertExists(path.join(mission, 'agents', 'agent-proof-evidence.json'));
    await assertMissing(path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
    await assertExists(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'worker-result.json'));
    await assertMissing(path.join(terminal, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home', 'codex', 'cache.bin'));
  } finally {
    if (previousGlobalRoot === undefined) delete process.env.SKS_GLOBAL_ROOT;
    else process.env.SKS_GLOBAL_ROOT = previousGlobalRoot;
  }
});

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function assertExists(file) {
  await assert.doesNotReject(fs.access(file), `${file} should exist`);
}

async function assertMissing(file) {
  await assert.rejects(fs.access(file), `${file} should be removed`);
}
