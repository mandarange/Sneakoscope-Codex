import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

async function npmGate(name) {
  const result = await runProcess('npm', ['run', name], { timeoutMs: 120_000, maxOutputBytes: 512 * 1024 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const jsonText = (result.stdout.match(/\{[\s\S]*\}\s*$/) || ['{}'])[0];
  const json = JSON.parse(jsonText);
  assert.equal(json.ok, true);
  return json;
}

test('Research packed blackbox uses native agent backend and no scout runtime', async () => {
  const json = await npmGate('research:native-agent-backend');
  assert.equal(json.gate, 'research-native-agent-backend');
});
