import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entriesFromHooksFile } from '../../dist/core/codex-hooks/codex-hook-trust-state.js';

test('hook trust state classifies managed trusted modified and untrusted hooks', () => {
  const hooks = {
    hooks: {
      SubagentStop: [{ hooks: [{ type: 'command', command: 'sks hook subagent-stop', timeout: 30 }] }]
    }
  };
  const managed = entriesFromHooksFile('/repo/.codex/hooks.json', 'project', hooks, {}, true)[0];
  assert.equal(managed.trust_status, 'Managed');
  const trusted = entriesFromHooksFile('/repo/.codex/hooks.json', 'project', hooks, { [managed.key]: managed.current_hash }, false)[0];
  assert.equal(trusted.trust_status, 'Trusted');
  const modified = entriesFromHooksFile('/repo/.codex/hooks.json', 'project', hooks, { [managed.key]: 'sha256:bad' }, false)[0];
  assert.equal(modified.trust_status, 'Modified');
  const untrusted = entriesFromHooksFile('/repo/.codex/hooks.json', 'project', hooks, {}, false)[0];
  assert.equal(untrusted.trust_status, 'Untrusted');
  assert.ok(untrusted.repair_action.includes('sks hooks trust-fix'));
});
