import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAppshotsCapability } from '../../dist/core/codex/appshots-detector.js';

test('Codex thread Appshot attachment can satisfy visual resume discovery', () => {
  const capability = detectAppshotsCapability({
    prompt: 'resume visual Appshots proof',
    threadAttachments: [{
      kind: 'appshot',
      thread_id: 'thread-1',
      attachment_id: 'att-1',
      source_app: 'Codex',
      source_window: 'Thread',
      local_only: true
    }]
  });
  assert.equal(capability.ok, true);
  assert.equal(capability.operator_action_required, false);
  assert.equal(capability.thread_attachment_discovery.appshot_attachment_count, 1);
});
