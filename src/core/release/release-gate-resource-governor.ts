import os from 'node:os'
import type { ReleaseGateNode, ReleaseGateResourceClass } from './release-gate-node.js'

export type ReleaseGateBudget = Record<ReleaseGateResourceClass, number>

export function defaultReleaseGateBudget(): ReleaseGateBudget {
  const cores = Math.max(1, os.cpus().length || 1)
  return {
    'cpu-light': Math.min(32, cores * 4),
    'cpu-heavy': Math.max(1, cores - 1),
    'io-light': Math.min(64, cores * 8),
    'io-heavy': Math.min(8, cores),
    git: Math.min(8, cores),
    'git-worktree': Math.min(6, cores),
    python: Math.min(8, cores),
    network: 8,
    'zellij-real': 1,
    'local-llm-real': Math.max(1, Number(process.env.SKS_LOCAL_LLM_MAX_PARALLEL || 1)),
    'remote-model-real': 4,
    'global-config': 1,
    publish: 1,
    'fs-read': Math.min(64, cores * 8)
  }
}

export function summarizeReleaseGateBudget(budget: ReleaseGateBudget = defaultReleaseGateBudget()): string {
  return Object.entries(budget)
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${resource}=${value}`)
    .join(' ')
}

export function countReleaseGateResources(running: ReleaseGateNode[]): Partial<Record<ReleaseGateResourceClass, number>> {
  return usedResources(running)
}

export function pickLaunchableReleaseGates(input: {
  ready: ReleaseGateNode[]
  running: ReleaseGateNode[]
  budget?: ReleaseGateBudget
}): ReleaseGateNode[] {
  const budget = input.budget || defaultReleaseGateBudget()
  const used = usedResources(input.running)
  const launchable: ReleaseGateNode[] = []
  for (const gate of input.ready) {
    if (fits(gate, used, budget)) {
      launchable.push(gate)
      for (const resource of gate.resource) used[resource] = (used[resource] || 0) + 1
    }
  }
  return launchable
}

function usedResources(running: ReleaseGateNode[]): Partial<Record<ReleaseGateResourceClass, number>> {
  const used: Partial<Record<ReleaseGateResourceClass, number>> = {}
  for (const gate of running) {
    for (const resource of gate.resource) used[resource] = (used[resource] || 0) + 1
  }
  return used
}

function fits(gate: ReleaseGateNode, used: Partial<Record<ReleaseGateResourceClass, number>>, budget: ReleaseGateBudget): boolean {
  return gate.resource.every((resource) => (used[resource] || 0) < budget[resource])
}
