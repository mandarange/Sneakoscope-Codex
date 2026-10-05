import assert from 'node:assert/strict';
import test from 'node:test';
import { ESSENTIAL_POST_TOOL_MATCHER, managedHookEventNames, mergeManagedHooksJson, pruneRetiredSksHookEvents } from '../init.js';
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

test('both profiles install all eight events; essential scopes PostToolUse to the safety tools (none for PreCompact/PostCompact)', async () => {
  const essential = await withProfile('essential', () => managedHookEventNames());
  const strict = await withProfile('strict', () => managedHookEventNames());
  assert.deepEqual(essential, strict);
  assert.equal(strict.length, 8);
  assert.ok(essential.includes('PostToolUse') && essential.includes('SubagentStart') && essential.includes('Stop'));
  assert.equal(strict.includes('PreCompact') || strict.includes('PostCompact'), false);

  const matcher = new RegExp(ESSENTIAL_POST_TOOL_MATCHER);
  for (const tool of ['mcp__acas-tools__spreadsheet_update', 'mcp__acas_tools__html_to_pdf', 'mcp__supabase__execute_sql', 'mcp__supabase__apply_migration', 'mcp__my-postgres__query']) {
    assert.ok(matcher.test(tool), tool);
  }
  for (const tool of ['Bash', 'shell', 'exec_command', 'apply_patch', 'Read', 'mcp__filesystem__write_file', 'mcp__github__get_file_contents']) {
    assert.equal(matcher.test(tool), false, tool);
  }
});

test('merging rewrites the SKS PostToolUse entry to the profile matcher and keeps a user-authored one', async () => {
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
  const sksEntries = postTool.filter((entry: any) => entry.hooks.some((hook: any) => hook.command === 'sks hook post-tool'));
  assert.deepEqual(sksEntries.map((entry: any) => entry.matcher), [ESSENTIAL_POST_TOOL_MATCHER], 'essential keeps one scoped SKS entry, not the per-call one');
  assert.ok(postTool.some((entry: any) => entry.hooks[0].command === 'my-own-audit-tool --log'), 'the user-authored entry survives');
  assert.ok(merged.hooks.PreToolUse.some((entry: any) => entry.hooks.some((hook: any) => hook.command === 'sks hook pre-tool')));
  assert.equal(merged.hooks.Stop.length, 1);

  const sksOnly = JSON.stringify({ hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'sks hook post-tool' }] }] } });
  const strictMerged = JSON.parse(await withProfile('strict', () => mergeManagedHooksJson(sksOnly, 'sks')));
  assert.deepEqual(strictMerged.hooks.PostToolUse.map((entry: any) => entry.matcher), ['*']);
});

test('update prune drops only SKS entries under events SKS no longer installs', async () => {
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
  // Every SKS event is installed in both profiles now, so nothing is pruned;
  // an event SKS no longer installs (a retired one) still loses only SKS entries.
  const installed = await withProfile('essential', () => managedHookEventNames());
  assert.deepEqual(pruneRetiredSksHookEvents(legacy, installed).removed, []);
  const withoutPostTool = installed.filter((event) => event !== 'PostToolUse');
  const pruned = pruneRetiredSksHookEvents(legacy, withoutPostTool);
  assert.deepEqual(pruned.removed, ['PostToolUse']);
  const next = JSON.parse(pruned.text);
  assert.deepEqual(next.custom, { keep: true });
  assert.deepEqual(next.hooks.PostToolUse, [{ matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-audit-tool --log' }] }]);
  // Installed events keep their exact SKS command; the prune never rewrites prefixes.
  assert.equal(next.hooks.PreToolUse[0].hooks[0].command, '/opt/sks/bin/sks.js hook pre-tool');

  const current = pruneRetiredSksHookEvents(pruned.text, withoutPostTool);
  assert.deepEqual(current.removed, []);
  assert.equal(current.text, pruned.text);
  assert.deepEqual(pruneRetiredSksHookEvents('not json', installed), { text: 'not json', removed: [] });
});
