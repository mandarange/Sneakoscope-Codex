import { nowIso } from '../fsx.js'

export interface VerificationTask {
  id: string
  command: string
  cwd?: string
  env?: Record<string, string>
  inputs?: string[]
  outputs?: string[]
  dependencies?: string[]
  timeout_ms?: number
  read_only?: boolean
}

export interface VerificationTaskResult {
  schema: 'sks.parallel-verification-task-result.v1'
  id: string
  ok: boolean
  command: string
  started_at: string
  finished_at: string
  duration_ms: number
  exit_code: number | null
  stdout_log?: string
  stderr_log?: string
  stdout_log_summary?: string
  stderr_log_summary?: string
  stdout_tail?: string
  stderr_tail?: string
  stdout_log_removed_after_summary?: boolean
  stderr_log_removed_after_summary?: boolean
  skipped?: boolean
  error?: string
}

export interface ParallelVerificationResult {
  schema: 'sks.parallel-verification-result.v1'
  generated_at: string
  ok: boolean
  task_count: number
  passed: number
  failed: number
  skipped: number
  dag_schema?: 'sks.verification-dag.v1'
  dependency_count?: number
  results: VerificationTaskResult[]
  blockers: string[]
}

export function emptyParallelVerificationResult(results: VerificationTaskResult[] = [], totalTaskCount = results.length): ParallelVerificationResult {
  const skipped = results.filter((result) => result.skipped)
  const failed = results.filter((result) => !result.ok && !result.skipped)
  return {
    schema: 'sks.parallel-verification-result.v1',
    generated_at: nowIso(),
    ok: failed.length === 0 && skipped.length === 0,
    task_count: totalTaskCount,
    passed: results.filter((result) => result.ok && !result.skipped).length,
    failed: failed.length,
    skipped: skipped.length,
    results,
    blockers: [
      ...failed.map((result) => `verification_failed:${result.id}`),
      ...skipped.map((result) => `verification_skipped:${result.id}`),
    ],
  }
}
