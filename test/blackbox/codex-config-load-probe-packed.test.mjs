import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const probe = path.join(root, 'scripts', 'codex-config-load-probe.mjs');
const fakeCodex = path.join(root, 'scripts', 'fixtures', 'fake-codex-config-loader.mjs');

test('codex config load probe fails when Node can read but fake Codex gets EPERM', async () => {
  const fixture = await makeFixture();
  const result = runProbe(fixture, { SKS_FAKE_CODEX_CONFIG_EPERM: '1' });
  assert.notEqual(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.checks.find((row) => row.name === 'node_read')?.ok, true);
  assert.equal(json.checks.find((row) => row.name === 'actual_codex_cli_config_load')?.ok, false);
  assert.ok(json.blockers.includes('codex_cli_config_eperm'));
});

test('codex config load probe passes with fake Codex success', async () => {
  const fixture = await makeFixture();
  const result = runProbe(fixture);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.checks.find((row) => row.name === 'actual_codex_cli_config_load')?.status, 'passed');
});

test('codex config load probe classifies fake Codex TOML errors', async () => {
  const fixture = await makeFixture();
  const result = runProbe(fixture, { SKS_FAKE_CODEX_CONFIG_TOML_ERROR: '1' });
  assert.notEqual(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.ok(json.blockers.includes('codex_cli_config_toml_parse_error'));
});

async function makeFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-config-load-'));
  await fs.mkdir(path.join(dir, '.codex'), { recursive: true });
  await fs.writeFile(path.join(dir, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n');
  return dir;
}

function runProbe(fixture, extraEnv = {}) {
  return spawnSync(process.execPath, [
    probe,
    '--root',
    fixture,
    '--config',
    path.join(fixture, '.codex', 'config.toml'),
    '--codex-bin',
    fakeCodex,
    '--json'
  ], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8'
  });
}
