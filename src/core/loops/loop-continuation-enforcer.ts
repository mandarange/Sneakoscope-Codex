// @ts-nocheck
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { loopPlanPath } from './loop-artifacts.js'

export async function evaluateLoopContinuation(input: {
  root: string
  missionId: string
  maxContinuationTurns?: number
}): Promise<any> {
  const root = path.resolve(input.root || process.cwd())
  const plan = await readJson(loopPlanPath(root, input.missionId), null)
  const blockers: string[] = []
  if (!plan) blockers.push('loop_plan_missing')
  const nodes = plan?.graph?.nodes || []
  const proofs = await Promise.all(nodes.map((node: any) => readJson(path.join(root, '.sneakoscope', 'missions', input.missionId, 'loops', node.loop_id, 'loop-proof.json'), null)))
  const completed = proofs.filter((proof: any) => proof?.status === 'completed').length
  const incomplete = Math.max(0, nodes.length - completed)
  const shouldContinue = Boolean(plan && incomplete > 0 && blockers.length === 0)
  const report = {
    schema: 'sks.loop-continuation-enforcer.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: input.missionId,
    nodes: nodes.length,
    completed,
    incomplete,
    max_continuation_turns: input.maxContinuationTurns || 3,
    should_continue: shouldContinue,
    resume_instruction: shouldContinue ? `sks loop resume ${input.missionId}` : null,
    blockers
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'missions', input.missionId, 'loop-continuation-enforcer.json'), report).catch(() => undefined)
  return report
}
