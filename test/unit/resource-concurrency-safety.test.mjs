import test from 'node:test';
import assert from 'node:assert/strict';
import { decideNarutoConcurrency } from '../../dist/core/naruto/naruto-concurrency-governor.js';
import {
  DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
  HARD_NARUTO_MAX_THREADS,
  resolveSubagentThreadBudget
} from '../../dist/core/subagents/thread-budget.js';
import {
  MAX_AUTOMATIC_SUBAGENT_COUNT,
  officialSubagentFanoutPolicy
} from '../../dist/core/subagents/agent-catalog.js';
import { defaultReleaseGateMaxTotal } from '../../dist/core/release/release-gate-resource-governor.js';

test('Naruto official-subagent fanout stays bounded and preserves max_depth=1', () => {
  assert.equal(DEFAULT_NARUTO_REQUESTED_SUBAGENTS, 4);
  assert.equal(MAX_AUTOMATIC_SUBAGENT_COUNT, 256);

  const automatic = officialSubagentFanoutPolicy({
    taskProfile: 'high-risk',
    goal: 'critical release security database architecture audit',
    suggestedRoles: ['release_reviewer', 'security_reviewer', 'database_reviewer']
  });
  assert.equal(automatic.requested_subagents, 3);
  assert.equal(automatic.critical_multi_domain, true);

  assert.throws(
    () => resolveSubagentThreadBudget({ requested: 257, configuredMaxThreads: 4 }),
    /requested_subagents_must_be_integer_1_to_256/
  );
  const budget = resolveSubagentThreadBudget({ requested: 256, configuredMaxThreads: 4 });
  assert.equal(budget.requestedSubagents, HARD_NARUTO_MAX_THREADS);
  assert.equal(budget.maxThreads, 4);
  assert.equal(budget.firstWave, 4);
  assert.equal(budget.waveCount, 64);
  assert.equal(budget.capacity.available_thread_slots, 4);
  assert.equal(budget.maxDepth, 1);
});

test('governor no longer hard-caps safe workers at four when frame budget allows more', () => {
  const governed = decideNarutoConcurrency({
    requestedWorkers: 8,
    totalWorkItems: 16,
    backend: 'codex-sdk',
    parallelismMode: 'extreme',
    maxThreads: 12,
    hardware: {
      cores: 16,
      loadAverage: [1, 1, 1],
      freeMemoryBytes: 24 * 1024 ** 3,
      totalMemoryBytes: 32 * 1024 ** 3,
      fileDescriptorLimit: 8192,
      processCount: 100,
      remoteApiRateLimitBudget: 16
    }
  });
  assert.ok(governed.safe_active_workers > 4);
  assert.ok(governed.safe_active_workers <= 12);
});

test('live load and low free memory collapse Naruto to a single active worker', () => {
  const governed = decideNarutoConcurrency({
    requestedWorkers: 100,
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

test('release scheduler retains a hard desktop-safe cap', () => {
  assert.ok(defaultReleaseGateMaxTotal() >= 1 && defaultReleaseGateMaxTotal() <= 4);
});
