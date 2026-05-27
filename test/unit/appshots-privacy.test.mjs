import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAppshotsEvidence } from '../../dist/core/source-intelligence/appshots-evidence.js';

test('Appshots privacy safety remains explicit', () => {
  const fixture = appshotFixture({ redacted: true, localOnly: true });
  const evidence = buildAppshotsEvidence({
    root: fixture.root,
    prompt: 'visual Appshots proof',
    sourcePaths: [fixture.rel],
    sourceMetadata: [fixture.metadata],
    operatorActionRecorded: true
  });
  assert.equal(evidence.privacy_safety_ok, true);
  assert.equal(evidence.operator_policy.privacy_safety.redact_sensitive_text, true);
});

test('Appshots privacy safety blocks unredacted visual sources', () => {
  const fixture = appshotFixture({ redacted: false, localOnly: true });
  const evidence = buildAppshotsEvidence({
    root: fixture.root,
    prompt: 'visual Appshots proof',
    sourcePaths: [fixture.rel],
    sourceMetadata: [fixture.metadata],
    operatorActionRecorded: true
  });
  assert.equal(evidence.ok, false);
  assert.equal(evidence.privacy_safety_ok, false);
  assert.match(evidence.blockers.join('\n'), /appshots_redaction_unverified/);
});

function appshotFixture({ redacted, localOnly }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-appshot-privacy-'));
  const file = path.join(root, 'redacted-appshot.json');
  fs.writeFileSync(file, `${JSON.stringify({ fixture: true, redacted })}\n`);
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
      redacted,
      local_only: localOnly,
      fixture: true
    }
  };
}
