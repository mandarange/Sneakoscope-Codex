// First import: installs write $HOME/.codex, which must never be the real one.
import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { agentsBlockText } from '../../init.js';
import { codexCommandHookCurrentHash } from '../codex-hook-hash.js';
import {
  GLOBAL_AGENTS_MARKER,
  installGlobalSksHooks,
  readGlobalSksHookState,
  removeGlobalSksHookArtifacts,
  resolveGlobalHookTarget,
  stableNodePath,
  type GlobalHookTarget
} from '../codex-global-hooks.js';
import { codexHooksListBinaryCandidates, listCodexHooks, type CodexHooksListResult } from '../codex-hooks-list.js';

const TARGET: GlobalHookTarget = { node: '/opt/node/bin/node', entry: '/opt/sks/dist/bin/sks.js', source: 'installed_package' };

async function withHome(run: (env: NodeJS.ProcessEnv, codexHome: string) => Promise<void>) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-global-hooks-'));
  const codexHome = path.join(home, '.codex');
  await fsp.mkdir(codexHome, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'), SKS_TEST_ALLOW_GLOBAL_HOOKS: '1' };
  delete env.CODEX_HOME;
  try {
    await run(env, codexHome);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
}

test('the trust hash is the one Codex reports from hooks/list (0.153.4, 0.157.1, 0.158)', () => {
  assert.equal(codexCommandHookCurrentHash({ event: 'UserPromptSubmit', command: "'/x y/sks-hook' user-prompt-submit", statusMessage: 'SKS routing prompt and context' }),
    'sha256:1be9ed27d5c7e864a305f61ffa3ae83adb9eec1d87afd8198e6fa6b888959813');
  assert.equal(codexCommandHookCurrentHash({ event: 'PreToolUse', matcher: '*', command: "'/x y/sks-hook' pre-tool", statusMessage: 'SKS checking tool safety', timeout: 30 }),
    'sha256:42d3f34895ee40379c85f564f34c0dc3ac75838e7243649f459071ecab735114');
  assert.equal(codexCommandHookCurrentHash({ event: 'Stop', command: 'sks hook stop', statusMessage: 'SKS checking done gate' }),
    'sha256:c69975c4c849293679664656ba53c2c086b7869c0bd294fc13d90a8e8d5e13fc');
});

test('install puts SKS in the user-level hooks behind a launcher, trusts only SKS handlers, and keeps the user\'s hooks', async () => {
  await withHome(async (env, codexHome) => {
    await fsp.writeFile(path.join(codexHome, 'hooks.json'), JSON.stringify({ hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'say done' }] },
        { hooks: [{ type: 'command', command: 'sks hook stop', statusMessage: 'SKS checking done gate' }] }
      ]
    } }));
    await fsp.writeFile(path.join(codexHome, 'AGENTS.md'), '# Mine\n\nKeep this.\n');
    const first = await installGlobalSksHooks({ env, target: TARGET, verify: false });
    assert.equal(first.ok, true);
    assert.equal(first.active, true);

    const hooks = JSON.parse(await fsp.readFile(path.join(codexHome, 'hooks.json'), 'utf8')).hooks;
    const launcher = path.join(codexHome, 'sks', 'bin', 'sks-hook');
    assert.deepEqual(hooks.Stop[0].hooks, [{ type: 'command', command: 'say done' }], 'user hooks stay first and untouched');
    assert.equal(hooks.Stop.length, 2, 'the legacy bare SKS entry is replaced, not kept beside the new one');
    assert.equal(hooks.UserPromptSubmit[0].hooks[0].command, `'${launcher}' hook user-prompt-submit --scope=user`);
    assert.equal(hooks.PreToolUse[0].matcher, '*');

    const config = await fsp.readFile(path.join(codexHome, 'config.toml'), 'utf8');
    // Codex keys trust by the canonical path (/var/folders is /private/var/folders on macOS).
    const hooksKeyPath = await fsp.realpath(path.join(codexHome, 'hooks.json'));
    assert.ok(config.includes(`[hooks.state."${hooksKeyPath}:stop:1:0"]`));
    assert.ok(!config.includes(`${hooksKeyPath}:stop:0:0`), 'a user hook is never auto-trusted');

    const script = await fsp.readFile(launcher, 'utf8');
    assert.match(script, /^node='\/opt\/node\/bin\/node'$/m);
    assert.match(script, /^entry='\/opt\/sks\/dist\/bin\/sks\.js'$/m);
    assert.match(script, /command -v node/, 'a moved node is found on PATH');
    assert.match(script, /command -v sks/);
    assert.equal((await fsp.stat(launcher)).mode & 0o111, 0o111);

    const agents = await fsp.readFile(path.join(codexHome, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# Mine\n\nKeep this.\n'));
    assert.ok(agents.includes(`<!-- BEGIN ${GLOBAL_AGENTS_MARKER} -->`));
    assert.match(agents, /Sneakoscope Codex is active in every Codex project for this user\./);

    // This fixture's pinned SKS does not exist and PATH is empty: every event is installed and trusted, but nothing can run.
    const state = await readGlobalSksHookState({ ...env, PATH: '' });
    assert.deepEqual([state.missing_events, state.untrusted_events], [[], []]);
    assert.equal(state.launcher_reaches_sks, false);
    assert.equal(state.active, false);
    const second = await installGlobalSksHooks({ env, target: TARGET, verify: false });
    assert.deepEqual(second.actions, [], 'a second install changes nothing');
  });
});

test('a test process never writes a default home', async () => {
  await withHome(async (env, codexHome) => {
    const unopted: NodeJS.ProcessEnv = { ...env, SKS_TEST_DEFAULT_HOME: env.HOME };
    delete unopted.SKS_TEST_ALLOW_GLOBAL_HOOKS;
    const report = await installGlobalSksHooks({ env: unopted, target: TARGET, verify: false });
    assert.equal(report.active, false);
    assert.ok(report.warnings.includes('global_hooks_skipped_in_test_harness'));
    assert.deepEqual(await fsp.readdir(codexHome), []);

    const ownHome: NodeJS.ProcessEnv = { ...env };
    delete ownHome.SKS_TEST_ALLOW_GLOBAL_HOOKS;
    assert.equal((await installGlobalSksHooks({ env: ownHome, target: TARGET, verify: false })).active, true, 'a test that brings its own home installs');
  });
});

test('install removes the requirements.toml managed-hook setup Codex never loaded', async () => {
  await withHome(async (env, codexHome) => {
    const managedDir = path.join(codexHome, 'managed-hooks');
    await fsp.mkdir(managedDir, { recursive: true });
    await fsp.writeFile(path.join(managedDir, 'sks-managed-hooks.toml'), '[[hooks.Stop]]\n');
    await fsp.writeFile(path.join(managedDir, 'sks-managed-hook.sh'), '#!/bin/sh\n');
    await fsp.writeFile(path.join(codexHome, 'requirements.toml'), `allow_managed_hooks_only = true\n\n[hooks]\nmanaged_dir = ${JSON.stringify(managedDir)}\n`);
    await fsp.writeFile(path.join(codexHome, 'config.toml'), `model = "m"\n\n[hooks.state."${path.join(managedDir, 'sks-managed-hooks.toml')}:stop:0:0"]\ntrusted_hash = "sha256:old"\n`);
    const report = await installGlobalSksHooks({ env, target: TARGET, verify: false });
    assert.ok(report.actions.includes('removed_sks_requirements_toml'));
    await assert.rejects(fsp.stat(path.join(codexHome, 'requirements.toml')));
    await assert.rejects(fsp.stat(managedDir));
    const config = await fsp.readFile(path.join(codexHome, 'config.toml'), 'utf8');
    assert.ok(!config.includes('sks-managed-hooks.toml'));
    assert.match(config, /^model = "m"$/m);
  });
});

test('outside tests a source checkout leaves only the real home alone', async () => {
  await withHome(async (env, codexHome) => {
    const devRun: NodeJS.ProcessEnv = { ...env };
    for (const key of ['NODE_TEST_CONTEXT', 'SKS_TEST_ISOLATION', 'SKS_TEST_ALLOW_GLOBAL_HOOKS', 'SKS_TEST_DEFAULT_HOME']) delete devRun[key];
    const sandbox = await installGlobalSksHooks({ env: { ...devRun, SKS_TEST_REAL_HOME: '/nonexistent-real-home' }, verify: false });
    assert.equal(sandbox.active, true, 'a sandbox with its own home installs from the checkout');
    await fsp.rm(codexHome, { recursive: true, force: true });
    await fsp.mkdir(codexHome, { recursive: true });
    const real = await installGlobalSksHooks({ env: { ...devRun, SKS_TEST_REAL_HOME: env.HOME }, verify: false });
    assert.ok(real.warnings.includes('global_hooks_skipped_source_checkout'));
    assert.deepEqual(await fsp.readdir(codexHome), []);
  });
});

test('an update from 10.3.8 keeps the inert managed hooks its own final check counts', async () => {
  await withHome(async (env, codexHome) => {
    const managedDir = path.join(codexHome, 'managed-hooks');
    await fsp.mkdir(managedDir, { recursive: true });
    await fsp.writeFile(path.join(managedDir, 'sks-managed-hooks.toml'), '[[hooks.Stop]]\n');
    await fsp.writeFile(path.join(codexHome, 'requirements.toml'), `allow_managed_hooks_only = true\n\n[hooks]\nmanaged_dir = ${JSON.stringify(managedDir)}\n`);
    const report = await installGlobalSksHooks({ env, target: TARGET, verify: false, keepLegacyManagedDir: true });
    assert.ok(report.actions.includes('removed_allow_managed_hooks_only'));
    assert.equal(await fsp.readFile(path.join(codexHome, 'requirements.toml'), 'utf8'), `[hooks]\nmanaged_dir = ${JSON.stringify(managedDir)}\n`);
    assert.ok((await fsp.stat(path.join(managedDir, 'sks-managed-hooks.toml'))).isFile());
    assert.equal(report.active, true);
  });
});

test('a requirements.toml the user also writes keeps everything but the SKS lines', async () => {
  await withHome(async (env, codexHome) => {
    const managedDir = path.join(codexHome, 'managed-hooks');
    await fsp.writeFile(path.join(codexHome, 'requirements.toml'), `allowed_sandbox_modes = ["read-only"]\nallow_managed_hooks_only = true\n\n[hooks]\nmanaged_dir = ${JSON.stringify(managedDir)}\n`);
    await installGlobalSksHooks({ env, target: TARGET, verify: false });
    assert.equal(await fsp.readFile(path.join(codexHome, 'requirements.toml'), 'utf8'), 'allowed_sandbox_modes = ["read-only"]\n');
  });
});

test('verification adopts Codex\'s own key and hash when they differ from SKS\'s', async () => {
  await withHome(async (env, codexHome) => {
    let calls = 0;
    const listHooks = async (): Promise<CodexHooksListResult> => {
      calls += 1;
      const hooksPath = path.join(codexHome, 'hooks.json');
      const hooks = JSON.parse(await fsp.readFile(hooksPath, 'utf8')).hooks;
      const config = await fsp.readFile(path.join(codexHome, 'config.toml'), 'utf8');
      const rows = Object.entries(hooks).map(([event, groups]: [string, any]) => {
        const key = `/canonical${hooksPath}:${event}:0:0`;
        return {
          key,
          eventName: event[0]!.toLowerCase() + event.slice(1),
          matcher: groups[0].matcher ?? null,
          command: groups[0].hooks[0].command,
          sourcePath: hooksPath,
          source: 'user',
          enabled: true,
          isManaged: false,
          currentHash: `sha256:codex-${event}`,
          trustStatus: config.includes(`[hooks.state."${key}"]\ntrusted_hash = "sha256:codex-${event}"`) ? 'trusted' : 'untrusted'
        };
      });
      return { schema: 'sks.codex-hooks-list.v1', ok: true, codex_bin: 'fake-codex', data: [{ cwd: os.tmpdir(), hooks: rows, warnings: [], errors: [] }], blocker: null };
    };
    const report = await installGlobalSksHooks({ env, target: TARGET, verify: true, listHooks });
    assert.equal(calls, 2);
    assert.equal(report.active, true);
    assert.equal(report.verification?.checked, true);
    assert.equal(report.verification?.corrected_trust, report.events.length);
  });
});

test('a hook Codex does not load blocks activation', async () => {
  await withHome(async (env) => {
    const listHooks = async (): Promise<CodexHooksListResult> => ({ schema: 'sks.codex-hooks-list.v1', ok: true, codex_bin: 'fake', data: [{ cwd: '/', hooks: [], warnings: [], errors: [] }], blocker: null });
    const report = await installGlobalSksHooks({ env, target: TARGET, verify: true, listHooks });
    assert.equal(report.active, false);
    assert.ok(report.blockers.includes('sks_hook_not_loaded_by_codex:UserPromptSubmit'));
  });
});

test('the launcher follows a global install only, never a source checkout or a project dependency', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-target-'));
  try {
    const globalPkg = path.join(base, 'prefix', 'lib', 'node_modules', 'sneakoscope');
    await fsp.mkdir(path.join(globalPkg, 'dist', 'bin'), { recursive: true });
    await fsp.writeFile(path.join(globalPkg, 'dist', 'bin', 'sks.js'), '');
    const launcher = path.join(base, 'sks-hook');
    const global = await resolveGlobalHookTarget(launcher, { packageRootDir: globalPkg, execPath: '/bin/node' });
    assert.deepEqual(global, { node: '/bin/node', entry: path.join(globalPkg, 'dist', 'bin', 'sks.js'), source: 'installed_package' });

    const checkout = path.join(base, 'checkout');
    await fsp.mkdir(path.join(checkout, 'dist', 'bin'), { recursive: true });
    await fsp.mkdir(path.join(checkout, 'src', 'core'), { recursive: true });
    await fsp.writeFile(path.join(checkout, 'dist', 'bin', 'sks.js'), '');
    await fsp.writeFile(path.join(checkout, 'src', 'core', 'hooks-runtime.ts'), '');
    assert.equal((await resolveGlobalHookTarget(launcher, { packageRootDir: checkout })).source, 'path_lookup');

    const project = path.join(base, 'project');
    const local = path.join(project, 'node_modules', 'sneakoscope');
    await fsp.mkdir(path.join(local, 'dist', 'bin'), { recursive: true });
    await fsp.writeFile(path.join(local, 'dist', 'bin', 'sks.js'), '');
    await fsp.writeFile(path.join(project, 'package.json'), JSON.stringify({ devDependencies: { sneakoscope: '^10.3.9' } }));
    await fsp.writeFile(launcher, `node='/bin/sh'\nentry='${path.join(globalPkg, 'dist', 'bin', 'sks.js')}'\n`);
    const kept = await resolveGlobalHookTarget(launcher, { packageRootDir: local });
    assert.equal(kept.source, 'previous_launcher', 'a project install keeps the global target the launcher already had');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('uninstall removes the launcher and only the SKS rules block', async () => {
  await withHome(async (env, codexHome) => {
    await fsp.writeFile(path.join(codexHome, 'AGENTS.md'), '# Mine\n');
    await installGlobalSksHooks({ env, target: TARGET, verify: false });
    const actions = await removeGlobalSksHookArtifacts(env);
    assert.ok(actions.includes('removed_sks_hook_launcher'));
    assert.equal(await fsp.readFile(path.join(codexHome, 'AGENTS.md'), 'utf8'), '# Mine\n');
  });
});

test('real Codex loads and trusts every installed SKS hook', async (t) => {
  const bins = await codexHooksListBinaryCandidates(process.env);
  if (!bins.length) return t.skip('no Codex binary on this machine');
  await withHome(async (env, codexHome) => {
    const report = await installGlobalSksHooks({ env, target: TARGET, verify: false });
    const listed = await listCodexHooks({ cwds: [os.tmpdir()], env: { ...env, CODEX_HOME: codexHome } });
    assert.equal(listed.ok, true, listed.blocker || '');
    const userHooks = listed.data.flatMap((entry) => entry.hooks).filter((hook) => hook.source === 'user');
    assert.equal(userHooks.length, report.events.length);
    assert.deepEqual(userHooks.filter((hook) => hook.trustStatus !== 'trusted').map((hook) => hook.eventName), []);
  });
});

test('installed guidance tells Naruto parents to orchestrate and lets Jev seal the child', () => {
  const text = agentsBlockText();
  assert.match(text, /there the parent orchestrates only/);
  assert.match(text, /ordinary implementation stay parent-owned/);
  assert.match(text, /newest model of the tier its work needs \(fast, balanced, context, or deep\); no model family is pinned/);
  assert.match(text, /Jev picks the tier for each new Naruto child spawn and SKS seals it/);
  // Installed guidance never pins a model family.
  assert.doesNotMatch(text, /gpt[- ]?\d/i);
});

test('the hook state is active only while the launcher can still reach an SKS', async () => {
  await withHome(async (env, codexHome) => {
    const entry = path.join(codexHome, 'sks.js');
    await fsp.writeFile(entry, '');
    await installGlobalSksHooks({ env, target: { node: process.execPath, entry, source: 'installed_package' }, verify: false });
    const noPath: NodeJS.ProcessEnv = { ...env, PATH: '' };
    assert.equal((await readGlobalSksHookState(noPath)).active, true);

    await fsp.rm(entry);
    const gone = await readGlobalSksHookState(noPath);
    assert.equal(gone.launcher_reaches_sks, false, 'the pinned entry was removed');
    assert.equal(gone.active, false);

    const bin = path.join(codexHome, 'bin');
    await fsp.mkdir(bin);
    await fsp.writeFile(path.join(bin, 'sks'), '');
    assert.equal((await readGlobalSksHookState({ ...env, PATH: bin })).active, true, '`sks` on PATH is still a way to run SKS');
  });
});

test('the launcher runs the pinned SKS, falls back to node on PATH, and is silent when nothing is reachable', { skip: process.platform === 'win32' }, async () => {
  await withHome(async (env, codexHome) => {
    const entry = path.join(codexHome, 'fake-sks.js');
    await fsp.writeFile(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    const launcher = path.join(codexHome, 'sks', 'bin', 'sks-hook');
    const run = async (target: GlobalHookTarget, PATH: string) => {
      await installGlobalSksHooks({ env, target, verify: false });
      return spawnSync('/bin/sh', [launcher, 'hook', 'stop', '--scope=user'], { env: { PATH }, encoding: 'utf8' });
    };
    const pinned = await run({ node: process.execPath, entry, source: 'installed_package' }, '');
    assert.deepEqual([pinned.status, pinned.stdout], [0, '["hook","stop","--scope=user"]']);

    const moved = await run({ node: '/nonexistent/node', entry, source: 'installed_package' }, path.dirname(process.execPath));
    assert.deepEqual([moved.status, moved.stdout], [0, '["hook","stop","--scope=user"]'], 'the pinned node moved: node on PATH runs the same entry');

    const nothing = await run({ node: process.execPath, entry: path.join(codexHome, 'missing.js'), source: 'installed_package' }, '');
    assert.deepEqual([nothing.status, nothing.stdout], [0, ''], 'no SKS reachable: the hook does nothing and does not fail the turn');
  });
});

test('the pinned node is a stable alias of the running binary, not a versioned path an upgrade deletes', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-stable-node-'));
  try {
    const real = path.join(base, 'Cellar', '26.7.0', 'bin', 'node');
    await fsp.mkdir(path.dirname(real), { recursive: true });
    await fsp.writeFile(real, '', { mode: 0o755 });
    const prefixBin = path.join(base, 'prefix', 'bin');
    await fsp.mkdir(prefixBin, { recursive: true });
    await fsp.symlink(real, path.join(prefixBin, 'node'));
    const pkg = path.join(base, 'prefix', 'lib', 'node_modules', 'sneakoscope');
    assert.equal(await stableNodePath(real, pkg), path.join(prefixBin, 'node'));
    assert.equal(await stableNodePath(real, path.join(base, 'elsewhere')), real, 'no known alias: keep the running binary');
    assert.equal(await stableNodePath('/nonexistent/node', pkg), '/nonexistent/node');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('one Codex verification serves every project of an update while hooks.json and trust are unchanged', { skip: process.platform === 'win32' }, async () => {
  await withHome(async (env, codexHome) => {
    const counter = path.join(codexHome, 'spawns');
    const fakeCodex = path.join(codexHome, 'fake-codex');
    await fsp.writeFile(counter, '');
    await fsp.writeFile(fakeCodex, `#!${process.execPath}
const fs = require('fs');
fs.appendFileSync(${JSON.stringify(counter)}, 'x');
const file = ${JSON.stringify(path.join(codexHome, 'hooks.json'))};
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    if (message.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\\n');
    if (message.id === 2) {
      const rows = [];
      for (const [eventName, groups] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).hooks)) {
        groups.forEach((group, g) => group.hooks.forEach((hook, h) => rows.push({ key: file + ':' + eventName + ':' + g + ':' + h, eventName, matcher: group.matcher ?? null, command: hook.command, sourcePath: file, source: 'user', enabled: true, isManaged: false, currentHash: 'sha256:x', trustStatus: 'trusted' })));
      }
      process.stdout.write(JSON.stringify({ id: 2, result: { data: [{ cwd: '/', hooks: rows, warnings: [], errors: [] }] } }) + '\\n');
    }
  }
});
`, { mode: 0o755 });
    const verifying: NodeJS.ProcessEnv = { ...env, SKS_CODEX_BIN: fakeCodex };
    const spawns = async () => (await fsp.readFile(counter, 'utf8')).length;

    const first = await installGlobalSksHooks({ env: verifying, target: TARGET, verify: true });
    assert.equal(first.verification?.checked, true);
    assert.equal(first.active, true);
    assert.equal(await spawns(), 1);

    await installGlobalSksHooks({ env: verifying, target: TARGET, verify: true });
    await installGlobalSksHooks({ env: verifying, target: TARGET, verify: true });
    assert.equal(await spawns(), 1, 'the next projects of the same update reuse the answer');

    const hooksFile = path.join(codexHome, 'hooks.json');
    const hooks = JSON.parse(await fsp.readFile(hooksFile, 'utf8'));
    hooks.hooks.Stop.push({ hooks: [{ type: 'command', command: 'say done' }] });
    await fsp.writeFile(hooksFile, JSON.stringify(hooks));
    await installGlobalSksHooks({ env: verifying, target: TARGET, verify: true });
    assert.equal(await spawns(), 2, 'a changed hooks.json is verified again');
  });
});
