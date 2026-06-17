import { writeJsonAtomic } from '../fsx.js';
import { computeLoopConcurrencyBudget } from '../loops/loop-concurrency-budget.js';
import { loopRoot } from '../loops/loop-artifacts.js';
import { runLoopPlan } from '../loops/loop-runtime.js';
import type { SksLoopGraphResult, SksLoopPlan } from '../loops/loop-schema.js';
import { routeNarutoLoopWorker } from './naruto-loop-worker-router.js';

export async function runNarutoLoopMesh(input: {
  root: string;
  plan: SksLoopPlan;
  parallelism: 'safe' | 'balanced' | 'extreme';
  dryRun?: boolean;
  noMutation?: boolean;
}): Promise<SksLoopGraphResult> {
  const routes = input.plan.graph.nodes.flatMap((node) => [routeNarutoLoopWorker(node, 'maker'), routeNarutoLoopWorker(node, 'checker')]);
  const activeWorkerBudget = splitActiveWorkerBudget(input.plan, input.parallelism);
  const loopConcurrencyBudget = computeLoopConcurrencyBudget({ plan: input.plan, parallelism: input.parallelism });
  await writeJsonAtomic(`${loopRoot(input.root, input.plan.mission_id)}/naruto-loop-worker-routes.json`, {
    schema: 'sks.naruto-loop-worker-routes.v1',
    mission_id: input.plan.mission_id,
    active_worker_budget: {
      ...activeWorkerBudget,
      usage_budget_source: loopConcurrencyBudget.usage_budget_source,
      codex_usage_signal: loopConcurrencyBudget.codex_usage_signal
    },
    loop_concurrency_budget: loopConcurrencyBudget,
    routes
  });
  return runLoopPlan({
    root: input.root,
    plan: input.plan,
    parallelism: input.parallelism,
    ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
    ...(input.noMutation === undefined ? {} : { noMutation: input.noMutation })
  });
}

export function splitActiveWorkerBudget(plan: SksLoopPlan, parallelism: 'safe' | 'balanced' | 'extreme'): {
  global_active_workers: number;
  integration_reserved: number;
  per_loop: Array<{ loop_id: string; maker_checker_workers: number }>;
  headroom: number;
} {
  const cap = parallelism === 'safe' ? 8 : parallelism === 'extreme' ? 32 : 16;
  const integrationReserved = 2;
  const nonIntegration = plan.graph.nodes.filter((node) => node.route !== '$Integration');
  const perLoopCap = Math.max(2, Math.floor((cap - integrationReserved) / Math.max(1, nonIntegration.length)));
  const perLoop = nonIntegration.map((node) => ({
    loop_id: node.loop_id,
    maker_checker_workers: Math.min(perLoopCap, node.maker.worker_count + node.checker.worker_count)
  }));
  const used = perLoop.reduce((sum, row) => sum + row.maker_checker_workers, integrationReserved);
  return {
    global_active_workers: cap,
    integration_reserved: integrationReserved,
    per_loop: perLoop,
    headroom: Math.max(0, cap - used)
  };
}
