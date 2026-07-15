import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentTaskGraph } from '../../dist/core/agents/agent-task-graph.js';
import { runNativeAgentOrchestrator } from '../../dist/core/agents/agent-orchestrator.js';
import { compileStrategy } from '../../dist/core/strategy/strategy-compiler.js';

test('strategy micro-wins propagate into agent task graph items', () => {
  const compiled = compileStrategy({ prompt: 'Patch `src/core/version.ts`.', writeTargets: ['src/core/version.ts'] });
  const graph = buildAgentTaskGraph({
    routeType: '$Fixture',
    prompt: 'Patch version',
    targetActiveSlots: 3,
    desiredWorkItems: 4,
    strategyRefs: { artifact: 'strategy-gate.json', ok: true },
    microWins: compiled.gate.micro_wins
  });
  assert.ok(graph.work_items.every((item) => item.strategy_refs));
  assert.ok(graph.work_items.some((item) => item.micro_win_id));
});

test('read-only micro-wins do not become write leases under write-capable route templates', () => {
  const graph = buildAgentTaskGraph({
    routeType: '$Fixture',
    prompt: 'Inspect README',
    targetActiveSlots: 1,
    desiredWorkItems: 1,
    microWins: [{
      id: 'read-only-1',
      kind: 'read_only',
      readonly_paths: ['README.md'],
      dopamine_weight: 0.5
    }]
  });
  assert.deepEqual(graph.work_items[0].write_paths, []);
  assert.equal(graph.work_items[0].lease_requirements.some((row) => row.kind === 'write'), false);
});

test('strategy gate blocks scheduler before visual write work without Appshots evidence', async () => {
  const result = await runNativeAgentOrchestrator({
    route: '$Fixture',
    prompt: 'Patch docs after visual Appshots UI review.',
    backend: 'fake',
    mock: true,
    writeMode: 'parallel',
    agents: 2,
    concurrency: 1
  });
  assert.equal(result.ok, false);
  assert.equal(result.strategy_gate.scheduler_allowed, false);
  assert.equal(result.scheduler.status, 'blocked_before_scheduler');
  assert.deepEqual(result.results, []);
  assert.match(result.strategy_gate.blockers.join('\n'), /appshots_operator_action_missing_for_visual_proof/);
});
