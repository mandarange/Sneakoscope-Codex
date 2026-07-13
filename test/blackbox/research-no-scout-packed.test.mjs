import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

async function scriptGate(script) {
  const result = await runProcess(process.execPath, [script], { timeoutMs: 120_000, maxOutputBytes: 512 * 1024 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const jsonText = (result.stdout.match(/\{[\s\S]*\}\s*$/) || ['{}'])[0];
  const json = JSON.parse(jsonText);
  assert.equal(json.ok, true);
  return json;
}

test('Research packed blackbox uses Super Search plus official subagents without legacy scout/native-agent runtime', async () => {
  const pipeline = await scriptGate('./dist/scripts/codex-sdk-research-pipeline-check.js');
  assert.equal(pipeline.gate, 'codex-sdk:research-pipeline');
  assert.equal(pipeline.route, '$Research');

  const legacyRemoval = await scriptGate('./dist/scripts/research-real-cycle-no-legacy-final-md-check.js');
  assert.equal(legacyRemoval.gate, 'research:real-cycle-no-legacy-final-md');
  assert.equal(legacyRemoval.legacy_runtime_removed, true);
  assert.equal(legacyRemoval.official_subagents, true);
  assert.equal(legacyRemoval.super_search, true);
});
