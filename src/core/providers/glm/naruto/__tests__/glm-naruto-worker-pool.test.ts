import test from 'node:test';
import assert from 'node:assert/strict';
import { planFileLeases } from '../glm-naruto-file-lease.js';
import { createBudget, checkBudget, recordRequest, canRequestShard } from '../glm-naruto-budget.js';
import { GLM_NARUTO_LIMITS } from '../glm-naruto-types.js';

test('file lease planning detects shared paths', () => {
  const shardPaths = new Map<string, readonly string[]>([
    ['s1', ['src/a.ts', 'src/b.ts']],
    ['s2', ['src/b.ts', 'src/c.ts']]
  ]);
  const leases = planFileLeases(shardPaths);
  const sharedB = leases.find(l => l.path === 'src/b.ts');
  assert.ok(sharedB);
  assert.equal(sharedB!.exclusive, false);
  assert.ok(sharedB!.shardIds.includes('s1'));
  assert.ok(sharedB!.shardIds.includes('s2'));
});

test('budget enforces total request limit', () => {
  let budget = createBudget('test', false);
  assert.equal(checkBudget(budget).ok, true);
  for (let i = 0; i < GLM_NARUTO_LIMITS.max_total_requests; i++) {
    budget = recordRequest(budget, `shard-${i}`);
  }
  const check = checkBudget(budget);
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'budget_total_requests_exceeded');
});

test('canRequestShard respects per-shard limit', () => {
  let budget = createBudget('test', false);
  for (let i = 0; i < GLM_NARUTO_LIMITS.max_requests_per_shard; i++) {
    budget = recordRequest(budget, 'shard-0');
  }
  assert.equal(canRequestShard(budget, 'shard-0'), false);
  assert.equal(canRequestShard(budget, 'shard-1'), true);
});
