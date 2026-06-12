import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { planLoopsFromRequest } from './loop-planner.js';
import type { SksLoopPlan } from './loop-schema.js';

export async function compileGoalToLoopPlan(input: {
  root: string;
  missionId: string;
  goalText: string;
  legacyGoalOptions: unknown;
}): Promise<SksLoopPlan> {
  const plan = await planLoopsFromRequest({
    root: input.root,
    missionId: input.missionId,
    request: input.goalText,
    sourceCommand: 'goal'
  });
  await writeJsonAtomic(path.join(input.root, '.sneakoscope', 'missions', input.missionId, 'goal-compat.json'), {
    schema: 'sks.goal-loop-compat.v1',
    legacy_goal_text: input.goalText,
    legacy_goal_options: input.legacyGoalOptions,
    loop_plan_path: `.sneakoscope/missions/${input.missionId}/loops/loop-plan.json`,
    loop_graph_proof_path: `.sneakoscope/missions/${input.missionId}/loops/loop-graph-proof.json`,
    runtime: 'loop-graph',
    compat_mode: true,
    generated_at: new Date().toISOString()
  });
  return plan;
}
