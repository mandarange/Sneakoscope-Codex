import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NARUTO_CLONES } from '../../dist/core/agents/agent-schema.js';
import { buildAgentRoster, buildNarutoCloneRoster, systemSafeNarutoConcurrency } from '../../dist/core/agents/agent-roster.js';
import { normalizeTargetActiveSlots } from '../../dist/core/agents/agent-scheduler.js';
import { decideNarutoConcurrency } from '../../dist/core/naruto/naruto-concurrency-governor.js';
import { defaultReleaseGateMaxTotal } from '../../dist/core/release/release-gate-resource-governor.js';
import { computeLoopConcurrencyBudget } from '../../dist/core/loops/loop-concurrency-budget.js';

test('Naruto queues a modest default roster and never activates more than four workers', () => {
  assert.equal(DEFAULT_NARUTO_CLONES, 8);
  assert.equal(buildNarutoCloneRoster({ clones: 100 }).concurrency, 4);
  assert.equal(buildAgentRoster({ agents: 20, concurrency: 20 }).concurrency, 4);
  assert.equal(normalizeTargetActiveSlots(100, 100), 4);
  const capacity = systemSafeNarutoConcurrency({
    backend: 'codex-sdk',
    cores: 64,
    freeBytes: 128 * 1024 ** 3,
    totalBytes: 256 * 1024 ** 3,
    loadAverage: 0
  });
  assert.equal(capacity.cap, 4);
});

test('live load and low free memory collapse Naruto to a single active worker', () => {
  const loaded = systemSafeNarutoConcurrency({
    backend: 'codex-sdk',
    cores: 10,
    freeBytes: 512 * 1024 ** 2,
    totalBytes: 32 * 1024 ** 3,
    loadAverage: 30
  });
  assert.equal(loaded.cap, 1);

  const governed = decideNarutoConcurrency({
    requestedClones: 100,
    totalWorkItems: 200,
    backend: 'codex-sdk',
    parallelismMode: 'extreme',
    hardware: {
      cores: 10,
      loadAverage: [30, 25, 20],
      freeMemoryBytes: 512 * 1024 ** 2,
      totalMemoryBytes: 32 * 1024 ** 3,
      fileDescriptorLimit: 4096,
      processCount: 100
    }
  });
  assert.equal(governed.safe_active_workers, 1);
  assert.equal(governed.backpressure, 'saturated');
});

test('release and loop schedulers retain hard desktop-safe caps even with oversized env requests', () => {
  assert.ok(defaultReleaseGateMaxTotal() >= 1 && defaultReleaseGateMaxTotal() <= 4);
  const plan = {
    mission_id: 'M-resource-fixture',
    global_budget: { max_model_calls: 100 },
    graph: {
      nodes: Array.from({ length: 8 }, (_, index) => ({
        loop_id: `loop-${index}`,
        maker: { worker_count: 8 },
        checker: { worker_count: 8 },
        budget: { max_model_calls: 8 }
      }))
    }
  };
  const budget = computeLoopConcurrencyBudget({
    plan,
    parallelism: 'extreme',
    env: {
      SKS_LOOP_MAX_ACTIVE_LOOPS: '999',
      SKS_LOOP_MAX_ACTIVE_WORKERS: '999',
      SKS_LOOP_MAX_MODEL_CALLS: '999'
    }
  });
  assert.ok(budget.max_active_loops <= 4);
  assert.ok(budget.max_active_workers <= 4);
  assert.ok(budget.max_model_calls <= 4);
});
