import fs from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export interface RetentionBudgetReport {
  schema: 'sks.retention-budget.v1'
  ok: boolean
  generated_at: string
  budgets: Array<{ path: string; bytes: number; max_bytes: number; ok: boolean }>
  oversized_jsonl: Array<{ path: string; bytes: number; max_bytes: number }>
  blockers: string[]
}

const DEFAULT_BUDGETS = [
  { path: '.sneakoscope/state', max_bytes: 50 * 1024 * 1024 },
  { path: '.sneakoscope/cache', max_bytes: 250 * 1024 * 1024 },
  { path: '.sneakoscope/cache/super-search', max_bytes: 100 * 1024 * 1024 }
]

export async function runRetentionBudget(root: string): Promise<RetentionBudgetReport> {
  const budgets = []
  const blockers: string[] = []
  for (const budget of DEFAULT_BUDGETS) {
    const bytes = await sizeOf(path.join(root, budget.path))
    const ok = bytes <= budget.max_bytes
    budgets.push({ path: budget.path, bytes, max_bytes: budget.max_bytes, ok })
    if (!ok) blockers.push(`retention_budget_exceeded:${budget.path}`)
  }
  const oversizedJsonl = await findOversizedJsonl(path.join(root, '.sneakoscope', 'missions'), 10 * 1024 * 1024)
  for (const row of oversizedJsonl) blockers.push(`jsonl_budget_exceeded:${row.path}`)
  const report: RetentionBudgetReport = {
    schema: 'sks.retention-budget.v1',
    ok: blockers.length === 0,
    generated_at: new Date().toISOString(),
    budgets,
    oversized_jsonl: oversizedJsonl,
    blockers
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'retention-budget.json'), report)
  return report
}

async function sizeOf(file: string): Promise<number> {
  const stat = await fs.stat(file).catch(() => null)
  if (!stat) return 0
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0
  const entries = await fs.readdir(file, { withFileTypes: true }).catch(() => [])
  let total = 0
  for (const entry of entries) total += await sizeOf(path.join(file, entry.name))
  return total
}

async function findOversizedJsonl(dir: string, maxBytes: number): Promise<Array<{ path: string; bytes: number; max_bytes: number }>> {
  const out: Array<{ path: string; bytes: number; max_bytes: number }> = []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await findOversizedJsonl(child, maxBytes))
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const stat = await fs.stat(child).catch(() => null)
      if (stat && stat.size > maxBytes) out.push({ path: child, bytes: stat.size, max_bytes: maxBytes })
    }
  }
  return out
}
