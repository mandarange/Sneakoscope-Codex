// First import: installs write $HOME/.codex, which must never be the real one.
import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
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
    assert.match(script, /command -v sks/);
    assert.equal((await fsp.stat(launcher)).mode & 0o111, 0o111);

    const agents = await fsp.readFile(path.join(codexHome, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# Mine\n\nKeep this.\n'));
    assert.ok(agents.includes(`<!-- BEGIN ${GLOBAL_AGENTS_MARKER} -->`));
    assert.match(agents, /Sneakoscope Codex is active in every Codex project for this user\./);

    const state = await readGlobalSksHookState(env);
    assert.equal(state.active, true);
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
  assert.match(text, /parent orchestration only/);
  assert.match(text, /newest model of the tier its work needs \(fast, balanced, context, or deep\); no model family is pinned/);
  assert.match(text, /Jev picks the tier for each new Naruto child spawn and SKS seals it/);
  // Installed guidance never pins a model family.
  assert.doesNotMatch(text, /gpt-5\.6-|gpt-6-astra only|Off mode keeps gpt-6-astra/);
  assert.equal(text.includes('model="gpt-6-astra"'), false);
});
