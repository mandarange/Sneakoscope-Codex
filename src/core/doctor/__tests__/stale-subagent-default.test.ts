import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDoctorCodexStartupRepair } from '../doctor-codex-startup-repair.js';
import { moveStaleSubagentDefault } from '../stale-subagent-default.js';

async function withCodexHome(models: Array<{ slug: string }> | null, run: () => void | Promise<void>) {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-stale-default-'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  if (models) await fs.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({ fetched_at: 'x', models }));
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    await fs.rm(codexHome, { recursive: true, force: true });
  }
}

const CACHE = [{ slug: 'gpt-6.1-sol' }, { slug: 'gpt-6-sol' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }, { slug: 'gpt-5.6-luna' }, { slug: 'gpt-5.6-terra' }];
const config = (value: string) => `model = "gpt-6.1-sol"\n\n[agents]\nmax_depth = 1\ndefault_subagent_model = "${value}" # kept\ndefault_subagent_reasoning_effort = "max"\n\n[projects."/x"]\ntrust_level = "trusted"\n`;

test('a superseded default child model moves to the latest default and nothing else changes', async () => {
  await withCodexHome(CACHE, () => {
    const moved = moveStaleSubagentDefault(config('gpt-5.6-luna'));
    assert.equal(moved.from, 'gpt-5.6-luna');
    assert.equal(moved.to, 'gpt-6-astra');
    assert.equal(moved.text, config('gpt-6-astra'));
    assert.equal(moveStaleSubagentDefault(config('gpt-6-sol')).from, 'gpt-6-sol');
    // CRLF files with a trailing comment are handled too.
    assert.equal(moveStaleSubagentDefault(config('gpt-5.6-luna').replace(/\n/g, '\r\n')).text, config('gpt-6-astra').replace(/\n/g, '\r\n'));
  });
});

test('a current model, a foreign slug, a key outside [agents], and a missing catalog are left alone', async () => {
  await withCodexHome(CACHE, () => {
    // gpt-5.6-terra is the newest terra row: not superseded, so not moved.
    for (const value of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-terra', 'z-ai/glm-5.3']) {
      assert.deepEqual(moveStaleSubagentDefault(config(value)), { text: config(value), from: null, to: null }, value);
    }
    const outside = `[projects."/x"]\ndefault_subagent_model = "gpt-5.6-luna"\n`;
    assert.equal(moveStaleSubagentDefault(outside).text, outside);
  });
  await withCodexHome(null, () => {
    assert.equal(moveStaleSubagentDefault(config('gpt-5.6-luna')).from, null);
  });
});

test('doctor moves the global default only with --fix and reports the stale one without --fix', async () => {
  await withCodexHome(CACHE, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-stale-default-root-'));
    const codexHome = String(process.env.CODEX_HOME);
    const configPath = path.join(codexHome, 'config.toml');
    try {
      await fs.writeFile(configPath, config('gpt-5.6-luna'));
      const dry = await runDoctorCodexStartupRepair({ root, fix: false, codexHome, includeDefaultNodeReplCandidates: false });
      const dryGlobal = dry.configs.find((entry) => entry.scope === 'global')!;
      assert.equal(dryGlobal.changed, false);
      assert.ok(dryGlobal.warnings.includes('default_subagent_model_not_latest:gpt-5.6-luna->gpt-6-astra'));
      assert.equal(await fs.readFile(configPath, 'utf8'), config('gpt-5.6-luna'));

      const fixed = await runDoctorCodexStartupRepair({ root, fix: true, codexHome, includeDefaultNodeReplCandidates: false });
      assert.ok(fixed.configs.find((entry) => entry.scope === 'global')!.warnings.includes('default_subagent_model_moved_to_latest:gpt-5.6-luna->gpt-6-astra'));
      assert.match(await fs.readFile(configPath, 'utf8'), /default_subagent_model = "gpt-6-astra" # kept/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
