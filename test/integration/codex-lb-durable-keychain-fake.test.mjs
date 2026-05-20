import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';

test('codex-lb fake Keychain success reports durable_keychain', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-keychain-'));
  const bin = path.join(home, 'security');
  await fs.writeFile(bin, '#!/usr/bin/env sh\nexit 0\n');
  await fs.chmod(bin, 0o755);
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey: 'sk-clb-keychain',
    writeEnvFile: false,
    storeKeychain: true,
    keychain: true,
    forceMacos: true,
    securityBin: bin,
    syncLaunchctl: false,
    shellProfile: 'skip'
  });
  assert.equal(result.keychain?.ok, true);
  assert.ok(result.persistence?.applied_modes.includes('durable_keychain'));
});
