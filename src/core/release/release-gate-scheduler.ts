import type { ReleaseGateNode } from './release-gate-node.js'
import { defaultReleaseGateBudget, pickLaunchableReleaseGates } from './release-gate-resource-governor.js'

export function findReadyReleaseGateNodes(input: {
  pending: Map<string, ReleaseGateNode>
  completed: Map<string, unknown>
  failed: Map<string, unknown>
  satisfiedDeps?: Set<string>
}): ReleaseGateNode[] {
  const satisfiedDeps = input.satisfiedDeps || new Set<string>()
  return [...input.pending.values()].filter((gate) => gate.deps.every((dep) => input.completed.has(dep) || satisfiedDeps.has(dep)) && !gate.deps.some((dep) => input.failed.has(dep)))
}

export function findReleaseGatesBlockedByFailedDeps(input: {
  pending: Map<string, ReleaseGateNode>
  failed: Map<string, unknown>
}): ReleaseGateNode[] {
  return [...input.pending.values()].filter((gate) => gate.deps.some((dep) => input.failed.has(dep)))
}

export function pickReadyLaunchableReleaseGates(input: {
  ready: ReleaseGateNode[]
  running: ReleaseGateNode[]
}) {
  return pickLaunchableReleaseGates({
    ready: input.ready,
    running: input.running,
    budget: defaultReleaseGateBudget()
  })
}
