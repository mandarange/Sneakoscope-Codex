import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';

test('codex-lb fake launchctl success reports durable_launchctl', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-launchctl-'));
  const bin = path.join(home, 'launchctl');
  await fs.writeFile(bin, '#!/usr/bin/env sh\nexit 0\n');
  await fs.chmod(bin, 0o755);
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey: 'sk-clb-launchctl',
    writeEnvFile: true,
    storeKeychain: false,
    syncLaunchctl: true,
    forceLaunchEnv: true,
    launchctlBin: bin,
    shellProfile: 'skip'
  });
  assert.equal(result.codex_environment?.launch_environment?.status, 'synced');
  assert.ok(result.persistence?.applied_modes.includes('durable_launchctl'));
});
