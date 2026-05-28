import path from 'node:path'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { runAdhdOrchestratingGate, type AdhdOrchestratingGateArtifact, type MicroWinTask } from './adhd-orchestrating-gate.js'

export const STRATEGY_COMPILER_SCHEMA = 'sks.strategy-compiler.v1'
export const PARALLEL_MODIFICATION_PLAN_SCHEMA = 'sks.parallel-modification-plan.v1'
export const FILE_OWNERSHIP_PLAN_SCHEMA = 'sks.file-ownership-plan.v1'
export const VERIFICATION_ROLLBACK_DAG_SCHEMA = 'sks.verification-rollback-dag.v1'

export interface StrategyCompileResult {
  schema: typeof STRATEGY_COMPILER_SCHEMA
  generated_at: string
  ok: boolean
  prompt_hash: string
  route: string
  gate: AdhdOrchestratingGateArtifact
  parallel_modification_plan: {
    schema: typeof PARALLEL_MODIFICATION_PLAN_SCHEMA
    can_parallelize_writes: boolean
    batches: Array<{ batch_id: string; task_ids: string[]; write_paths: string[] }>
    serial_conflicts: Array<{ path: string; task_ids: string[] }>
    wall_clock_parallel_evidence: string[]
  }
  file_ownership_plan: {
    schema: typeof FILE_OWNERSHIP_PLAN_SCHEMA
    owners: Array<{ path: string; owner_agent: string; owner_persona: string; task_id: string; micro_win_id: string; access: 'write' | 'read'; protected_path_check: { ok: boolean; blockers: string[] }; conflict_prediction_id: string | null; verification_node_id: string | null; rollback_node_id: string | null }>
    protected_write_paths: string[]
    no_overlap: boolean
  }
  verification_rollback_dag: {
    schema: typeof VERIFICATION_ROLLBACK_DAG_SCHEMA
    nodes: Array<{ id: string; kind: string; depends_on: string[]; proof_artifact: string }>
    rollback_ready: boolean
  }
  blockers: string[]
}

export function compileStrategy(input: {
  prompt: string
  route?: string
  writeTargets?: string[]
  readonlyTargets?: string[]
  agentCount?: number
  visualRequired?: boolean
}): StrategyCompileResult {
  const route = String(input.route || '$Agent')
  const gate = runAdhdOrchestratingGate({
    prompt: input.prompt,
    route,
    ...(input.writeTargets === undefined ? {} : { writeTargets: input.writeTargets }),
    ...(input.readonlyTargets === undefined ? {} : { readonlyTargets: input.readonlyTargets }),
    ...(input.agentCount === undefined ? {} : { agentCount: input.agentCount }),
    ...(input.visualRequired === undefined ? {} : { visualRequired: input.visualRequired })
  })
  const ownership = buildOwnershipPlan(gate.micro_wins)
  const parallel = buildParallelModificationPlan(gate.micro_wins)
  const dag = buildVerificationRollbackDag(gate.micro_wins)
  const blockers = [
    ...gate.blockers,
    ...(ownership.no_overlap ? [] : ['file_ownership_overlap']),
    ...parallel.serial_conflicts.map((conflict) => `serial_conflict:${conflict.path}`),
    ...(dag.rollback_ready ? [] : ['rollback_node_missing'])
  ]
  return {
    schema: STRATEGY_COMPILER_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    prompt_hash: sha256(input.prompt || '').slice(0, 16),
    route,
    gate,
    parallel_modification_plan: parallel,
    file_ownership_plan: ownership,
    verification_rollback_dag: dag,
    blockers
  }
}

export async function writeStrategyCompilerArtifacts(root: string, compiled: StrategyCompileResult) {
  await writeJsonAtomic(path.join(root, 'user-request-strategy.json'), compiled)
  await writeJsonAtomic(path.join(root, 'parallel-modification-plan.json'), compiled.parallel_modification_plan)
  await writeJsonAtomic(path.join(root, 'file-ownership-plan.json'), compiled.file_ownership_plan)
  await writeJsonAtomic(path.join(root, 'verification-rollback-dag.json'), compiled.verification_rollback_dag)
  return compiled
}

function buildOwnershipPlan(tasks: MicroWinTask[]): StrategyCompileResult['file_ownership_plan'] {
  const owners: StrategyCompileResult['file_ownership_plan']['owners'] = []
  const protectedWritePaths: string[] = []
  const verificationNodeId = tasks.find((task) => task.kind === 'verification')?.id || null
  const rollbackNodeId = tasks.find((task) => task.kind === 'rollback')?.id || null
  const writeConflicts = findWriteConflicts(tasks.filter((task) => task.kind === 'write'))
  for (const task of tasks) {
    for (const file of task.write_paths) {
      const protectedPath = isProtectedPath(file)
      if (protectedPath) protectedWritePaths.push(file)
      owners.push({
        path: file,
        owner_agent: task.owner_agent,
        owner_persona: task.owner_persona,
        task_id: task.id,
        micro_win_id: task.id,
        access: 'write',
        protected_path_check: { ok: !protectedPath, blockers: protectedPath ? [`protected_write:${file}`] : [] },
        conflict_prediction_id: writeConflicts.find((conflict) => conflict.task_ids.includes(task.id))?.path || null,
        verification_node_id: verificationNodeId,
        rollback_node_id: rollbackNodeId
      })
    }
    for (const file of task.readonly_paths) owners.push({
      path: file,
      owner_agent: task.owner_agent,
      owner_persona: task.owner_persona,
      task_id: task.id,
      micro_win_id: task.id,
      access: 'read',
      protected_path_check: { ok: true, blockers: [] },
      conflict_prediction_id: null,
      verification_node_id: verificationNodeId,
      rollback_node_id: rollbackNodeId
    })
  }
  const writeOwners = owners.filter((owner) => owner.access === 'write')
  const noOverlap = protectedWritePaths.length === 0 && writeOwners.every((owner, index) => {
    return writeOwners.every((other, otherIndex) => index === otherIndex || !pathsOverlap(owner.path, other.path))
  })
  return {
    schema: FILE_OWNERSHIP_PLAN_SCHEMA,
    owners,
    protected_write_paths: [...new Set(protectedWritePaths)].sort(),
    no_overlap: noOverlap
  }
}

function buildParallelModificationPlan(tasks: MicroWinTask[]): StrategyCompileResult['parallel_modification_plan'] {
  const writeTasks = tasks.filter((task) => task.kind === 'write')
  const conflicts = findWriteConflicts(writeTasks)
  const conflictTaskIds = new Set(conflicts.flatMap((conflict) => conflict.task_ids))
  const parallelTasks = writeTasks.filter((task) => !conflictTaskIds.has(task.id))
  const batches: StrategyCompileResult['parallel_modification_plan']['batches'] = parallelTasks.length
    ? [{ batch_id: 'batch-001', task_ids: parallelTasks.map((task) => task.id), write_paths: parallelTasks.flatMap((task) => task.write_paths) }]
    : []
  return {
    schema: PARALLEL_MODIFICATION_PLAN_SCHEMA,
    can_parallelize_writes: batches.length > 0 && conflicts.length === 0,
    batches,
    serial_conflicts: conflicts,
    wall_clock_parallel_evidence: batches.map((batch) => `${batch.batch_id}:${batch.task_ids.length}_independent_write_tasks`)
  }
}

function buildVerificationRollbackDag(tasks: MicroWinTask[]): StrategyCompileResult['verification_rollback_dag'] {
  const nodes = tasks.map((task) => ({
    id: task.id,
    kind: task.kind,
    depends_on: task.dependencies,
    proof_artifact: task.proof_artifact
  }))
  return {
    schema: VERIFICATION_ROLLBACK_DAG_SCHEMA,
    nodes,
    rollback_ready: nodes.some((node) => node.kind === 'rollback')
  }
}

function findWriteConflicts(tasks: MicroWinTask[]): Array<{ path: string; task_ids: string[] }> {
  const rows = tasks.flatMap((task) => task.write_paths.map((file) => ({ task, file })))
  const conflicts: Array<{ path: string; task_ids: string[] }> = []
  for (let i = 0; i < rows.length; i += 1) {
    const left = rows[i]
    if (!left) continue
    for (let j = i + 1; j < rows.length; j += 1) {
      const right = rows[j]
      if (!right) continue
      if (!pathsOverlap(left.file, right.file)) continue
      conflicts.push({ path: left.file === right.file ? left.file : `${left.file}<->${right.file}`, task_ids: [left.task.id, right.task.id] })
    }
  }
  return conflicts
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

function isProtectedPath(file: string): boolean {
  return /^(?:\.codex|\.agents\/skills|\.codex\/agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/.test(file)
}
