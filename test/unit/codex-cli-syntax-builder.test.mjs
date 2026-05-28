import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexExecArgs } from '../../dist/core/codex/codex-cli-syntax-builder.js';

test('codex exec args include official fast service tier config', () => {
  const args = buildCodexExecArgs({
    json: true,
    outputSchema: '/tmp/agent-result.schema.json',
    outputLastMessage: '/tmp/agent-result.json',
    ephemeral: true,
    skipGitRepoCheck: true,
    profile: 'agent-fast',
    ignoreRules: true,
    sandbox: 'workspace-write',
    serviceTier: 'fast',
    prompt: 'complete the worker task'
  });

  assert.equal(args[0], 'exec');
  assert.equal(args.at(-1), 'complete the worker task');
  assert.ok(args.includes('--json'));
  assert.equal(args[args.indexOf('--profile') + 1], 'agent-fast');
  assert.equal(args.includes('--ignore-user-config'), false);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(args.includes('-c'));
  assert.ok(args.includes('service_tier=fast'));
});

test('codex exec args reject unsupported mode combinations', () => {
  assert.throws(
    () => buildCodexExecArgs({ prompt: 'x', profile: 'p', ignoreUserConfig: true }),
    /cannot combine --profile/
  );
  assert.throws(
    () => buildCodexExecArgs({ prompt: 'x', danger: true }),
    /allowDanger=true/
  );
  assert.throws(
    () => buildCodexExecArgs({ prompt: 'x', fullAuto: true, danger: true, allowDanger: true }),
    /cannot combine full auto/
  );
});
