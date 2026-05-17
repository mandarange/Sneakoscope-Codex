import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexLbMetrics, recordCodexLbHealthEvent, resetCodexLbCircuit } from '../../src/core/codex-lb-circuit.mjs';

test('codex-lb circuit opens on repeated 5xx but not previous_response_not_found', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-'));
  const previous = process.env.SKS_CODEX_LB_HEALTH_PATH;
  process.env.SKS_CODEX_LB_HEALTH_PATH = path.join(tmp, 'health.json');
  try {
    let circuit = await resetCodexLbCircuit(tmp);
    circuit = await recordCodexLbHealthEvent(tmp, { status: 'previous_response_not_found', http_status: 400 });
    assert.equal(circuit.state, 'closed');
    circuit = await recordCodexLbHealthEvent(tmp, { status: 'second_request_failed', http_status: 500 });
    circuit = await recordCodexLbHealthEvent(tmp, { status: 'second_request_failed', http_status: 502 });
    circuit = await recordCodexLbHealthEvent(tmp, { status: 'second_request_failed', http_status: 503 });
    assert.equal(circuit.state, 'open');
    assert.equal(codexLbMetrics(circuit).ok, false);
    circuit = await recordCodexLbHealthEvent(tmp, { status: 'chain_ok', ok: true });
    assert.equal(circuit.state, 'closed');
  } finally {
    if (previous === undefined) delete process.env.SKS_CODEX_LB_HEALTH_PATH;
    else process.env.SKS_CODEX_LB_HEALTH_PATH = previous;
  }
});
