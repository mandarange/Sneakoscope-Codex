import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanupLegacyGlobalSksHooks } from '../legacy-global-hook-cleanup.js';

test('legacy global SKS hooks are removed only when project-local equivalents exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-cleanup-root-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-cleanup-home-'));
  try {
    await fs.mkdir(path.join(root, '.codex'), { recursive: true });
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'hooks.json'), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node ./dist/bin/sks.js hook user-prompt-submit' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'node ./dist/bin/sks.js hook stop' }] }]
      }
    }));
    await fs.writeFile(path.join(home, '.codex', 'hooks.json'), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [
          { type: 'command', command: '/opt/homebrew/bin/sks hook user-prompt-submit' },
          { type: 'command', command: 'custom-user-hook' }
        ] }],
        Stop: [{ hooks: [{ type: 'command', command: 'sks hook stop' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'sks hook session-start' }] }]
      }
    }));

    const dry = await cleanupLegacyGlobalSksHooks({ root, home, apply: false, reportPath: null });
    assert.equal(dry.duplicate_global_hooks.length, 2);
    assert.equal(dry.removed_count, 0);

    const applied = await cleanupLegacyGlobalSksHooks({ root, home, apply: true, reportPath: null });
    assert.equal(applied.ok, true);
    assert.equal(applied.removed_count, 2);
    assert.equal(applied.requires_new_task, true);
    assert.ok(applied.backup_path);
    const after = JSON.parse(await fs.readFile(path.join(home, '.codex', 'hooks.json'), 'utf8'));
    const text = JSON.stringify(after);
    assert.ok(text.includes('custom-user-hook'));
    assert.ok(text.includes('sks hook session-start'), 'global hook without a project equivalent must be preserved');
    assert.ok(!text.includes('sks hook user-prompt-submit'));
    assert.ok(!text.includes('sks hook stop'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('global security hooks survive noncanonical or matcher-mismatched project commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-cleanup-adversarial-root-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hook-cleanup-adversarial-home-'));
  try {
    await fs.mkdir(path.join(root, '.codex'), { recursive: true });
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex', 'hooks.json'), JSON.stringify({ hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo attacker; node ./dist/bin/sks.js hook pre-tool' }] }],
      PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node ./dist/bin/sks.js hook permission-request' }] }]
    } }));
    await fs.writeFile(path.join(home, '.codex', 'hooks.json'), JSON.stringify({ hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'sks hook pre-tool' }] }],
      PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: 'sks hook permission-request' }] }]
    } }));

    const result = await cleanupLegacyGlobalSksHooks({ root, home, apply: true, reportPath: null });
    assert.equal(result.removed_count, 0);
    const after = await fs.readFile(path.join(home, '.codex', 'hooks.json'), 'utf8');
    assert.match(after, /sks hook pre-tool/);
    assert.match(after, /sks hook permission-request/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});
