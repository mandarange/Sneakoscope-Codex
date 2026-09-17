import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { buildEngineBenchmarkReport, type EngineBenchmarkRow } from './evaluation.js'
import { normalizeExplicitDecisionInput } from './input.js'
import { localDecisionPaths } from './paths.js'
import { evaluateDecisionPolicy, renderAdvisoryContext } from './policy.js'
import { modelEvidenceFromReceipt, readInstallReceipt } from './receipt.js'
import type { DecisionKind, DecisionModelEvidence, DecisionResult } from './types.js'
import { EXIT_FAILURE, EXPLICIT_EVALUATE_TIMEOUT_MS, UsageError, output, type Parsed } from './cli-shared.js'
import { clientFor, readReadiness } from './cli-lifecycle.js'

async function loadJsonFile(file: string): Promise<unknown> {
  let raw: string
  try { raw = await fsp.readFile(file, 'utf8') } catch { throw new UsageError(`cannot read ${file}`) }
  try { return JSON.parse(raw) } catch { throw new UsageError(`invalid JSON in ${file}`) }
}

export async function runEvaluate(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const json = parsed.flags.has('--json')
  const kind = parsed.values.get('--kind')
  const file = parsed.values.get('--input')
  if (kind !== 'planning' && kind !== 'recovery') throw new UsageError('--kind must be planning or recovery')
  if (!file) throw new UsageError('--input <file> is required')
  const timeoutMs = Number(parsed.values.get('--timeout-ms') ?? EXPLICIT_EVALUATE_TIMEOUT_MS)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new UsageError('--timeout-ms must be positive')
  let input
  try { input = normalizeExplicitDecisionInput(await loadJsonFile(file), kind as DecisionKind) } catch (error: unknown) {
    if (error instanceof UsageError) throw error
    throw new UsageError(`invalid input: ${error instanceof Error ? error.message : String(error)}`)
  }
  const paths = localDecisionPaths(env)
  const result = await clientFor(paths, timeoutMs).evaluate(input, new AbortController().signal, timeoutMs)
  const policy = evaluateDecisionPolicy(input, result)
  const advisoryContext = renderAdvisoryContext(policy, input.kind)
  const report = {
    schema: 'sks.local-decision-evaluate.v1',
    ok: result.status !== 'unavailable',
    factsSource: 'user_supplied',
    completionEvidence: false,
    input: { requestId: input.requestId, kind: input.kind, scope: input.scope, facts: input.facts },
    result,
    policy,
    advisoryContext: advisoryContext || null
  }
  output(report, json, () => [
    `result: ${result.status}${result.status !== 'ok' ? ` (${result.reason})` : ''}`,
    ...(result.status === 'ok' ? Object.entries(result.fields).map(([name, value]) => `  ${name}=${value!.value} (top ${Math.max(...value!.choices.map((c) => c.candidateProbability)).toFixed(3)}, margin ${value!.margin.toFixed(3)}, uncalibrated)`) : []),
    `policy: ${policy.action} (${policy.reason})`,
    ...(advisoryContext ? ['', advisoryContext] : [])
  ])
  return result.status === 'unavailable' ? EXIT_FAILURE : 0
}

async function hardwareInfo(): Promise<Record<string, string | number>> {
  const cpus = os.cpus()
  return { platform: process.platform, arch: process.arch, cpuModel: cpus[0]?.model || 'unknown', cpuCount: cpus.length, totalMemoryBytes: os.totalmem(), osRelease: os.release(), node: process.version }
}

async function gitHead(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (chunk) => { out += String(chunk) })
    child.on('error', () => resolve('unknown'))
    child.on('close', () => resolve(out.trim() || 'unknown'))
  })
}

export async function runBenchmark(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const json = parsed.flags.has('--json')
  const datasetPath = parsed.values.get('--dataset')
  const outputDir = parsed.values.get('--output')
  if (!datasetPath || !outputDir) throw new UsageError('--dataset <file> and --output <dir> are required')
  const timeoutMs = Number(parsed.values.get('--timeout-ms') ?? EXPLICIT_EVALUATE_TIMEOUT_MS)
  const raw = await fsp.readFile(datasetPath, 'utf8').catch(() => { throw new UsageError(`cannot read ${datasetPath}`) })
  let dataset: any
  try { dataset = JSON.parse(raw) } catch { throw new UsageError(`invalid JSON in ${datasetPath}`) }
  if (!dataset || dataset.schemaVersion !== 1 || !Array.isArray(dataset.items) || (dataset.kind !== 'planning' && dataset.kind !== 'recovery')) {
    throw new UsageError('dataset must be {schemaVersion:1, kind:"planning"|"recovery", items:[{id, summary, facts?, expected?}]}')
  }
  const paths = localDecisionPaths(env)
  const client = clientFor(paths, timeoutMs)
  const readiness = await readReadiness(paths)
  const found = await readInstallReceipt(paths).catch(() => null)
  const modelEvidence: DecisionModelEvidence | null = found ? modelEvidenceFromReceipt(found.receipt) : null
  const realModelVerified = Boolean(readiness && readiness.real_model_verified === true && found && readiness.receipt_digest === found.digest)
  await fsp.mkdir(outputDir, { recursive: true })
  const rows: EngineBenchmarkRow[] = []
  const rowsPath = path.join(outputDir, 'rows.jsonl')
  await fsp.writeFile(rowsPath, '')
  for (const item of dataset.items) {
    const input = normalizeExplicitDecisionInput({ requestId: `bench-${String(item.id)}`, summary: item.summary, facts: item.facts }, dataset.kind)
    const started = process.hrtime.bigint()
    const result: DecisionResult = await client.evaluate(input, new AbortController().signal, timeoutMs)
    const wallClockMs = Number(process.hrtime.bigint() - started) / 1e6
    const expected = item.expected && typeof item.expected === 'object' ? item.expected : null
    rows.push({ requestId: input.requestId, expected, result, wallClockMs })
    await fsp.appendFile(rowsPath, `${JSON.stringify({ id: item.id, requestId: input.requestId, facts: input.facts, expected, result, wallClockMs })}\n`)
  }
  const head = await gitHead()
  const report = buildEngineBenchmarkReport({
    baselineHead: head, candidateHead: head, datasetDigest: sha256(raw), rows,
    hardware: await hardwareInfo(), modelEvidence, realModelVerified, rawReceiptPaths: [rowsPath]
  })
  const reportPath = path.join(outputDir, 'engine-benchmark-report.json')
  await writeJsonAtomic(reportPath, { ...report, generatedAt: nowIso(), notes: ['engine benchmark only: no claim about end-to-end SKS wall-clock or remote token savings'] })
  const unavailable = rows.filter((row) => row.result.status === 'unavailable').length
  output({ schema: 'sks.local-decision-benchmark.v1', ok: unavailable === 0, reportPath, rowsPath, report }, json, () => [
    `benchmark rows=${rows.length} unavailable=${unavailable} p50=${report.metrics.wallClockP50Ms}ms p95=${report.metrics.wallClockP95Ms}ms accuracy=${report.metrics.taskSuccessRate ?? 'null (no labels)'}`,
    `report: ${reportPath}`
  ])
  return unavailable === 0 ? 0 : EXIT_FAILURE
}

