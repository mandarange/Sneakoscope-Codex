import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distCli = path.join(repoRoot, 'dist', 'bin', 'sks.js');

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

test('$with-local-llm-on/off dollar commands toggle the machine-local Ollama worker config', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-local-model-dollar-'));
  const configPath = path.join(cwd, 'local-model.json');
  const runPrompt = (prompt) => {
    const result = spawnSync(process.execPath, [distCli, 'run', prompt, '--execute', '--json'], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
        SKS_LOCAL_MODEL_CONFIG: configPath
      }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  const on = runPrompt('$with-local-llm-on');
  assert.equal(on.execution.command, 'sks with-local-llm enable --json');
  assert.equal(on.execution.execution_kind, 'safe_deterministic');
  assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).enabled, true);

  const off = runPrompt('$with-local-llm-off');
  assert.equal(off.execution.command, 'sks with-local-llm disable --json');
  assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).enabled, false);

  assert.equal(await fileExists(configPath), true);
});

test('dollar command list includes only with-local-llm on/off local model commands', () => {
  const result = spawnSync(process.execPath, [distCli, 'dollar-commands', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const commands = new Set(parsed.dollar_commands.map((entry) => entry.command));
  assert.ok(commands.has('$with-local-llm-on'));
  assert.ok(commands.has('$with-local-llm-off'));
  assert.equal(commands.has('$with-local-llm'), false);
  assert.equal(commands.has('$Local-Model'), false);
  assert.equal(commands.has('$Local-Model-On'), false);
  assert.equal(commands.has('$Local-Model-Off'), false);
  assert.equal(commands.has('$Ollama-On'), false);
  assert.equal(commands.has('$Ollama-Off'), false);
});
