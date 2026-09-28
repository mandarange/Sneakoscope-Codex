import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sksHookHandlerRefs } from '../../codex-hooks/sks-hook-entries.js';
import { ensureSksStateGitExcluded, hookLayerDeferral, hookLayerFromArgs } from '../hook-layer.js';

async function withLayers(run: (input: { env: NodeJS.ProcessEnv; codexHome: string; root: string }) => Promise<void>) {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-layer-')));
  const codexHome = path.join(base, 'home', '.codex');
  const root = path.join(base, 'project');
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.mkdir(path.join(root, '.codex'), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: path.dirname(codexHome) };
  delete env.CODEX_HOME;
  try {
    await run({ env, codexHome, root });
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
}

async function writeHooksWithTrust(file: string, command: string, configPath: string, trusted: boolean) {
  const hooks = { hooks: { Stop: [{ hooks: [{ type: 'command', command }] }] } };
  await fsp.writeFile(file, JSON.stringify(hooks));
  if (!trusted) return;
  const [ref] = sksHookHandlerRefs(hooks, file);
  await fsp.appendFile(configPath, `\n[hooks.state."${ref!.key}"]\ntrusted_hash = "${ref!.hash}"\n`);
}

test('the scope flag marks the user-level hook', () => {
  assert.equal(hookLayerFromArgs(['--scope=user']), 'user');
  assert.equal(hookLayerFromArgs([]), 'project');
});

test('the user-level hook steps aside only for a trusted project pinning its own trusted SKS hook', async () => {
  await withLayers(async ({ env, codexHome, root }) => {
    const config = path.join(codexHome, 'config.toml');
    await fsp.writeFile(config, '');
    await writeHooksWithTrust(path.join(root, '.codex', 'hooks.json'), 'node ./dist/bin/sks.js hook stop', config, true);
    const input = { layer: 'user' as const, hookName: 'stop', root, runningPackageRoot: '/global/sneakoscope', env };
    assert.deepEqual(await hookLayerDeferral(input), { defer: false, reason: 'project_untrusted' });
    await fsp.appendFile(config, `\n[projects."${root}"]\ntrust_level = "trusted"\n`);
    assert.deepEqual(await hookLayerDeferral(input), { defer: true, reason: 'project_pinned_sks_hook_active' });
    assert.equal((await hookLayerDeferral({ ...input, hookName: 'pre-tool' })).defer, false, 'other events stay with the user layer');
  });
});

test('a project hook running the global CLI steps aside for an active user-level hook', async () => {
  await withLayers(async ({ env, codexHome, root }) => {
    const config = path.join(codexHome, 'config.toml');
    await fsp.writeFile(config, '');
    const input = { layer: 'project' as const, hookName: 'stop', root, runningPackageRoot: '/global/sneakoscope', env };
    assert.equal((await hookLayerDeferral(input)).defer, false, 'no user-level hook yet');
    await writeHooksWithTrust(path.join(codexHome, 'hooks.json'), "'/x/sks-hook' hook stop --scope=user", config, true);
    assert.deepEqual(await hookLayerDeferral(input), { defer: true, reason: 'user_sks_hook_active' });
    assert.deepEqual(await hookLayerDeferral({ ...input, runningPackageRoot: root }), { defer: false, reason: 'project_pinned_owner' });
  });
});

test('an untrusted user-level hook never makes the project hook step aside', async () => {
  await withLayers(async ({ env, codexHome, root }) => {
    const config = path.join(codexHome, 'config.toml');
    await fsp.writeFile(config, '');
    await writeHooksWithTrust(path.join(codexHome, 'hooks.json'), "'/x/sks-hook' hook stop --scope=user", config, false);
    assert.equal((await hookLayerDeferral({ layer: 'project', hookName: 'stop', root, runningPackageRoot: '/g', env })).defer, false);
  });
});

test('SKS state is kept out of git through info/exclude, once', async () => {
  await withLayers(async ({ root }) => {
    assert.equal(await ensureSksStateGitExcluded(root), 'no_state');
    await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
    assert.equal(await ensureSksStateGitExcluded(root), 'no_git');
    await fsp.mkdir(path.join(root, '.git', 'info'), { recursive: true });
    await fsp.writeFile(path.join(root, '.git', 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude\n');
    assert.equal(await ensureSksStateGitExcluded(root), 'excluded');
    assert.match(await fsp.readFile(path.join(root, '.git', 'info', 'exclude'), 'utf8'), /^\.sneakoscope\/$/m);
    assert.equal(await ensureSksStateGitExcluded(root), 'checked');
  });
});

test('a worktree writes the exclude into the common git dir', async () => {
  await withLayers(async ({ root }) => {
    const main = path.join(path.dirname(root), 'main');
    const worktreeGitDir = path.join(main, '.git', 'worktrees', 'project');
    await fsp.mkdir(worktreeGitDir, { recursive: true });
    await fsp.writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n');
    await fsp.writeFile(path.join(root, '.git'), `gitdir: ${worktreeGitDir}\n`);
    await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
    assert.equal(await ensureSksStateGitExcluded(root), 'excluded');
    assert.match(await fsp.readFile(path.join(main, '.git', 'info', 'exclude'), 'utf8'), /^\.sneakoscope\/$/m);
  });
});

test('a .gitignore that already ignores SKS state is left alone', async () => {
  await withLayers(async ({ root }) => {
    await fsp.mkdir(path.join(root, '.git'), { recursive: true });
    await fsp.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
    await fsp.writeFile(path.join(root, '.gitignore'), 'node_modules/\n.sneakoscope/\n');
    assert.equal(await ensureSksStateGitExcluded(root), 'already_ignored');
    await assert.rejects(fsp.stat(path.join(root, '.git', 'info', 'exclude')));
  });
});
