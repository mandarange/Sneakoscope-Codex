import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAppshotsCapability, discoverAppshotsThreadAttachments } from '../../dist/core/codex/appshots-detector.js';

test('Appshots detector blocks visual proof without operator action', () => {
  assert.equal(detectAppshotsCapability({ prompt: 'release metadata' }).status, 'not_required');
  assert.equal(detectAppshotsCapability({ prompt: 'visual Appshots proof' }).ok, false);
  assert.equal(detectAppshotsCapability({ prompt: 'visual Appshots proof', operatorActionRecorded: true }).ok, true);
});

test('Appshots detector requires Codex thread attachment provenance', () => {
  const discovery = discoverAppshotsThreadAttachments([
    { kind: 'appshot', attachment_id: 'att-1', source_app: 'Codex', source_window: 'Thread', local_only: true }
  ], { visualRequired: true });
  assert.equal(discovery.ok, false);
  assert.match(discovery.blockers.join('\n'), /thread_id_missing/);
});

test('Appshots detector blocks codex appshot attachments without explicit local_only', () => {
  const discovery = discoverAppshotsThreadAttachments([
    { kind: 'appshot', thread_id: 'thread-1', attachment_id: 'att-1', source_app: 'Codex', source_window: 'Thread' }
  ], { visualRequired: true });
  assert.equal(discovery.ok, false);
  assert.match(discovery.blockers.join('\n'), /not_local_only/);
});
