import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAppshotsEvidence } from '../../dist/core/source-intelligence/appshots-evidence.js';

test('Appshots evidence marks recorded visual sources as TriWiki-ready', () => {
  const fixture = appshotFixture();
  const evidence = buildAppshotsEvidence({
    root: fixture.root,
    prompt: 'visual Appshots proof',
    sourcePaths: [fixture.rel],
    sourceMetadata: [fixture.metadata],
    operatorActionRecorded: true
  });
  assert.equal(evidence.ok, true);
  assert.equal(evidence.status, 'recorded');
  assert.equal(evidence.proof_level, 'fixture_instrumented_real');
  assert.equal(evidence.triwiki_voxel_ready, true);
});

test('Appshots evidence rejects placeholder paths without verified operator metadata', () => {
  const evidence = buildAppshotsEvidence({ prompt: 'visual Appshots proof', sourcePaths: ['appshot.png'] });
  assert.equal(evidence.ok, false);
  assert.equal(evidence.status, 'operator_required');
  assert.match(evidence.blockers.join('\n'), /appshots_source_missing|appshots_operator_action_missing/);
});

function appshotFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-appshot-evidence-'));
  const file = path.join(root, 'redacted-appshot.json');
  fs.writeFileSync(file, `${JSON.stringify({ fixture: true, redacted: true })}\n`);
  const rel = 'redacted-appshot.json';
  return {
    root,
    rel,
    metadata: {
      path: rel,
      source_type: 'codex_appshot',
      origin: 'fixture',
      operator_attached: true,
      frontmost_window: true,
      redacted: true,
      local_only: true,
      fixture: true
    }
  };
}
