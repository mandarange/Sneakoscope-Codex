import path from 'node:path'
import { writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import type { ParallelVerificationResult } from './verification-result.js'

export async function writeParallelVerificationProof(
  reportRoot: string,
  result: ParallelVerificationResult
): Promise<{ json: string; markdown: string }> {
  const json = path.join(reportRoot, 'release-parallel-report.json')
  const markdown = path.join(reportRoot, 'release-parallel-report.md')
  await writeJsonAtomic(json, result)
  await writeTextAtomic(markdown, renderParallelVerificationReport(result))
  return { json, markdown }
}

export function renderParallelVerificationReport(result: ParallelVerificationResult): string {
  const rows = result.results.map((task) =>
    `| ${task.id} | ${task.skipped ? 'skipped' : task.ok ? 'passed' : 'failed'} | ${task.duration_ms} | ${task.exit_code ?? 'null'} | ${task.stdout_log || task.stdout_log_summary || ''} | ${task.stderr_log || task.stderr_log_summary || ''} |`
  )
  return [
    '# Parallel Verification Report',
    '',
    `- Status: ${result.ok ? 'passed' : 'failed'}`,
    `- Tasks: ${result.task_count}`,
    `- Passed: ${result.passed}`,
    `- Failed: ${result.failed}`,
    `- Skipped: ${result.skipped}`,
    '',
    '| Task | Status | Duration ms | Exit | Stdout | Stderr |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}
