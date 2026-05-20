import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';

test('codex-lb no-env-file does not mutate an existing env file', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-no-env-existing-'));
  const envPath = path.join(home, '.codex', 'sks-codex-lb.env');
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  const original = 'export CODEX_LB_BASE_URL=https://old.example/backend-api/codex\nexport CODEX_LB_API_KEY=sk-clb-old\n';
  await fs.writeFile(envPath, original);
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey: 'sk-clb-new',
    writeEnvFile: false,
    storeKeychain: false,
    syncLaunchctl: false,
    shellProfile: 'skip'
  });
  assert.equal(result.ok, true);
  assert.equal(result.drift?.length, 0);
  assert.equal(await fs.readFile(envPath, 'utf8'), original);
});
