import type { NarutoWorkItem } from './naruto-work-item.js'
import { chooseNarutoTaskOwner, type NarutoAllocationWorker, type NarutoAssignmentState } from './naruto-allocation-policy.js'

export interface NarutoRebalanceWorker extends NarutoAllocationWorker {
  alive: boolean
  state: 'idle' | 'done' | 'unknown' | 'running' | 'failed' | 'blocked'
}

export interface NarutoRebalanceDecision {
  type: 'assign'
  task_id: string
  worker_id: string
  reason: string
}

export function rebalanceNarutoReadyWork(input: {
  tasks: Array<NarutoWorkItem & { owner?: string | null; status?: string | null }>
  workers: NarutoRebalanceWorker[]
  completedTaskIds?: string[]
  reclaimedTaskIds?: string[]
  currentAssignments?: NarutoAssignmentState[]
  activeWritePaths?: string[]
}) {
  const completed = new Set((input.completedTaskIds || []).map(String))
  const reclaimed = new Set((input.reclaimedTaskIds || []).map(String))
  const idle = input.workers.filter((worker) => worker.alive && ['idle', 'done', 'unknown'].includes(worker.state))
  const activeWorkerIds = new Set(input.workers.filter((worker) => worker.alive).map((worker) => worker.id))
  const activeWritePaths = new Set([...(input.activeWritePaths || []), ...(input.currentAssignments || []).flatMap((row) => row.write_paths || [])].map(normalizePath))
  if (!idle.length) return [] as NarutoRebalanceDecision[]
  const ready = input.tasks
    .filter((task) => (task.status || 'pending') === 'pending')
    .filter((task) => task.dependencies.every((dep) => completed.has(dep)))
    .filter((task) => task.write_paths.every((file) => !activeWritePaths.has(normalizePath(file))))
    .sort((left, right) => {
      const reclaimedOrder = Number(!reclaimed.has(left.id)) - Number(!reclaimed.has(right.id))
      return reclaimedOrder || left.id.localeCompare(right.id)
    })
  const decisions: NarutoRebalanceDecision[] = []
  const assignments = [...(input.currentAssignments || [])]
  for (const task of ready) {
    const requestedOwner = task.owner ? String(task.owner) : ''
    const ownerActive = requestedOwner && activeWorkerIds.has(requestedOwner)
    const ownerIdle = ownerActive ? idle.some((worker) => worker.id === requestedOwner) : false
    if (requestedOwner && ownerActive && !ownerIdle) continue
    const candidateWorkers = ownerIdle ? idle.filter((worker) => worker.id === requestedOwner) : idle
    const decision = chooseNarutoTaskOwner({ ...task, owner: null }, candidateWorkers, assignments)
    decisions.push({
      type: 'assign',
      task_id: task.id,
      worker_id: decision.owner,
      reason: `${reclaimed.has(task.id) ? 'reclaimed ready work' : requestedOwner && !ownerActive ? `owner inactive:${requestedOwner}` : 'idle worker pickup'}; ${decision.reason}`
    })
    assignments.push({
      task_id: task.id,
      owner: decision.owner,
      role: task.required_role,
      paths: decision.hints.paths,
      domains: decision.hints.domains,
      write_paths: decision.hints.writePaths
    })
  }
  return decisions
}

function normalizePath(file: string) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
}
