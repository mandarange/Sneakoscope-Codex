import os from 'node:os'
import type { ReleaseGateNode, ReleaseGateResourceClass } from './release-gate-node.js'

export type ReleaseGateBudget = Record<ReleaseGateResourceClass, number>
const EXCLUSIVE_RESOURCES = new Set<ReleaseGateResourceClass>(['timing-sensitive'])

export function defaultReleaseGateBudget(): ReleaseGateBudget {
  const cores = Math.max(1, os.cpus().length || 1)
  const base: ReleaseGateBudget = {
    'cpu-light': Math.min(24, cores * 3),
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
    'fs-read': Math.min(96, cores * 10),
    'timing-sensitive': 1
  }
  for (const key of Object.keys(base) as ReleaseGateResourceClass[]) {
    const envName = `SKS_RELEASE_MAX_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
    base[key] = envInt(envName, base[key], { max: base[key] })
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
  if (input.running.some(isExclusiveGate)) return []
  const used = usedResources(input.running)
  const launchable: ReleaseGateNode[] = []
  const maxTotal = envInt('SKS_RELEASE_MAX_TOTAL', defaultReleaseGateMaxTotal(), { max: defaultReleaseGateMaxTotal() })
  for (const gate of input.ready) {
    if (input.running.length + launchable.length >= maxTotal) break
    const exclusive = isExclusiveGate(gate)
    if (exclusive && (input.running.length > 0 || launchable.length > 0)) continue
    if (!exclusive && launchable.some(isExclusiveGate)) continue
    if (fits(gate, used, budget)) {
      launchable.push(gate)
      for (const resource of gate.resource) used[resource] = (used[resource] || 0) + 1
      if (exclusive) break
    }
  }
  return launchable
}

export function defaultReleaseGateMaxTotal(): number {
  const cores = Math.max(1, os.cpus().length || 1)
  return Math.max(8, Math.min(32, cores * 3))
}

function envInt(name: string, fallback: number, opts: { max?: number } = {}) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  const value = Math.floor(parsed)
  return typeof opts.max === 'number' ? Math.min(value, opts.max) : value
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

function isExclusiveGate(gate: ReleaseGateNode): boolean {
  return gate.resource.some((resource) => EXCLUSIVE_RESOURCES.has(resource))
}
