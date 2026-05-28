import path from 'node:path'
import type { VerificationTask } from './verification-result.js'

export interface VerificationDag {
  schema: 'sks.verification-dag.v1'
  tasks: VerificationTask[]
}

export function buildVerificationDag(tasks: VerificationTask[]): VerificationDag {
  validateVerificationDag({ schema: 'sks.verification-dag.v1', tasks })
  return { schema: 'sks.verification-dag.v1', tasks }
}

export function validateVerificationDag(dag: VerificationDag): void {
  const ids = new Set<string>()
  for (const task of dag.tasks) {
    if (!task.id) throw new Error('verification task missing id')
    if (ids.has(task.id)) throw new Error(`duplicate verification task id: ${task.id}`)
    ids.add(task.id)
  }
  for (const task of dag.tasks) {
    for (const dep of task.dependencies || []) {
      if (!ids.has(dep)) throw new Error(`verification task ${task.id} depends on missing ${dep}`)
    }
  }
  assertNoCycles(dag.tasks)
  assertNoParallelOutputConflicts(dag.tasks)
}

export function readyVerificationTasks(tasks: VerificationTask[], completed: Set<string>, running: Set<string>): VerificationTask[] {
  return tasks.filter((task) => {
    if (completed.has(task.id) || running.has(task.id)) return false
    return (task.dependencies || []).every((dep) => completed.has(dep))
  })
}

function assertNoCycles(tasks: VerificationTask[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`verification DAG cycle at ${id}`)
    visiting.add(id)
    for (const dep of byId.get(id)?.dependencies || []) visit(dep)
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
}

function assertNoParallelOutputConflicts(tasks: VerificationTask[]): void {
  const outputOwners = new Map<string, string>()
  for (const task of tasks) {
    for (const output of task.outputs || []) {
      const normalized = normalizeVerificationOutput(output, task.cwd)
      const owner = outputOwners.get(normalized)
      if (!owner) {
        outputOwners.set(normalized, task.id)
        continue
      }
      const taskDepends = dependsTransitively(task.id, owner, tasks)
      const ownerDepends = dependsTransitively(owner, task.id, tasks)
      if (!taskDepends && !ownerDepends) {
        throw new Error(`parallel output conflict: ${normalized} written by ${owner} and ${task.id}`)
      }
    }
  }
}

export function normalizeVerificationOutput(output: string, cwd: string = process.cwd()): string {
  const resolved = path.resolve(cwd, output)
  const root = path.resolve(cwd)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`verification output escapes cwd: ${output}`)
  return resolved
}

function dependsTransitively(taskId: string, dependencyId: string, tasks: VerificationTask[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const seen = new Set<string>()
  const visit = (id: string): boolean => {
    if (seen.has(id)) return false
    seen.add(id)
    const task = byId.get(id)
    for (const dep of task?.dependencies || []) {
      if (dep === dependencyId || visit(dep)) return true
    }
    return false
  }
  return visit(taskId)
}
