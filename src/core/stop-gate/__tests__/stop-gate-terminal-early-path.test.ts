import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { runGlmNarutoMission } from '../../providers/glm/naruto/glm-naruto-orchestrator.js';

test('GLM Naruto missing key terminal path writes canonical stop-gate evidence', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-terminal-'));
  const oldHome = process.env.SKS_HOME;
  const oldOpenRouter = process.env.OPENROUTER_API_KEY;
  const oldSksOpenRouter = process.env.SKS_OPENROUTER_API_KEY;
  process.env.SKS_HOME = path.join(root, 'home');
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.SKS_OPENROUTER_API_KEY;
  try {
    const result = await runGlmNarutoMission({ cwd: root, task: 'Change src/a.ts', args: [], missionId: 'M-missing-key' });
    assert.equal(result.ok, false);
    const gate = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', 'M-missing-key', 'stop-gate.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(gate.passed, false);
    assert.equal(gate.terminal, true);
    assert.ok((gate.blockers as string[]).includes('glm_missing_openrouter_key'));
  } finally {
    if (oldHome === undefined) delete process.env.SKS_HOME;
    else process.env.SKS_HOME = oldHome;
    if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldOpenRouter;
    if (oldSksOpenRouter === undefined) delete process.env.SKS_OPENROUTER_API_KEY;
    else process.env.SKS_OPENROUTER_API_KEY = oldSksOpenRouter;
  }
});
