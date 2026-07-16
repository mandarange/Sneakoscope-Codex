import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';

const compatibleRecoveryFetch = async () => new Response('{}', { status: 200, headers: { 'x-app-version': '1.21.0-beta.3' } });

test('codex-lb shell-profile zsh modifies only .zshrc and reports shell_profile', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-zsh-'));
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey: 'sk-clb-zsh',
    writeEnvFile: true,
    storeKeychain: false,
    syncLaunchctl: false,
    shellProfile: 'zsh',
    toolOutputRecoveryFetch: compatibleRecoveryFetch
  });
  assert.ok(result.persistence?.applied_modes.includes('shell_profile'));
  assert.match(await fs.readFile(path.join(home, '.zshrc'), 'utf8'), /BEGIN SKS CODEX-LB/);
  await assert.rejects(fs.stat(path.join(home, '.bashrc')));
  await assert.rejects(fs.stat(path.join(home, '.config/fish/config.fish')));
});
