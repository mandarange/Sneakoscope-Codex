import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { agentsBlockText } from '../../init.js';
import {
  defaultManagedHookCommand,
  installManagedCodexHooks,
  retargetLiveManagedHookScript
} from '../codex-hook-managed-install.js';

test('managed hook install execs the installed SKS entrypoint, not a PATH lookup', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-command-'));
  const command = await defaultManagedHookCommand();
  try {
    const install = await installManagedCodexHooks(root, { binCommand: command });
    const script = await fsp.readFile(install.managed_script, 'utf8');
    assert.match(command, /dist\/bin\/sks\.js/);
    assert.match(script, /exec '/);
    assert.match(script, /dist\/bin\/sks\.js' hook "\$subcommand"/);
    assert.equal(script.includes('exec sks hook'), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('update hook refresh retargets the Codex managed hook the app actually runs', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-live-hook-'));
  const managedDir = path.join(home, '.codex', 'managed-hooks');
  const script = path.join(managedDir, 'sks-managed-hook.sh');
  await fsp.mkdir(managedDir, { recursive: true });
  await fsp.writeFile(path.join(home, '.codex', 'requirements.toml'), [
    'allow_managed_hooks_only = true',
    '',
    '[hooks]',
    `managed_dir = ${JSON.stringify(managedDir)}`,
    ''
  ].join('\n'));
  await fsp.writeFile(script, '#!/usr/bin/env sh\nset -eu\nsubcommand="${1:-}"\nshift || true\nexec sks hook "$subcommand" "$@"\n');
  try {
    const result = await retargetLiveManagedHookScript({ ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex') });
    const next = await fsp.readFile(script, 'utf8');
    assert.equal(result.status, 'rewritten');
    assert.match(next, /dist\/bin\/sks\.js' hook/);
    assert.equal(next.includes('exec sks hook'), false);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
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
