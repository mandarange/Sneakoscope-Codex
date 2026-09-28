import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcileProjectSksHooks } from '../codex-project-hooks.js';

async function withProject(run: (input: { env: NodeJS.ProcessEnv; codexHome: string; root: string }) => Promise<void>) {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-hooks-')));
  const home = path.join(base, 'home');
  const codexHome = path.join(home, '.codex');
  const root = path.join(base, 'project');
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.mkdir(path.join(root, '.codex'), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'), SKS_TEST_ALLOW_GLOBAL_HOOKS: '1' };
  delete env.CODEX_HOME;
  try {
    await run({ env, codexHome, root });
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
}

const writeHooks = (root: string, hooks: unknown) => fsp.writeFile(path.join(root, '.codex', 'hooks.json'), JSON.stringify({ hooks }));
const readHooks = async (root: string) => JSON.parse(await fsp.readFile(path.join(root, '.codex', 'hooks.json'), 'utf8')).hooks;

test('with the user-level hooks active a project keeps only its pinned SKS hooks and its own hooks', async () => {
  await withProject(async ({ env, codexHome, root }) => {
    await writeHooks(root, {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'sks hook user-prompt-submit' }] }],
      Stop: [
        { hooks: [{ type: 'command', command: 'node ./dist/bin/sks.js hook stop', statusMessage: 'SKS checking done gate' }] },
        { hooks: [{ type: 'command', command: 'npm run lint' }, { type: 'command', command: 'sks hook stop' }] }
      ]
    });
    const report = await reconcileProjectSksHooks(root, { env, globalActive: true });
    assert.equal(report.ok, true);
    assert.deepEqual(report.pinned_events, ['Stop']);
    assert.deepEqual(await readHooks(root), {
      Stop: [
        { hooks: [{ type: 'command', command: 'node ./dist/bin/sks.js hook stop', statusMessage: 'SKS checking done gate' }] },
        { hooks: [{ type: 'command', command: 'npm run lint' }] }
      ]
    });
    const config = await fsp.readFile(path.join(codexHome, 'config.toml'), 'utf8');
    assert.ok(config.includes(`[hooks.state."${path.join(root, '.codex', 'hooks.json')}:stop:0:0"]`), 'pinned trust lives in the user config');
    await assert.rejects(fsp.stat(path.join(root, '.codex', 'config.toml')), 'nothing is written into the project config');
  });
});

test('a hooks.json that held only global SKS hooks is removed', async () => {
  await withProject(async ({ env, root }) => {
    await writeHooks(root, { Stop: [{ hooks: [{ type: 'command', command: 'sks hook stop' }] }] });
    const report = await reconcileProjectSksHooks(root, { env, globalActive: true });
    assert.ok(report.actions.includes('removed_project_sks_hooks_file'));
    await assert.rejects(fsp.stat(path.join(root, '.codex', 'hooks.json')));
  });
});

test('nothing is stripped while the user-level hooks are not active', async () => {
  await withProject(async ({ env, root }) => {
    const hooks = { Stop: [{ hooks: [{ type: 'command', command: 'sks hook stop' }] }] };
    await writeHooks(root, hooks);
    await reconcileProjectSksHooks(root, { env, globalActive: false });
    assert.deepEqual(await readHooks(root), hooks);
  });
});

test('run from HOME, the project .codex is the Codex home and is left alone', async () => {
  await withProject(async ({ env, codexHome }) => {
    const hooks = { Stop: [{ hooks: [{ type: 'command', command: "'/x/sks-hook' hook stop --scope=user" }] }] };
    await fsp.writeFile(path.join(codexHome, 'hooks.json'), JSON.stringify({ hooks }));
    const report = await reconcileProjectSksHooks(path.dirname(codexHome), { env, globalActive: true });
    assert.deepEqual(report.actions, []);
    assert.deepEqual(JSON.parse(await fsp.readFile(path.join(codexHome, 'hooks.json'), 'utf8')).hooks, hooks);
  });
});
