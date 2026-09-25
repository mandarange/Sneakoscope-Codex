import assert from 'node:assert/strict';
import test from 'node:test';
import { managedHookEventNames, mergeManagedHooksJson, pruneRetiredSksHookEvents } from '../init.js';
import { resetVerificationProfileCache } from '../verification-profile.js';

async function withProfile<T>(profile: 'essential' | 'strict', run: () => T | Promise<T>): Promise<T> {
  const prior = process.env.SKS_VERIFICATION_PROFILE;
  process.env.SKS_VERIFICATION_PROFILE = profile;
  resetVerificationProfileCache();
  try { return await run(); }
  finally {
    if (prior === undefined) delete process.env.SKS_VERIFICATION_PROFILE; else process.env.SKS_VERIFICATION_PROFILE = prior;
    resetVerificationProfileCache();
  }
}

test('essential installs no PostToolUse hook; strict keeps all ten events', async () => {
  const essential = await withProfile('essential', () => managedHookEventNames());
  assert.equal(essential.includes('PostToolUse'), false);
  assert.ok(essential.includes('PreToolUse'));
  assert.ok(essential.includes('Stop'));
  assert.ok(essential.includes('SubagentStart'), 'subagent lifecycle hooks only fire during fan-out and stay');
  const strict = await withProfile('strict', () => managedHookEventNames());
  assert.equal(strict.includes('PostToolUse'), true);
  assert.equal(strict.length, 10);
});

test('merging into a legacy hooks.json removes the SKS PostToolUse entry but keeps a user-authored one', async () => {
  const legacy = JSON.stringify({
    hooks: {
      PostToolUse: [
        { matcher: '*', hooks: [{ type: 'command', command: 'sks hook post-tool', statusMessage: 'SKS recording tool evidence' }] },
        { matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-audit-tool --log' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: 'sks hook stop', statusMessage: 'SKS checking done gate' }] }],
    },
  });
  const merged = JSON.parse(await withProfile('essential', () => mergeManagedHooksJson(legacy, 'sks')));
  const postTool = merged.hooks.PostToolUse;
  assert.equal(postTool.length, 1, 'only the user-authored PostToolUse entry survives');
  assert.equal(postTool[0].hooks[0].command, 'my-own-audit-tool --log');
  assert.ok(merged.hooks.PreToolUse.some((entry: any) => entry.hooks.some((hook: any) => hook.command === 'sks hook pre-tool')));
  assert.equal(merged.hooks.Stop.length, 1);

  // A legacy file with ONLY the SKS PostToolUse entry loses the event entirely.
  const sksOnly = JSON.stringify({ hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'sks hook post-tool' }] }] } });
  const cleaned = JSON.parse(await withProfile('essential', () => mergeManagedHooksJson(sksOnly, 'sks')));
  assert.equal('PostToolUse' in cleaned.hooks, false);

  const strictMerged = JSON.parse(await withProfile('strict', () => mergeManagedHooksJson(sksOnly, 'sks')));
  assert.equal(strictMerged.hooks.PostToolUse.some((entry: any) => entry.hooks.some((hook: any) => hook.command === 'sks hook post-tool')), true);
});

test('update prune drops only SKS entries under events the profile no longer installs', async () => {
  const legacy = JSON.stringify({
    custom: { keep: true },
    hooks: {
      PostToolUse: [
        { matcher: '*', hooks: [{ type: 'command', command: '/opt/sks/bin/sks.js hook post-tool', statusMessage: 'SKS recording tool evidence' }] },
        { matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-audit-tool --log' }] },
      ],
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: '/opt/sks/bin/sks.js hook pre-tool' }] }],
    },
  });
  const installed = await withProfile('essential', () => managedHookEventNames());
  const pruned = pruneRetiredSksHookEvents(legacy, installed);
  assert.deepEqual(pruned.removed, ['PostToolUse']);
  const next = JSON.parse(pruned.text);
  assert.deepEqual(next.custom, { keep: true });
  assert.deepEqual(next.hooks.PostToolUse, [{ matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-audit-tool --log' }] }]);
  // Installed events keep their exact SKS command; the prune never rewrites prefixes.
  assert.equal(next.hooks.PreToolUse[0].hooks[0].command, '/opt/sks/bin/sks.js hook pre-tool');

  const current = pruneRetiredSksHookEvents(pruned.text, installed);
  assert.deepEqual(current.removed, []);
  assert.equal(current.text, pruned.text);
  const strictInstalled = await withProfile('strict', () => managedHookEventNames());
  assert.deepEqual(pruneRetiredSksHookEvents(legacy, strictInstalled).removed, []);
  assert.deepEqual(pruneRetiredSksHookEvents('not json', installed), { text: 'not json', removed: [] });
});
