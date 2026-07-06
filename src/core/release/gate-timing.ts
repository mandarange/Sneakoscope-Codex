import fs from 'node:fs'
import path from 'node:path'
import { runProcess, writeJsonAtomic } from '../fsx.js'

export interface GateTimingReport {
  schema: 'sks.gate-timing.v1'
  ok: boolean
  generated_at: string
  total_ms: number
  slowest_gates: Array<{ id: string; duration_ms: number; cache_hit: boolean }>
  duplicate_builds_detected: boolean
  redundant_gate_groups: Array<{ command: string; gate_ids: string[] }>
  blockers: string[]
  failure_tail?: { stdout: string; stderr: string }
}

export async function runGateTiming(root: string): Promise<GateTimingReport> {
  const started = Date.now()
  const res = await runProcess(process.execPath, ['./dist/scripts/release-gate-dag-runner.js', '--preset', 'affected', '--changed-since', 'auto', '--sla', '5m'], {
    cwd: root,
    timeoutMs: 5 * 60 * 1000,
    maxOutputBytes: 512 * 1024,
    env: {
      SKS_RELEASE_GATE_CACHE_MEMOIZE: '1',
      SKS_DISABLE_NETWORK: '1'
    }
  })
  const totalMs = Date.now() - started
  const blockers: string[] = []
  if (res.code !== 0) blockers.push(`release_gate_dag_exit_${res.code}`)
  if (res.timedOut) blockers.push('release_gate_timing_timeout')
  const summary = latestReleaseSummary(root)
  const slowest = parseSlowestGates(summary, res.stdout)
  const redundantGateGroups = findRedundantBuildGroups(root)
  if (redundantGateGroups.length > 0) blockers.push('duplicate_builds_detected')
  return {
    schema: 'sks.gate-timing.v1',
    ok: blockers.length === 0,
    generated_at: new Date().toISOString(),
    total_ms: totalMs,
    slowest_gates: slowest,
    duplicate_builds_detected: redundantGateGroups.length > 0,
    redundant_gate_groups: redundantGateGroups,
    blockers,
    ...(res.code !== 0 || res.timedOut ? { failure_tail: { stdout: tail(res.stdout), stderr: tail(res.stderr) } } : {})
  }
}

export async function writeGateTiming(root: string): Promise<GateTimingReport> {
  const report = await runGateTiming(root)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'gate-timing.json'), report)
  return report
}

function parseSlowestGates(summary: any, stdout: string): Array<{ id: string; duration_ms: number; cache_hit: boolean }> {
  if (Array.isArray(summary?.slowest_gates)) {
    return summary.slowest_gates.slice(0, 10).map((row: any) => ({
      id: String(row.id || row.gate_id || 'unknown'),
      duration_ms: Math.round(Number(row.duration_ms || 0)),
      cache_hit: Boolean(row.cached ?? row.cache_hit)
    }))
  }
  const rows: Array<{ id: string; duration_ms: number; cache_hit: boolean }> = []
  const text = String(stdout || '')
  for (const match of text.matchAll(/\b([a-z0-9:_-]+)\b[^\n]*?(\d+(?:\.\d+)?)s/gi)) {
    rows.push({ id: match[1] || 'unknown', duration_ms: Math.round(Number(match[2]) * 1000), cache_hit: /cache/i.test(match[0]) })
  }
  return rows.sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10)
}

function latestReleaseSummary(root: string): any {
  const dir = path.join(root, '.sneakoscope', 'reports', 'release-gates')
  if (!fs.existsSync(dir)) return null
  const latest = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, 'summary.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file
  if (!latest) return null
  try {
    return JSON.parse(fs.readFileSync(latest, 'utf8'))
  } catch {
    return null
  }
}

function findRedundantBuildGroups(root: string): Array<{ command: string; gate_ids: string[] }> {
  const manifestFile = path.join(root, 'release-gates.v2.json')
  if (!fs.existsSync(manifestFile)) return []
  let manifest: any
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  } catch {
    return []
  }
  const groups = new Map<string, string[]>()
  for (const gate of Array.isArray(manifest?.gates) ? manifest.gates : []) {
    const command = String(gate.command || '').trim().replace(/\s+/g, ' ')
    if (!/\b(?:npm run build(?::clean|:incremental)?|tsc -p tsconfig\.json)\b/.test(command)) continue
    const ids = groups.get(command) || []
    ids.push(String(gate.id || 'unknown'))
    groups.set(command, ids)
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([command, gate_ids]) => ({ command, gate_ids }))
}

function tail(value: string): string {
  const text = String(value || '')
  return text.length > 4000 ? text.slice(text.length - 4000) : text
}
