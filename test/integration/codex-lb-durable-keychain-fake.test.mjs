import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';

const compatibleRecoveryFetch = async () => new Response('{}', { status: 200, headers: { 'x-app-version': '1.21.0-beta.3' } });

test('codex-lb fake Keychain success reports durable_keychain', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-keychain-'));
  const apiKey = 'sk-clb-keychain';
  const bin = path.join(home, 'swift');
  await fs.writeFile(bin, `#!/usr/bin/env node
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const key=${JSON.stringify(apiKey)};if(process.argv.some(arg=>arg.includes(key))||input.trim()!==key)process.exit(1)})
`);
  await fs.chmod(bin, 0o755);
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey,
    writeEnvFile: false,
    storeKeychain: true,
    keychain: true,
    forceMacos: true,
    swiftBin: bin,
    securityBin: bin,
    syncLaunchctl: false,
    shellProfile: 'skip',
    toolOutputRecoveryFetch: compatibleRecoveryFetch
  });
  assert.equal(result.keychain?.ok, true);
  assert.ok(result.persistence?.applied_modes.includes('durable_keychain'));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
});
