import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson } from '../../src/core/fsx.mjs';
import { recordCodexLbHealthEvent, resetCodexLbCircuit } from '../../src/core/codex-lb-circuit.mjs';

test('codex-lb fixture events drive circuit state', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-fixture-'));
  const previous = process.env.SKS_CODEX_LB_HEALTH_PATH;
  process.env.SKS_CODEX_LB_HEALTH_PATH = path.join(tmp, 'health.json');
  try {
    await resetCodexLbCircuit(tmp);
    const repeated = await readJson(path.join(process.cwd(), 'test/fixtures/codex-lb/repeated-5xx-open.json'));
    let circuit;
    for (const event of repeated.events) circuit = await recordCodexLbHealthEvent(tmp, event);
    assert.equal(circuit.state, repeated.expected_state);
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_LB_HEALTH_PATH;
    else process.env.SKS_CODEX_LB_HEALTH_PATH = previous;
  }
});
