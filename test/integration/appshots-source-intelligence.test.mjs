import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSourceIntelligence } from '../../dist/core/source-intelligence/source-intelligence-runner.js';

test('Source Intelligence includes Appshots evidence for visual prompts', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-appshots-si-test-'));
  const fixturePath = path.join(missionDir, 'redacted-appshot.json');
  await fs.writeFile(fixturePath, `${JSON.stringify({ fixture: true, redacted: true })}\n`);
  const evidence = await runSourceIntelligence({
    root: missionDir,
    missionDir,
    route: '$UX-Review',
    query: 'visual Appshots evidence',
    offline: true,
    context7Available: true,
    appshots: {
      sourcePaths: ['redacted-appshot.json'],
      sourceMetadata: [{
        path: 'redacted-appshot.json',
        source_type: 'codex_appshot',
        origin: 'fixture',
        operator_attached: true,
        frontmost_window: true,
        redacted: true,
        local_only: true,
        fixture: true,
        thread_id: 'thread-fixture-source-intelligence',
        attachment_id: 'attachment-fixture-source-intelligence',
        source_app: 'Codex',
        source_window: 'Fixture Appshot'
      }],
      operatorActionRecorded: true
    }
  });
  assert.equal(evidence.appshots.ok, true);
  assert.equal(evidence.proof.source_intelligence.appshots_ok, true);
  assert.equal(evidence.appshots.proof_level, 'fixture_instrumented_real');
});
