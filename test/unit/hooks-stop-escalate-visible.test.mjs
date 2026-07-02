import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { evaluateStop } from '../../dist/core/pipeline-internals/runtime-gates.js';
import { writeJsonAtomic } from '../../dist/core/fsx.js';

test('Stop compliance loop escalates after three repeats with Korean visible message', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sks-stop-escalate-'));
  const missionId = 'M-20260702-000000-test';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(path.join(dir, 'naruto-gate.json'), { schema: 'sks.naruto-gate.v1', passed: false });
  const state = {
    mission_id: missionId,
    mode: 'NARUTO',
    route: 'Naruto',
    route_command: '$Naruto',
    stop_gate: 'naruto-gate.json',
    proof_required: false,
    reflection_required: false,
    agents_required: false,
    context7_required: false,
    subagents_required: false
  };
  try {
    let decision;
    for (let i = 0; i < 3; i += 1) decision = await evaluateStop(root, state, { message: 'done' });
    assert.equal(decision.decision, 'escalate');
    assert.match(decision.message, /사용자 개입이 필요합니다/);
    assert.match(decision.systemMessage, /사용자 개입이 필요합니다/);
    assert.equal(decision.repeat_count, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
