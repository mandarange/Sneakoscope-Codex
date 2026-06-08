import os from 'node:os'
import type { ReleaseGateNode, ReleaseGateResourceClass } from './release-gate-node.js'

export type ReleaseGateBudget = Record<ReleaseGateResourceClass, number>

export function defaultReleaseGateBudget(): ReleaseGateBudget {
  const cores = Math.max(1, os.cpus().length || 1)
  const base: ReleaseGateBudget = {
    'cpu-light': Math.min(48, cores * 6),
    'cpu-heavy': Math.max(1, cores),
    'io-light': Math.min(96, cores * 10),
    'io-heavy': Math.min(12, Math.max(1, cores)),
    git: Math.min(12, Math.max(1, cores)),
    'git-worktree': Math.min(8, Math.max(1, cores)),
    python: Math.min(12, Math.max(1, cores)),
    network: 12,
    'zellij-real': 1,
    'local-llm-real': Math.max(1, Number(process.env.SKS_LOCAL_LLM_MAX_PARALLEL || 1)),
    'remote-model-real': 6,
    'global-config': 1,
    publish: 1,
    'fs-read': Math.min(96, cores * 10)
  }
  for (const key of Object.keys(base) as ReleaseGateResourceClass[]) {
    const envName = `SKS_RELEASE_MAX_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
    base[key] = envInt(envName, base[key])
  }
  return base
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
  const maxTotal = envInt('SKS_RELEASE_MAX_TOTAL', Number.POSITIVE_INFINITY)
  for (const gate of input.ready) {
    if (input.running.length + launchable.length >= maxTotal) break
    if (fits(gate, used, budget)) {
      launchable.push(gate)
      for (const resource of gate.resource) used[resource] = (used[resource] || 0) + 1
    }
  }
  return launchable
}

function envInt(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
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
