import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDoctorCodexStartupRepair } from '../doctor-codex-startup-repair.js';

test('doctor preserves explicit child model and effort even when the catalog lists a newer model', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-model-preference-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, 'codex-home');
  await fs.mkdir(codexHome);
  await fs.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({
    models: [{ slug: 'gpt-5.6-luna' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }]
  }));
  const configPath = path.join(codexHome, 'config.toml');
  const text = 'model = "parent-choice"\nservice_tier = "flex"\n[agents]\ndefault_subagent_model = "gpt-5.6-luna" # my choice\ndefault_subagent_reasoning_effort = "low"\n';
  await fs.writeFile(configPath, text);
  for (const fix of [false, true]) {
    const report = await runDoctorCodexStartupRepair({ root, fix, codexHome, includeDefaultNodeReplCandidates: false });
    assert.equal(report.configs.find(row => row.scope === 'global')?.changed, false);
    assert.equal(await fs.readFile(configPath, 'utf8'), text);
    assert.ok(!report.warnings.some(value => value.includes('default_subagent_model')));
  }
});
