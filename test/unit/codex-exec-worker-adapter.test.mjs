import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCodexExecWorkerAdapter } from '../../dist/core/agents/codex-exec-worker-adapter.js';

test('codex exec worker adapter dry-run records output schema and output-last-message contract', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-adapter-'));
  const adapter = await runCodexExecWorkerAdapter({
    agentRoot: root,
    workerDirRel: 'sessions/slot-001/gen-1/worker',
    agent: { id: 'codex-agent', session_id: 'codex-session', slot_id: 'slot-001', generation_index: 1, persona_id: 'executor' },
    slice: { id: 'codex-task', description: 'dry run adapter' },
    intake: { mission_id: 'M-codex-adapter' },
    fastModePolicy: { fast_mode: true, service_tier: 'fast' },
    real: false
  });
  assert.equal(adapter.processReport.backend, 'codex-exec');
  assert.equal(adapter.processReport.dry_run, true);
  assert.ok(adapter.processReport.command.includes('--output-schema'));
  assert.ok(adapter.processReport.command.includes('--output-last-message'));
  assert.ok(adapter.processReport.command.includes('--skip-git-repo-check'));
});
