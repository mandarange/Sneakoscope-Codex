import type { NarutoWorkItem } from './naruto-work-item.js'
import { extractNarutoTaskHints, pathPrefix, type NarutoTaskHints } from './naruto-task-hints.js'

export interface NarutoAllocationWorker {
  id: string
  role?: string | null
  primary_role?: string | null
  declared_roles?: string[]
  lane?: string | null
}

export interface NarutoAllocationDecision {
  owner: string
  score: number
  reason: string
  hints: NarutoTaskHints
}

export interface NarutoAssignmentState {
  task_id: string
  owner: string
  role?: string | null
  paths?: string[]
  domains?: string[]
  write_paths?: string[]
}

export interface NarutoLeaseState {
  active_write_paths?: string[]
  completed_task_ids?: string[]
}

export function chooseNarutoTaskOwner(
  task: NarutoWorkItem,
  workers: NarutoAllocationWorker[],
  currentAssignments: NarutoAssignmentState[] = [],
  leaseState: NarutoLeaseState = {}
): NarutoAllocationDecision {
  if (!workers.length) throw new Error('at least one Naruto worker is required')
  const hints = extractNarutoTaskHints(task)
  const activeWritePaths = new Set((leaseState.active_write_paths || []).map(String))
  const completedTaskIds = new Set((leaseState.completed_task_ids || []).map(String))
  const writeConflict = hints.writePaths.some((file) => activeWritePaths.has(file))
  const dependencyIncomplete = task.dependencies.some((dep) => !completedTaskIds.has(dep))
  const ranked = workers.map((worker, index) => {
    const assigned = currentAssignments.filter((row) => row.owner === worker.id)
    const assignedHints = assigned.map((row) => ({
      role: row.role || null,
      paths: row.paths || [],
      domains: row.domains || [],
      writePaths: row.write_paths || []
    }))
    const primaryRole = worker.primary_role || worker.role || null
    const declaredRoles = new Set([worker.role, ...(worker.declared_roles || [])].filter(Boolean).map(String))
    const primaryRoleMatches = Boolean(hints.role && primaryRole === hints.role)
    const declaredRoleMatches = Boolean(hints.role && declaredRoles.has(hints.role))
    const assignmentRoleMatches = Boolean(hints.role && assigned.some((row) => row.role === hints.role))
    const sameLane = samePathLane(hints.paths, assignedHints.flatMap((row) => row.paths))
    const overlap = overlapCount(hints.paths, assignedHints.flatMap((row) => row.paths))
      + overlapCount(hints.domains, assignedHints.flatMap((row) => row.domains))
    const laneMatches = Boolean(worker.lane && hints.paths.some((file) => pathLaneMatches(file, String(worker.lane))))
    const score = dependencyIncomplete
      ? Number.NEGATIVE_INFINITY
      : (primaryRoleMatches ? 18 : 0)
        + (declaredRoleMatches ? 12 : 0)
        + (sameLane || laneMatches ? 12 : 0)
        + (overlap * 4)
        - (assigned.length * 4)
        - (writeConflict ? 20 : 0)
    return { worker, index, assigned, score, overlap, primaryRoleMatches, declaredRoleMatches, assignmentRoleMatches, sameLane: sameLane || laneMatches, writeConflict, dependencyIncomplete }
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    if (right.overlap !== left.overlap) return right.overlap - left.overlap
    if (left.assigned.length !== right.assigned.length) return left.assigned.length - right.assigned.length
    return left.index - right.index
  })
  const selected = ranked[0]!
  const reasons = [
    selected.primaryRoleMatches ? 'same primary role' : null,
    selected.declaredRoleMatches ? 'same declared role' : null,
    selected.assignmentRoleMatches ? 'same assigned role history' : null,
    selected.sameLane ? 'same path/domain lane' : null,
    selected.overlap ? `overlap:${selected.overlap}` : null,
    selected.writeConflict ? 'write lease conflict penalty applied' : null,
    selected.dependencyIncomplete ? 'dependency incomplete' : null,
    `load:${selected.assigned.length}`
  ].filter(Boolean)
  return {
    owner: selected.worker.id,
    score: selected.score,
    reason: reasons.join('; '),
    hints
  }
}

export function allocateNarutoTasksToWorkers(tasks: NarutoWorkItem[], workers: NarutoAllocationWorker[]) {
  const assignments: Array<NarutoWorkItem & { owner: string; allocation_reason: string; allocation_score: number; hints: NarutoTaskHints }> = []
  for (const task of tasks) {
    const decision = chooseNarutoTaskOwner(task, workers, assignments.map((row) => ({
      task_id: row.id,
      owner: row.owner,
      role: row.required_role,
      paths: row.hints.paths,
      domains: row.hints.domains,
      write_paths: row.hints.writePaths
    })), {
      active_write_paths: assignments.flatMap((row) => row.hints.writePaths)
    })
    assignments.push({
      ...task,
      owner: decision.owner,
      allocation_reason: decision.reason,
      allocation_score: decision.score,
      hints: decision.hints
    })
  }
  return assignments
}

function samePathLane(left: string[], right: string[]) {
  const prefixes = new Set(right.map(pathPrefix).filter(Boolean))
  return left.some((file) => prefixes.has(pathPrefix(file)))
}

function pathLaneMatches(file: string, lane: string) {
  const normalizedLane = lane.replace(/^\.\/+/, '').replace(/\/+$/, '')
  const normalizedFile = file.replace(/^\.\/+/, '')
  return pathPrefix(normalizedFile) === normalizedLane || normalizedFile === normalizedLane || normalizedFile.startsWith(`${normalizedLane}/`)
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter((item) => rightSet.has(item)).length
}
